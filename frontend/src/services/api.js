import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const taskApi = {
  getTasks: async (date = null, status = null) => {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (status) params.append('status', status);
    const response = await axios.get(`${API}/tasks?${params.toString()}`);
    return response.data;
  },

  getTask: async (taskId) => {
    const response = await axios.get(`${API}/tasks/${taskId}`);
    return response.data;
  },

  createTask: async (taskData) => {
    const response = await axios.post(`${API}/tasks`, taskData);
    return response.data;
  },

  updateTask: async (taskId, taskData) => {
    const response = await axios.put(`${API}/tasks/${taskId}`, taskData);
    return response.data;
  },

  deleteTask: async (taskId) => {
    const response = await axios.delete(`${API}/tasks/${taskId}`);
    return response.data;
  },

  parseTask: async (text) => {
    const response = await axios.post(`${API}/tasks/parse`, { text });
    return response.data;
  }
};

export const analyticsApi = {
  getAnalytics: async () => {
    const response = await axios.get(`${API}/analytics`);
    return response.data;
  }
};

export const usageApi = {
  getUsage: async () => {
    const response = await axios.get(`${API}/user/usage`);
    return response.data;
  }
};
