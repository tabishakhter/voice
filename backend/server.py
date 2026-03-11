from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
from openai import AsyncOpenAI
import asyncio
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'taskvoice-secret-key-change-in-production')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# LLM Key
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')

# Create the main app
app = FastAPI(title="TaskVoice AI API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

security = HTTPBearer()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== Models ====================

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    ai_requests_today: int = 0
    ai_request_date: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class TaskCreate(BaseModel):
    name: str
    scheduled_time: str  # ISO format
    duration_minutes: Optional[int] = None
    priority: str = "medium"  # high, medium, low

class TaskUpdate(BaseModel):
    name: Optional[str] = None
    scheduled_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    priority: Optional[str] = None
    status: Optional[str] = None  # pending, completed, missed

class TaskResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    name: str
    scheduled_time: str
    duration_minutes: Optional[int] = None
    priority: str
    status: str
    created_at: str

class ParseTaskRequest(BaseModel):
    text: str

class ParseTaskResponse(BaseModel):
    name: str
    scheduled_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    priority: str = "medium"
    raw_input: str

class AnalyticsResponse(BaseModel):
    total_tasks: int
    completed_tasks: int
    missed_tasks: int
    pending_tasks: int
    completion_rate: float

class UsageResponse(BaseModel):
    ai_requests_today: int
    ai_requests_limit: int
    requests_remaining: int

# ==================== Auth Helpers ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ==================== AI Helper ====================

AI_REQUEST_LIMIT = 15

async def check_ai_limit(user: dict) -> bool:
    """Check if user has remaining AI requests for today"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if user.get("ai_request_date") != today:
        # Reset counter for new day
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"ai_requests_today": 0, "ai_request_date": today}}
        )
        return True
    return user.get("ai_requests_today", 0) < AI_REQUEST_LIMIT

async def increment_ai_usage(user_id: str):
    """Increment AI usage counter"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    await db.users.update_one(
        {"id": user_id},
        {"$inc": {"ai_requests_today": 1}, "$set": {"ai_request_date": today}}
    )

async def parse_task_with_ai(text: str) -> dict:
    client_ai = AsyncOpenAI(api_key=OPENAI_API_KEY)
    response = await client_ai.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a task parser. Return ONLY valid JSON with fields: name, scheduled_time (ISO 8601), duration_minutes (or null), priority (high/medium/low). Today is: " + datetime.now(timezone.utc).strftime("%Y-%m-%d")},
            {"role": "user", "content": text}
        ]
    )
    try:
        cleaned = response.choices[0].message.content.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1]
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]
        return json.loads(cleaned.strip())
    except json.JSONDecodeError:
        return {"name": text, "scheduled_time": None, "duration_minutes": None, "priority": "medium"}

# ==================== Auth Routes ====================

@api_router.post("/auth/signup", response_model=TokenResponse)
async def signup(data: UserCreate):
    # Check if user exists
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": data.email,
        "name": data.name,
        "password_hash": hash_password(data.password),
        "ai_requests_today": 0,
        "ai_request_date": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    
    token = create_token(user_id)
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user_id,
            email=data.email,
            name=data.name,
            ai_requests_today=0
        )
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token = create_token(user["id"])
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            ai_requests_today=user.get("ai_requests_today", 0),
            ai_request_date=user.get("ai_request_date")
        )
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        ai_requests_today=user.get("ai_requests_today", 0),
        ai_request_date=user.get("ai_request_date")
    )

# ==================== Task Routes ====================

@api_router.post("/tasks", response_model=TaskResponse)
async def create_task(data: TaskCreate, user: dict = Depends(get_current_user)):
    task_id = str(uuid.uuid4())
    task_doc = {
        "id": task_id,
        "user_id": user["id"],
        "name": data.name,
        "scheduled_time": data.scheduled_time,
        "duration_minutes": data.duration_minutes,
        "priority": data.priority,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.tasks.insert_one(task_doc)
    
    return TaskResponse(**task_doc)

@api_router.get("/tasks", response_model=List[TaskResponse])
async def get_tasks(
    date: Optional[str] = None,
    status: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    query = {"user_id": user["id"]}
    
    if date:
        # Filter by date (tasks scheduled for that day)
        query["scheduled_time"] = {"$regex": f"^{date}"}
    
    if status:
        query["status"] = status
    
    tasks = await db.tasks.find(query, {"_id": 0}).sort("scheduled_time", 1).to_list(1000)
    return tasks

@api_router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(task_id: str, user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id, "user_id": user["id"]}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@api_router.put("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(task_id: str, data: TaskUpdate, user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id, "user_id": user["id"]})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if update_data:
        await db.tasks.update_one({"id": task_id}, {"$set": update_data})
    
    updated_task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    return updated_task

@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, user: dict = Depends(get_current_user)):
    result = await db.tasks.delete_one({"id": task_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task deleted"}

# ==================== AI Parse Route ====================

@api_router.post("/tasks/parse", response_model=ParseTaskResponse)
async def parse_task(data: ParseTaskRequest, user: dict = Depends(get_current_user)):
    # Check AI limit
    if not await check_ai_limit(user):
        raise HTTPException(
            status_code=429,
            detail="Daily AI request limit reached (15 requests/day)"
        )
    
    # Check cache first
    cache_key = data.text.lower().strip()
    cached = await db.parse_cache.find_one({"key": cache_key}, {"_id": 0})
    if cached:
        return ParseTaskResponse(
            name=cached["name"],
            scheduled_time=cached.get("scheduled_time"),
            duration_minutes=cached.get("duration_minutes"),
            priority=cached.get("priority", "medium"),
            raw_input=data.text
        )
    
    # Parse with AI
    parsed = await parse_task_with_ai(data.text)
    
    # Increment usage
    await increment_ai_usage(user["id"])
    
    # Cache the result
    await db.parse_cache.update_one(
        {"key": cache_key},
        {"$set": {
            "key": cache_key,
            "name": parsed["name"],
            "scheduled_time": parsed.get("scheduled_time"),
            "duration_minutes": parsed.get("duration_minutes"),
            "priority": parsed.get("priority", "medium"),
            "cached_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    return ParseTaskResponse(
        name=parsed["name"],
        scheduled_time=parsed.get("scheduled_time"),
        duration_minutes=parsed.get("duration_minutes"),
        priority=parsed.get("priority", "medium"),
        raw_input=data.text
    )

# ==================== Analytics Route ====================

@api_router.get("/analytics", response_model=AnalyticsResponse)
async def get_analytics(user: dict = Depends(get_current_user)):
    pipeline = [
        {"$match": {"user_id": user["id"]}},
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1}
        }}
    ]
    
    results = await db.tasks.aggregate(pipeline).to_list(100)
    
    status_counts = {r["_id"]: r["count"] for r in results}
    
    completed = status_counts.get("completed", 0)
    missed = status_counts.get("missed", 0)
    pending = status_counts.get("pending", 0)
    total = completed + missed + pending
    
    completion_rate = (completed / total * 100) if total > 0 else 0
    
    return AnalyticsResponse(
        total_tasks=total,
        completed_tasks=completed,
        missed_tasks=missed,
        pending_tasks=pending,
        completion_rate=round(completion_rate, 1)
    )

# ==================== Usage Route ====================

@api_router.get("/user/usage", response_model=UsageResponse)
async def get_usage(user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    if user.get("ai_request_date") != today:
        requests_today = 0
    else:
        requests_today = user.get("ai_requests_today", 0)
    
    return UsageResponse(
        ai_requests_today=requests_today,
        ai_requests_limit=AI_REQUEST_LIMIT,
        requests_remaining=max(0, AI_REQUEST_LIMIT - requests_today)
    )

# ==================== Root Route ====================

@api_router.get("/")
async def root():
    return {"message": "TaskVoice AI API", "version": "1.0.0"}

# Include the router in the main app
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
