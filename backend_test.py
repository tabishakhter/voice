#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime, timezone, timedelta

class TaskVoiceAPITester:
    def __init__(self, base_url="https://voiceremind-hub.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.created_tasks = []

    def log_test(self, name, success, details=""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED {details}")
        else:
            print(f"❌ {name} - FAILED {details}")
        return success

    def make_request(self, method, endpoint, data=None, expected_status=200, auth_required=True):
        """Make HTTP request to API"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if auth_required and self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)
            else:
                return False, None, f"Unsupported method: {method}"

            success = response.status_code == expected_status
            response_data = response.json() if response.content else {}
            
            return success, response_data, f"Status: {response.status_code}"
            
        except requests.exceptions.RequestException as e:
            return False, None, f"Request failed: {str(e)}"
        except json.JSONDecodeError as e:
            return False, None, f"JSON decode error: {str(e)}"

    def test_root_endpoint(self):
        """Test API root endpoint"""
        success, data, details = self.make_request('GET', '', auth_required=False)
        return self.log_test("API Root", success and data.get('message') == 'TaskVoice AI API', details)

    def test_signup(self, email="testuser@taskvoice.com", password="testpass123", name="Test User"):
        """Test user signup"""
        signup_data = {
            "email": email,
            "password": password,
            "name": name
        }
        success, data, details = self.make_request('POST', 'auth/signup', signup_data, 201, auth_required=False)
        
        if success and data.get('access_token'):
            self.token = data['access_token']
            self.user_id = data['user']['id']
            return self.log_test("User Signup", True, f"{details} - Token received")
        else:
            # If user already exists, try login instead
            if "already registered" in str(data.get('detail', '')):
                return self.test_login(email, password)
            return self.log_test("User Signup", False, f"{details} - {data}")

    def test_login(self, email="testuser@taskvoice.com", password="testpass123"):
        """Test user login"""
        login_data = {
            "email": email,
            "password": password
        }
        success, data, details = self.make_request('POST', 'auth/login', login_data, 200, auth_required=False)
        
        if success and data.get('access_token'):
            self.token = data['access_token']
            self.user_id = data['user']['id']
            return self.log_test("User Login", True, f"{details} - Token received")
        else:
            return self.log_test("User Login", False, f"{details} - {data}")

    def test_get_me(self):
        """Test get current user info"""
        success, data, details = self.make_request('GET', 'auth/me')
        
        expected_fields = ['id', 'email', 'name', 'ai_requests_today']
        has_all_fields = all(field in data for field in expected_fields) if data else False
        
        return self.log_test("Get User Info", success and has_all_fields, 
                           f"{details} - User: {data.get('name') if data else 'None'}")

    def test_create_task(self):
        """Test creating a task"""
        task_data = {
            "name": "Test Meeting",
            "scheduled_time": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
            "duration_minutes": 60,
            "priority": "high"
        }
        success, data, details = self.make_request('POST', 'tasks', task_data, 201)
        
        if success and data.get('id'):
            self.created_tasks.append(data['id'])
            return self.log_test("Create Task", True, f"{details} - Task ID: {data['id']}")
        else:
            return self.log_test("Create Task", False, f"{details} - {data}")

    def test_get_tasks(self):
        """Test getting user's tasks"""
        success, data, details = self.make_request('GET', 'tasks')
        
        is_list = isinstance(data, list)
        return self.log_test("Get Tasks", success and is_list, 
                           f"{details} - Found {len(data) if is_list else 0} tasks")

    def test_parse_task(self):
        """Test AI task parsing"""
        parse_data = {
            "text": "Gym at 9pm tomorrow"
        }
        success, data, details = self.make_request('POST', 'tasks/parse', parse_data)
        
        has_required_fields = data and all(field in data for field in ['name', 'priority', 'raw_input']) if data else False
        return self.log_test("AI Task Parsing", success and has_required_fields, 
                           f"{details} - Parsed: {data.get('name') if data else 'None'}")

    def test_update_task(self):
        """Test updating a task"""
        if not self.created_tasks:
            return self.log_test("Update Task", False, "No tasks to update")
        
        task_id = self.created_tasks[0]
        update_data = {
            "name": "Updated Test Meeting",
            "status": "completed"
        }
        success, data, details = self.make_request('PUT', f'tasks/{task_id}', update_data)
        
        return self.log_test("Update Task", success and data.get('name') == update_data['name'], details)

    def test_get_single_task(self):
        """Test getting a specific task"""
        if not self.created_tasks:
            return self.log_test("Get Single Task", False, "No tasks to retrieve")
        
        task_id = self.created_tasks[0]
        success, data, details = self.make_request('GET', f'tasks/{task_id}')
        
        return self.log_test("Get Single Task", success and data.get('id') == task_id, details)

    def test_analytics(self):
        """Test analytics endpoint"""
        success, data, details = self.make_request('GET', 'analytics')
        
        required_fields = ['total_tasks', 'completed_tasks', 'missed_tasks', 'pending_tasks', 'completion_rate']
        has_all_fields = all(field in data for field in required_fields) if data else False
        
        return self.log_test("Get Analytics", success and has_all_fields, 
                           f"{details} - Total tasks: {data.get('total_tasks') if data else 0}")

    def test_usage(self):
        """Test usage endpoint"""
        success, data, details = self.make_request('GET', 'user/usage')
        
        required_fields = ['ai_requests_today', 'ai_requests_limit', 'requests_remaining']
        has_all_fields = all(field in data for field in required_fields) if data else False
        
        return self.log_test("Get Usage", success and has_all_fields, 
                           f"{details} - AI requests: {data.get('ai_requests_today') if data else 0}")

    def test_delete_task(self):
        """Test deleting a task"""
        if not self.created_tasks:
            return self.log_test("Delete Task", False, "No tasks to delete")
        
        task_id = self.created_tasks[0]
        success, data, details = self.make_request('DELETE', f'tasks/{task_id}', expected_status=200)
        
        return self.log_test("Delete Task", success and data.get('message') == 'Task deleted', details)

    def run_all_tests(self):
        """Run complete test suite"""
        print("🚀 Starting TaskVoice AI API Tests")
        print(f"🌐 Testing against: {self.base_url}")
        print("=" * 60)
        
        # Basic connectivity
        self.test_root_endpoint()
        
        # Authentication
        self.test_signup()
        self.test_get_me()
        
        # Task operations (requires auth)
        if self.token:
            self.test_create_task()
            self.test_get_tasks()
            self.test_get_single_task()
            self.test_parse_task()
            self.test_update_task()
            self.test_analytics()
            self.test_usage()
            self.test_delete_task()
        else:
            print("❌ Skipping authenticated tests - no token")
        
        # Summary
        print("\n" + "=" * 60)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return 0
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} tests failed")
            return 1

def main():
    """Main test runner"""
    tester = TaskVoiceAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())