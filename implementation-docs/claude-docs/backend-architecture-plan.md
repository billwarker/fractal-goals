# Backend Architecture Improvement Plan

## Current State
- FastAPI backend serving API endpoints
- React frontend (Vite) running separately on port 3000
- SQLite database for data persistence
- Current architecture: API-only backend + separate frontend dev server

## Target State
- Flask backend serving both API endpoints and React pages
- Multiple routes for different views
- Integrated frontend build served by Flask
- Same SQLite database

## Implementation Steps

### 1. Create Flask Application Structure
- Create new `app.py` with Flask application
- Set up Flask blueprints for:
  - API routes (existing FastAPI endpoints)
  - Page routes (serving React app)
- Configure static file serving for React build

### 2. Migrate API Endpoints from FastAPI to Flask
- Convert FastAPI routes to Flask blueprints
- Maintain same endpoint structure for compatibility
- Keep existing request/response patterns
- Endpoints to migrate:
  - GET `/api/goals` - Get all root goals
  - POST `/api/goals` - Create new goal
  - PUT `/api/goals/{id}` - Update goal
  - PATCH `/api/goals/{id}/complete` - Toggle completion
  - DELETE `/api/goals/{id}` - Delete goal
  - GET `/api/practice-sessions` - Get all practice sessions
  - POST `/api/practice-sessions` - Create practice session

### 3. Create Page Routes
- `/` or `/selection` - Fractal selection page (home)
- `/fractal-goals` - Flow tree view (existing React app)
- `/sessions` - Sessions view (new feature)
- `/log` - Log session (new feature)
- `/programming` - Programming interface (new feature)

### 4. Build React Frontend
- Update React app to work with Flask routing
- Build production version of React app
- Configure Flask to serve built React files

### 5. Create New Features
- Sessions view component
- Log session component
- Programming interface component

### 6. Testing & Migration
- Test all existing functionality
- Ensure database compatibility
- Update documentation
- Create migration script

## File Structure (Proposed)

```
fractal-goals/
├── app.py                 # Main Flask application
├── blueprints/
│   ├── api.py            # API routes (migrated from server.py)
│   └── pages.py          # Page routes
├── models.py             # Keep existing SQLAlchemy models
├── goals.py              # Keep existing goal classes
├── client/               # React frontend
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Selection.jsx
│   │   │   ├── FractalGoals.jsx
│   │   │   ├── Sessions.jsx
│   │   │   ├── Log.jsx
│   │   │   └── Programming.jsx
│   │   └── App.jsx
│   └── dist/            # Built React app (served by Flask)
├── goals.db             # SQLite database
└── server.py            # Legacy FastAPI (keep for reference)
```

## Dependencies to Add
- Flask
- Flask-CORS
- Flask-RESTful (optional)

## Migration Strategy
1. Create Flask app alongside existing FastAPI
2. Test Flask endpoints match FastAPI behavior
3. Build React frontend for production
4. Switch to Flask server
5. Keep FastAPI server.py as backup

## Rollback Plan
- Keep server.py (FastAPI) intact
- Can switch back by running `python server.py` instead of `python app.py`
