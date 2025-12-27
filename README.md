# Fractal Goals

A hierarchical goal tracking and practice session management system built with Flask and React.

## Overview

Fractal Goals is a web application that helps you organize and track goals using a fractal hierarchy pattern. Each goal can have children, creating a tree structure from ultimate goals down to nano-level tasks. The system includes practice session tracking with activities, metrics, and templates.

## Architecture

### Tech Stack

**Frontend:**
- React 19.2.0 with Vite
- React Router for navigation
- ReactFlow for goal tree visualization
- Axios for API communication
- Runs on port **5173**

**Backend:**
- Flask with Flask-CORS
- SQLAlchemy ORM
- Blueprint-based API architecture
- Runs on port **8001**

**Database:**
- SQLite (`goals.db`)
- Single Table Inheritance pattern for goal hierarchy

### Goal Hierarchy

```
UltimateGoal
  └── LongTermGoal
        └── MidTermGoal
              └── ShortTermGoal
                    └── PracticeSession
                          └── ImmediateGoal
                                └── MicroGoal
                                      └── NanoGoal
```

### Project Structure

```
fractal-goals/
├── app.py                  # Main Flask application
├── models.py               # SQLAlchemy database models
├── goals.db                # SQLite database
│
├── blueprints/             # Flask blueprints
│   ├── api.py             # RESTful API endpoints
│   └── pages.py           # Web page routes
│
├── client/                 # React frontend
│   ├── src/
│   │   ├── App.jsx        # Main application component
│   │   ├── AppRouter.jsx  # Route configuration
│   │   ├── FlowTree.jsx   # Goal tree visualization
│   │   ├── components/    # Reusable components
│   │   ├── pages/         # Page components
│   │   └── utils/         # Utility functions
│   └── package.json
│
├── shell-scripts/          # Startup scripts
│   ├── start-all.sh       # Start both frontend and backend
│   ├── start-flask.sh     # Start Flask backend
│   └── start-frontend.sh  # Start React frontend
│
├── python-scripts/         # Utility scripts
│   ├── migrate_*.py       # Database migration scripts
│   ├── create_demo_*.py   # Demo data creation
│   └── debug_*.py         # Debugging utilities
│
├── legacy/                 # Deprecated code and backups
├── implementation-docs/    # Implementation documentation
└── my-implementation-plans/# Planning documents
```

## Setup

### Prerequisites

- Python 3.8+
- Node.js 16+
- npm or yarn

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd fractal-goals
   ```

2. **Set up Python virtual environment:**
   ```bash
   python -m venv fractal-goals-venv
   source fractal-goals-venv/bin/activate  # On Windows: fractal-goals-venv\Scripts\activate
   ```

3. **Install Python dependencies:**
   ```bash
   pip install flask flask-cors sqlalchemy
   ```

4. **Install frontend dependencies:**
   ```bash
   cd client
   npm install
   cd ..
   ```

5. **Initialize database:**
   The database will be created automatically on first run. To manually initialize:
   ```bash
   python -c "from models import get_engine, init_db; init_db(get_engine())"
   ```

## Running the Application

### Option 1: Start Everything (Recommended)

```bash
./shell-scripts/start-all.sh
```

This starts both the Flask backend and React frontend.

### Option 2: Start Services Individually

**Terminal 1 - Backend:**
```bash
./shell-scripts/start-flask.sh
```

**Terminal 2 - Frontend:**
```bash
./shell-scripts/start-frontend.sh
```

### Access the Application

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:8001/api
- **Health Check:** http://localhost:8001/health

## API Endpoints

### Fractals (Root Goals)

- `GET /api/fractals` - List all fractals
- `POST /api/fractals` - Create new fractal
- `DELETE /api/fractals/<root_id>` - Delete fractal

### Goals

- `GET /api/<root_id>/goals` - Get goal tree for fractal
- `POST /api/goals` - Create new goal
- `PUT /api/goals/<goal_id>` - Update goal
- `DELETE /api/goals/<goal_id>` - Delete goal
- `PATCH /api/goals/<goal_id>/complete` - Toggle completion

### Practice Sessions

- `GET /api/<root_id>/sessions` - Get all sessions for fractal
- `POST /api/<root_id>/sessions` - Create new session
- `PUT /api/<root_id>/sessions/<session_id>` - Update session
- `DELETE /api/<root_id>/sessions/<session_id>` - Delete session

### Session Templates

- `GET /api/<root_id>/session-templates` - Get all templates
- `POST /api/<root_id>/session-templates` - Create template
- `PUT /api/<root_id>/session-templates/<template_id>` - Update template
- `DELETE /api/<root_id>/session-templates/<template_id>` - Delete template

### Activities & Metrics

- `GET /api/<root_id>/activities` - Get activity definitions
- `POST /api/<root_id>/activities` - Create activity definition
- `POST /api/<root_id>/activities/<activity_id>/metrics` - Add metric definition

## Database Schema

### Main Tables

- **goals** - All goal types and practice sessions (Single Table Inheritance)
- **practice_session_goals** - Junction table for many-to-many relationships
- **activity_definitions** - Reusable activity templates
- **metric_definitions** - Metric types for activities
- **activity_instances** - Activity occurrences in sessions
- **metric_values** - Recorded metric values
- **session_templates** - Reusable session templates

## Development

### Database Migrations

Migration scripts are in `python-scripts/migrate_*.py`. To run a migration:

```bash
source fractal-goals-venv/bin/activate
python python-scripts/migrate_<name>.py
```

### Creating Demo Data

```bash
python python-scripts/create_demo_session.py
```

### Debugging

- Check `server.log` for backend logs
- Check `client/client.log` for frontend logs
- Use `python-scripts/debug_db.py` to inspect database

## Features

- ✅ Hierarchical goal management with 8 levels
- ✅ Practice session tracking with activities
- ✅ Customizable metrics for activities
- ✅ Session templates for recurring practices
- ✅ Visual goal tree with ReactFlow
- ✅ Multi-parent support for practice sessions
- ✅ Time tracking for activities
- ✅ Automatic goal completion based on targets
- ✅ Fractal-scoped data organization

## Contributing

This is a personal project. For major changes, please open an issue first to discuss what you would like to change.

## License

[Add your license here]

## Support

For issues or questions, please check the `implementation-docs/` folder for detailed documentation.
