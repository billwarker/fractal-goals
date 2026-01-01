# Fractal Goals - Project Index

> **⚠️ IMPORTANT FOR AI AGENTS:**
> 1. **READ THIS FILE FIRST** before starting any new task to understand the project context
> 2. **UPDATE THIS FILE** after completing tasks that add, modify, or remove core components
> 3. Keep this index current and accurate - it's the single source of truth for project structure

---

## Project Overview

**Fractal Goals** is a hierarchical goal tracking and practice session management system. It uses a fractal pattern where each goal can have children, creating a tree structure from ultimate life goals down to nano-level tasks. The system includes practice session tracking with customizable activities, metrics, timers, and reusable templates.

**Tech Stack:**
- **Backend:** Flask + SQLAlchemy + SQLite (port 8001)
- **Frontend:** React 19.2.0 + Vite + React Router + ReactFlow (port 5173)
- **Database:** SQLite with Single Table Inheritance pattern

---

## Core Features

### 1. Hierarchical Goal Management
- 8-level goal hierarchy: UltimateGoal → LongTermGoal → MidTermGoal → ShortTermGoal → PracticeSession → ImmediateGoal → MicroGoal → NanoGoal
- Visual tree representation using ReactFlow
- Goal completion tracking with targets
- Goal age calculation and display
- Multi-parent support for practice sessions

### 2. Practice Session Management
- Sessions are nodes in the goal tree (children of ShortTermGoals)
- Session start/end times with duration tracking
- Activity instances with timers
- Session templates for recurring practices
- Many-to-many relationship with ShortTermGoals via junction table

### 3. Activity System
- Reusable activity definitions organized by groups
- Customizable metrics (weight, reps, distance, etc.)
- Split support (e.g., left/right for exercises)
- Set-based tracking
- Multiplicative metrics for derived values
- Activity instances track actual performance in sessions

### 4. Time Tracking
- Activity-level timers with start/stop functionality
- Manual time entry support
- Duration calculation and display
- Session-level time analytics

### 5. Templates
- Reusable session templates
- Template creation from existing sessions
- Template editing and management

### 6. Multi-Environment Support
- Development, Testing, and Production environments
- Separate databases per environment (goals_dev.db, goals_test.db, goals_prod.db)
- Environment-specific configuration via .env files

---

## Database Schema

### Core Tables

#### `goals` (Single Table Inheritance)
All goal types and practice sessions share this table, differentiated by `type` column.

**Common Fields:**
- `id` (String, UUID, PK)
- `type` (String) - Goal type discriminator
- `name` (String)
- `description` (String)
- `deadline` (DateTime, nullable)
- `completed` (Boolean)
- `created_at` (DateTime)
- `updated_at` (DateTime)
- `parent_id` (String, FK to goals.id)
- `root_id` (String) - Reference to ultimate goal
- `targets` (Text/JSON) - Goal targets for completion tracking

**PracticeSession-Specific Fields:**
- `duration_minutes` (Integer)
- `session_start` (DateTime)
- `session_end` (DateTime)
- `total_duration_seconds` (Integer)
- `template_id` (String)
- `attributes` (Text/JSON) - Flexible session data storage
- `session_data` (Text/JSON) - DEPRECATED, use attributes

**Goal Types:**
- UltimateGoal
- LongTermGoal
- MidTermGoal
- ShortTermGoal
- PracticeSession
- ImmediateGoal
- MicroGoal
- NanoGoal

**Relationships:**
- Self-referential parent-child via `parent_id`
- PracticeSession has many ActivityInstances
- PracticeSession has many-to-many with ShortTermGoals via `practice_session_goals`

#### `practice_session_goals` (Junction Table)
Links PracticeSessions to multiple ShortTermGoals (many-to-many).

**Fields:**
- `practice_session_id` (String, FK to goals.id, PK)
- `short_term_goal_id` (String, FK to goals.id, PK)

#### `activity_groups`
Organizes activities into families/categories.

**Fields:**
- `id` (String, UUID, PK)
- `root_id` (String, FK to goals.id)
- `name` (String)
- `description` (String)
- `created_at` (DateTime)
- `sort_order` (Integer)

#### `activity_definitions`
Reusable activity templates.

**Fields:**
- `id` (String, UUID, PK)
- `root_id` (String, FK to goals.id)
- `name` (String)
- `description` (String)
- `created_at` (DateTime)
- `has_sets` (Boolean)
- `has_metrics` (Boolean)
- `metrics_multiplicative` (Boolean)
- `has_splits` (Boolean)
- `group_id` (String, FK to activity_groups.id)

**Relationships:**
- Has many MetricDefinitions
- Has many SplitDefinitions

#### `metric_definitions`
Defines metrics for activities (e.g., weight, reps, distance).

**Fields:**
- `id` (String, UUID, PK)
- `activity_id` (String, FK to activity_definitions.id)
- `name` (String)
- `unit` (String)
- `created_at` (DateTime)
- `deleted_at` (DateTime, nullable)
- `is_active` (Boolean)
- `is_top_set_metric` (Boolean) - Determines which metric defines "top set"
- `is_multiplicative` (Boolean) - Include in product calculations

#### `split_definitions`
Defines splits for activities (e.g., left/right).

**Fields:**
- `id` (String, UUID, PK)
- `activity_id` (String, FK to activity_definitions.id)
- `name` (String)
- `order` (Integer)
- `created_at` (DateTime)

#### `activity_instances`
Actual activity occurrences within practice sessions.

**Fields:**
- `id` (String, UUID, PK)
- `practice_session_id` (String, FK to goals.id)
- `activity_definition_id` (String, FK to activity_definitions.id)
- `created_at` (DateTime)
- `time_start` (DateTime, nullable)
- `time_stop` (DateTime, nullable)
- `duration_seconds` (Integer, nullable)

**Relationships:**
- Belongs to PracticeSession
- Belongs to ActivityDefinition
- Has many MetricValues

#### `metric_values`
Recorded metric values for activity instances.

**Fields:**
- `id` (String, UUID, PK)
- `activity_instance_id` (String, FK to activity_instances.id)
- `metric_definition_id` (String, FK to metric_definitions.id)
- `split_definition_id` (String, FK to split_definitions.id, nullable)
- `value` (Float)

#### `session_templates`
Reusable session templates.

**Fields:**
- `id` (String, UUID, PK)
- `name` (String)
- `description` (String)
- `root_id` (String, FK to goals.id)
- `created_at` (DateTime)
- `template_data` (String/JSON)

---

## Backend API Structure

### Blueprints (in `/blueprints/`)

#### `goals_api.py`
Manages goal hierarchy and CRUD operations.

**Key Endpoints:**
- `GET /api/fractals` - List all root goals (fractals)
- `POST /api/fractals` - Create new fractal
- `DELETE /api/fractals/<root_id>` - Delete fractal and all descendants
- `GET /api/<root_id>/goals` - Get goal tree for fractal
- `POST /api/goals` - Create new goal
- `PUT /api/goals/<goal_id>` - Update goal
- `DELETE /api/goals/<goal_id>` - Delete goal recursively
- `PATCH /api/goals/<goal_id>/complete` - Toggle goal completion
- `POST /api/goals/<goal_id>/targets` - Add target to goal
- `DELETE /api/goals/<goal_id>/targets/<target_id>` - Remove target

#### `sessions_api.py`
Manages practice sessions.

**Key Endpoints:**
- `GET /api/<root_id>/sessions` - Get all sessions for fractal
- `GET /api/<root_id>/sessions/<session_id>` - Get specific session
- `POST /api/<root_id>/sessions` - Create new session
- `PUT /api/<root_id>/sessions/<session_id>` - Update session
- `DELETE /api/<root_id>/sessions/<session_id>` - Delete session
- `POST /api/<root_id>/sessions/<session_id>/activities` - Add activity to session
- `DELETE /api/<root_id>/sessions/<session_id>/activities/<instance_id>` - Remove activity
- `PUT /api/<root_id>/sessions/<session_id>/activities/<instance_id>` - Update activity instance
- `POST /api/<root_id>/sessions/<session_id>/activities/reorder` - Reorder activities

#### `activities_api.py`
Manages activity definitions, groups, metrics, and splits.

**Key Endpoints:**
- `GET /api/<root_id>/activities` - Get all activity definitions
- `POST /api/<root_id>/activities` - Create activity definition
- `PUT /api/<root_id>/activities/<activity_id>` - Update activity
- `DELETE /api/<root_id>/activities/<activity_id>` - Delete activity
- `GET /api/<root_id>/activity-groups` - Get all activity groups
- `POST /api/<root_id>/activity-groups` - Create activity group
- `PUT /api/<root_id>/activity-groups/<group_id>` - Update group
- `DELETE /api/<root_id>/activity-groups/<group_id>` - Delete group
- `POST /api/<root_id>/activities/<activity_id>/metrics` - Add metric definition
- `PUT /api/<root_id>/activities/<activity_id>/metrics/<metric_id>` - Update metric
- `DELETE /api/<root_id>/activities/<activity_id>/metrics/<metric_id>` - Delete metric
- `POST /api/<root_id>/activities/<activity_id>/splits` - Add split definition
- `DELETE /api/<root_id>/activities/<activity_id>/splits/<split_id>` - Delete split

#### `timers_api.py`
Manages activity timers and time tracking.

**Key Endpoints:**
- `POST /api/<root_id>/activity-instances` - Create activity instance (without starting timer)
- `PUT /api/<root_id>/activity-instances/<instance_id>` - Update activity instance times
- `POST /api/<root_id>/activity-instances/<instance_id>/start` - Start activity timer
- `POST /api/<root_id>/activity-instances/<instance_id>/stop` - Stop activity timer

#### `templates_api.py`
Manages session templates.

**Key Endpoints:**
- `GET /api/<root_id>/session-templates` - Get all templates
- `POST /api/<root_id>/session-templates` - Create template
- `PUT /api/<root_id>/session-templates/<template_id>` - Update template
- `DELETE /api/<root_id>/session-templates/<template_id>` - Delete template

#### `pages.py`
Serves static pages (minimal usage, mostly SPA).

---

## Frontend Component Structure

### Main Application Files (in `/client/src/`)

- **`main.jsx`** - Application entry point
- **`AppRouter.jsx`** - Route configuration and navigation
- **`FlowTree.jsx`** - ReactFlow-based goal tree visualization
- **`App.css`** - Global styles
- **`index.css`** - Base styles

### Pages (in `/client/src/pages/`)

#### `FractalGoals.jsx`
Main fractal view page with goal tree visualization and sidebar.

**Features:**
- ReactFlow tree display
- Goal creation/editing via modals
- Goal completion toggling
- Sidebar with goal details
- Target management

#### `Sessions.jsx`
Practice sessions list and management.

**Features:**
- Session list with filtering
- Session creation from templates
- Session deletion
- Navigation to session detail

#### `SessionDetail.jsx`
Detailed view of a single practice session.

**Features:**
- Activity management (add, remove, reorder)
- Activity timers (start, stop, manual entry)
- Metric value recording
- Session time editing
- Activity instance creation and updates

#### `ManageActivities.jsx`
Activity definition management page.

**Features:**
- Activity list by group
- Activity creation/editing via ActivityBuilder
- Activity group management
- Activity deletion

#### `CreateSessionTemplate.jsx`
Session template creation and management.

**Features:**
- Template creation from scratch
- Template editing
- Template loading
- Custom modals for confirmations

#### `Analytics.jsx`
Analytics and reporting page.

**Features:**
- Activity performance tracking
- Metric trends
- Session statistics

#### `Programming.jsx`
Programming-specific features (future expansion).

#### `Log.jsx`
Activity log and history.

#### `Selection.jsx`
Fractal selection page.

### Components (in `/client/src/components/`)

#### Core Components

- **`Sidebar.jsx`** - Sidebar for goal details and editing
- **`FractalView.jsx`** - Wrapper for fractal visualization
- **`ActivityBuilder.jsx`** - Modal for creating/editing activity definitions
- **`ActivitiesManager.jsx`** - Activity selection and management interface
- **`ActivityCard.jsx`** - Card display for activities
- **`SessionActivityItem.jsx`** - Activity item in session with timer controls
- **`AddTargetModal.jsx`** - Modal for adding targets to goals
- **`TargetCard.jsx`** - Display card for targets
- **`ConfirmationModal.jsx`** - Reusable confirmation dialog

#### Modal Components (in `/client/src/components/modals/`)

- **`AddChildModal.jsx`** - Modal for adding child goals
- **`CreateFractalModal.jsx`** - Modal for creating new fractals
- **`EditGoalModal.jsx`** - Modal for editing goal details
- **`SessionCreationModal.jsx`** - Modal for creating sessions
- **`TemplateSelectionModal.jsx`** - Modal for selecting templates

#### Analytics Components (in `/client/src/components/analytics/`)

- Analytics-specific visualization components

### Contexts (in `/client/src/contexts/`)

- **`GoalContext.jsx`** - Global state for goals
- **`SessionContext.jsx`** - Global state for sessions
- **`ActivityContext.jsx`** - Global state for activities
- **`TimezoneContext.jsx`** - Global timezone management

### Utilities (in `/client/src/utils/`)

- **`api.js`** - Axios-based API client with all endpoint functions
- **`dateUtils.js`** - Date formatting and timezone utilities
- **`goalColors.js`** - Color schemes for goal types
- **`goalHelpers.js`** - Goal hierarchy and validation helpers
- **`metricsHelpers.js`** - Metric calculation utilities
- **`targetUtils.js`** - Target validation and progress calculation

---

## Startup Scripts

### Environment Scripts (in `/shell-scripts/`)

- **`start-all.sh [environment]`** - Start both backend and frontend
  - Environments: `development` (default), `testing`, `production`
  - Creates log files in `/logs/`
  - Returns PIDs for process management

- **`start-flask.sh [environment]`** - Start Flask backend only
  - Activates virtual environment
  - Loads environment-specific .env file
  - Runs on port 8001

- **`start-frontend.sh [environment]`** - Start React frontend only
  - Uses Vite dev server
  - Loads environment-specific mode
  - Runs on port 5173

- **`kill-all.sh`** - Stop all running processes
  - Kills Flask and Vite processes
  - Cleans up background jobs

### Python Utility Scripts (in `/python-scripts/`)

- **Migration Scripts:** `migrate_*.py` - Database schema migrations
- **Demo Data:** `create_demo_*.py` - Create sample data for testing
- **Debug Tools:** `debug_*.py` - Database inspection and debugging utilities

---

## Environment Configuration

### Environment Files

- **`.env.development`** - Development settings (uses `goals_dev.db`)
- **`.env.testing`** - Testing settings (uses `goals_test.db`)
- **`.env.production`** - Production settings (uses `goals_prod.db`)
- **`.env.example`** - Template for environment files

### Key Environment Variables

- `ENV` - Environment name (development/testing/production)
- `FLASK_APP` - Flask application entry point
- `FLASK_ENV` - Flask environment mode
- `DATABASE_PATH` - Path to SQLite database
- `VITE_API_URL` - Frontend API URL configuration

### Database Files

- `goals_dev.db` - Development database
- `goals_test.db` - Testing database
- `goals.db` - Main database used by all environments (development, testing, production)

---

## Recent Major Changes & Known Issues

### Recent Fixes (as of Dec 2025)

1. **Activity Timer Errors** - Fixed "Activity instance not found" errors by:
   - Adding `POST /<root_id>/activity-instances` endpoint to create instances without starting timer
   - Updating `SessionDetail.jsx` to create instances immediately when activities are added
   - Adding useEffect to create missing instances on session load

2. **Session Template Management** - Fixed template editing:
   - Modified `handleLoadTemplate` to store template ID
   - Updated `handleSaveTemplate` to conditionally update vs. create
   - Replaced browser modals with custom UI modals

3. **Environment Data Loading** - Fixed production environment:
   - Corrected frontend API configuration to use `VITE_API_URL`
   - Ensured no hardcoded API URLs override environment variables

4. **Timer Datetime Inputs** - Improved usability:
   - Changed datetime inputs from `datetime-local` to `text` type
   - Added placeholders for format guidance

5. **Goal Age Display** - Implemented age calculation:
   - Added `created_at` to Goal model
   - Created age calculation helper in frontend
   - Display age in fractal UI and sidebar

6. **Timer Stop Validation** - Fixed timer stop behavior (Dec 31, 2025):
   - Modified `stop_activity_timer` endpoint to return error when timer was never started
   - Prevents setting both `time_start` and `time_stop` to the same value
   - Added clear error messages guiding users to click "Start" first or use manual time entry
   - Ensures data integrity for session duration tracking

7. **Activity Instance Deletion Bug** - Fixed critical auto-save issue (Dec 31, 2025):
   - **Root Cause**: `sync_session_activities` was deleting instances with timer data during auto-save
   - **Fix**: Modified orphan cleanup to preserve instances with `time_start` or `time_stop` set
   - **Location**: `/blueprints/sessions_api.py` lines 104-112
   - **Architectural Note**: See `ARCHITECTURE_NOTES.md` for discussion of dual source of truth issue
   - This was a recurring problem due to storing activity data in both JSON and relational tables

8. **Activity Instance Architecture Migration** (Jan 01, 2026):
   - Fully migrated from dual source of truth (JSON + DB) to **Database-Only Architecture** (Option A).
   - `ActivityInstance` data is now SOLELY managed in the relational database.
   - `session_data` JSON now only stores UI metadata (section names, ordering via `activity_ids`).
   - Refactored `SessionDetail.jsx` to fetch instances separately and use specific API endpoints for all modifications.
   - Removed fragile synchronization logic (`sync_session_activities`) from session auto-save.
   - Implemented **Read-Time Hydration** in `PracticeSession.to_dict()`: `session_data.sections[].exercises` are now reconstructed on-the-fly from `ActivityInstances` to ensure listing pages (like `/sessions`) work correctly without duplication.

9. **Database Schema Update for Activity Persistence** (Jan 01, 2026):
   - Added `completed` (BOOLEAN), `notes` (TEXT), and `data` (TEXT/JSON) columns to `activity_instances` table.
   - This prevents data loss for "sets" and other activity-specific data that isn't native to the relational model but was supported in the old JSON architecture.
   - Updated `models.py` and `timers_api.py` to handle these fields.

### Known Issues & To-Do Items

From `/my-implementation-plans/features.txt`:

**Completed:**
- ✅ Re-order activity order in sessions
- ✅ Session start/end time adjustments
- ✅ Card layout for activity management
- ✅ Activity builder as separate component
- ✅ Activity groups (families)

**To-Do:**
- ⏳ Allow adjustments to estimated time in sessions
- ⏳ Practice sessions show session start date instead of age
- ⏳ Toggle hiding practice sessions from fractal view
- ⏳ Add immediate goals to practice sessions
- ⏳ SMART mode for goals
- ⏳ Programming section enhancements
- ⏳ Detailed notes interface (multiple notes per set, new DB table)
- ⏳ Additional programming features
- ⏳ Search functionality for activities
- ⏳ Improve "add practice session" functionality in fractal UI
- ⏳ Make duration updates more sensible

---

## Development Guidelines

### For AI Agents Working on This Project

1. **Always read this file first** to understand the current state of the project
2. **Check recent changes** section to avoid re-implementing fixes
3. **Update this file** after making significant changes to:
   - Database schema
   - API endpoints
   - Frontend components
   - Features
   - Known issues
4. **Follow existing patterns:**
   - Use blueprint structure for new API endpoints
   - Follow Single Table Inheritance for goal types
   - Use context providers for global state
   - Maintain environment separation
5. **Test across environments** when making infrastructure changes
6. **Document breaking changes** in this file
7. **Keep the To-Do list updated** as features are completed

### Code Organization Principles

- **Backend:** Blueprint-based API organization by domain (goals, sessions, activities, timers, templates)
- **Frontend:** Page-based routing with shared components and contexts
- **Database:** Single Table Inheritance for goal hierarchy, separate tables for activities/metrics
- **State Management:** React Context for global state, local state for component-specific data
- **Styling:** Component-scoped CSS with global theme variables

---

## Quick Reference

### Common Tasks

**Start the application:**
```bash
./shell-scripts/start-all.sh [development|testing|production]
```

**Access the app:**
- Frontend: http://localhost:5173
- Backend: http://localhost:8001
- Health check: http://localhost:8001/health

**View logs:**
```bash
tail -f logs/development_backend.log
tail -f logs/development_frontend.log
```

**Stop all services:**
```bash
./shell-scripts/kill-all.sh
```

**Run database migration:**
```bash
source fractal-goals-venv/bin/activate
python python-scripts/migrate_<name>.py
```

### Important File Locations

- **Database models:** `/models.py`
- **Migration Guides:** `/MIGRATION_GUIDE.md`
- **Flask app:** `/app.py`
- **API blueprints:** `/blueprints/`
- **Frontend entry:** `/client/src/main.jsx`
- **API client:** `/client/src/utils/api.js`
- **Environment config:** `/.env.*` files
- **Logs:** `/logs/`

---

**Last Updated:** 2025-12-31  
**Version:** 1.0.0  
**Maintained By:** Project AI Agents
