# TaskVoice AI - Product Requirements Document

## Overview
TaskVoice AI is a mobile-friendly voice-based smart task manager and reminder system. Users can add tasks using voice or text input, with AI-powered parsing to extract task details.

## Original Problem Statement
Build a mobile-friendly web app called "TaskVoice AI" - a voice-based smart task manager with:
- Voice/text task input with AI parsing
- Daily schedule timeline
- Push notifications with TTS reminders
- Task management (edit/delete/reschedule)
- Analytics dashboard
- Dark/light mode
- 15 AI requests/day limit

## User Personas
1. **Productivity Enthusiast**: Busy professional who needs quick task capture on-the-go
2. **Student**: Organizes study sessions and class schedules
3. **Casual User**: Simple daily task management

## Core Requirements (Static)
- JWT-based authentication (login/signup)
- Voice input using Browser Speech Recognition API
- Text input for tasks
- AI task parsing using GPT-4o-mini via Emergent LLM Key
- MongoDB task storage
- Daily timeline view with task grouping (Morning/Afternoon/Evening)
- Task CRUD operations (Create, Read, Update, Delete)
- Task completion/missed tracking
- Analytics dashboard with completion rate
- Push notifications (browser Notification API)
- Text-to-Speech reminders (browser SpeechSynthesis)
- Dark/light mode toggle (default: dark)
- Mobile-first responsive design
- 15 AI requests/day rate limiting with caching

## Tech Stack
- **Frontend**: React 19, Tailwind CSS, Shadcn UI, lucide-react icons
- **Backend**: FastAPI, Python
- **Database**: MongoDB (via Motor async driver)
- **AI**: OpenAI GPT-4o-mini via Emergent integrations library
- **Authentication**: JWT tokens with bcrypt password hashing

## What's Been Implemented (Jan 31, 2026)

### Backend (/app/backend/server.py)
- [x] User authentication (signup/login/me endpoints)
- [x] Task CRUD endpoints
- [x] AI task parsing endpoint with GPT-4o-mini
- [x] Analytics endpoint
- [x] Usage tracking endpoint
- [x] Parse cache to avoid duplicate AI calls
- [x] 15 requests/day limit per user

### Frontend
- [x] Auth page with login/signup tabs
- [x] Dashboard with timeline view
- [x] Voice input with speech recognition
- [x] Text input for tasks
- [x] Task cards with priority indicators
- [x] Edit/Delete/Complete actions
- [x] Analytics page with stats
- [x] Dark/light mode toggle
- [x] Push notification support
- [x] TTS task reminders
- [x] Mobile-first responsive design

## P0/P1/P2 Features

### P0 (Completed)
- [x] User authentication
- [x] Task creation via text/voice
- [x] AI task parsing
- [x] Timeline view
- [x] Task management
- [x] Analytics

### P1 (Next Phase)
- [ ] Reschedule missed tasks functionality
- [ ] Service Worker for offline support
- [ ] PWA manifest for app installation
- [ ] Date picker to view other days' tasks

### P2 (Future)
- [ ] Hindi/Hinglish voice support
- [ ] Android app structure preparation
- [ ] Weekly/monthly analytics views
- [ ] Task categories/tags
- [ ] Recurring tasks
- [ ] Export tasks to calendar

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/signup | Create new account |
| POST | /api/auth/login | Login and get token |
| GET | /api/auth/me | Get current user |
| GET | /api/tasks | List tasks (optional date filter) |
| POST | /api/tasks | Create task |
| PUT | /api/tasks/{id} | Update task |
| DELETE | /api/tasks/{id} | Delete task |
| POST | /api/tasks/parse | AI parse text to task |
| GET | /api/analytics | Get task statistics |
| GET | /api/user/usage | Get AI usage stats |

## Environment Variables

### Backend (.env)
- MONGO_URL
- DB_NAME
- CORS_ORIGINS
- EMERGENT_LLM_KEY

### Frontend (.env)
- REACT_APP_BACKEND_URL

## Deployment Notes
User requested Vercel deployment. For Vercel:
1. Frontend: Deploy /app/frontend as static build
2. Backend: Deploy as Python serverless function or separate service
3. MongoDB: Use MongoDB Atlas for cloud database

## Next Action Items
1. Add date picker to view tasks for different days
2. Implement missed task rescheduling
3. Add PWA manifest and service worker
4. Test Hindi/Hinglish voice recognition
