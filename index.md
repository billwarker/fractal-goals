# Fractal Goals - Project Index

> **⚠️ IMPORTANT FOR AI AGENTS:**
> 1. **READ THIS FILE FIRST** before starting any new task to understand the project context
> 2. **UPDATE THIS FILE** after completing tasks that add, modify, or remove core components
> 3. Keep this index current and accurate - it's the single source of truth for project structure

---

## Project Overview

**Fractal Goals** is a hierarchical goal tracking system that connects ultimate life goals down to granular practice sessions.

**Core Tech Stack:**
- **Backend:** Flask (Port 8001) with SQLAlchemy (PostgreSQL/SQLite) & JWT Auth.
- **Frontend:** React 19 + Vite (Port 5173) with ReactFlow for visualization.
- **Infrastructure:** Docker for database, Alembic for migrations.

## Status & Recent Changes

### Phase 2: Core Architecture (Current)
- **Goal Level Characteristics:** Expanded `GoalLevel` model with 12 behavioral characteristics (deadline constraints, hierarchy behavior, feature gates, content requirements, display). Settings UI in `GoalCharacteristicsSettings.jsx`. Backend enforces `allow_manual_completion` (403) and `requires_smart` (400) in completion endpoint. `auto_complete_when_children_done` level default cascades via event bus. Deleted superseded `goalColors.js`, cleaned up `goalCharacteristics.js`.
- **Database Refactoring:** Split monolithic `models.py` into domain-specific modules (`models/user.py`, `models/goal.py`, etc.).
- **Frontend State Consolidation:** Centralized session detail logic into `ActiveSessionContext.jsx`, eliminating significant prop drilling and standardizing state management with TanStack Query.
- **Backend Stability:** Fixed critical recursion/serialization bugs, improved error logging, and resolved session retrieval API gaps.
- **Legacy Cleanup:** Removed deprecated `PracticeSession` aliases and unused fields.

### Key Features Added (v1.x)
- **Micro/Nano Goals:** Added sub-session granularity for detailed tracking.
- **Service Layer:** Introduced `SessionService` and `ProgramService` to decouple logic from blueprints.
- **Event-Driven Architecture:** Implemented a global Event Bus for cascading updates (e.g., Session Complete -> Target Achieved -> Goal Complete).
- **SMART Goals:** Integrated SMART criteria tracking with visual indicators in the visualization tree.
- **Timezone Support:** Global timezone handling for accurate session verification.

---

## Core Features

1.  **Hierarchical Goals:** 7-level fractal tree (Ultimate -> Nano) visualized with ReactFlow.
2.  **Session Management:**
    -   Track practice sessions with start/stop timers and duration logic.
    -   Link sessions to goals (ShortTerm/Immediate/Micro) via `session_goals`.
    -   **Goals Panel:** Integrated side-pane for managing session-specific Micro/Nano goals.
3.  **Activity System:**
    -   Reusable definitions with custom metrics (reps, weight, distance).
    -   Supports sets, splits (left/right), and multiplicative metrics.
4.  **Programs & Templates:**
    -   Create reusable session templates.
    -   Build macro-cycles (Programs) with meso-cycles (Blocks) and micro-cycles (Days).
5.  **SMART Goals:**
    -   Visual indicators for Specific, Measurable, Achievable, Relevant, Time-bound criteria.
    -   Automatic completion via target achievement events.
6.  **Analytics & Visualization:**
    -   Heatmaps, line graphs, and scatter plots with interactive annotations.
    -   Event-driven logging for full audit history.

### 9. Database & Migrations

**Database Support:**
- **Development:** PostgreSQL via Docker (preferred) or SQLite
- **Production:** PostgreSQL (Cloud instance like Supabase, Neon, or RDS)

**Local PostgreSQL Setup:**
1. Ensure Docker Desktop is running.
2. The infrastructure is defined in `docker-compose.yml`.
3. Start the database:
   ```bash
   docker compose up -d
   ```
4. Connectivity: `DATABASE_URL=postgresql://fractal:fractal_dev_password@localhost:5432/fractal_goals`

**Alembic Migrations:**
Located in `/migrations/` directory. Use the helper script:

```bash
# Initialize/Stamp database
python db_migrate.py init

# Apply pending migrations
python db_migrate.py upgrade

# Create new migration
python db_migrate.py create "Add feature"
```

**Data Migration (SQLite -> PostgreSQL):**
Use the custom migration script to transfer existing SQLite data to a new PostgreSQL instance:
```bash
python migrate_sqlite_to_postgres.py --source goals_dev.db --clean
```

**Key Files:**
- `docker-compose.yml` - Local database infrastructure
- `db_migrate.py` - Migration helper
- `migrate_sqlite_to_postgres.py` - Data transfer tool
- `alembic.ini` & `migrations/` - Schema versioning

**Performance Optimizations:**
- **Connection Pooling:** `get_engine()` uses a singleton pattern with `QueuePool` for PostgreSQL (pool_size=10, max_overflow=20, pool_pre_ping=True)
- **Database Indexes:** Migration `b8e4a72f9d31` adds indexes on frequently queried columns:
  - `sessions`: root_id, deleted_at, created_at, completed, (root_id, deleted_at)
  - `goals`: root_id, deleted_at, parent_id, type, (root_id, type)
  - `activity_instances`: session_id, deleted_at, activity_definition_id
  - `activity_definitions`, `activity_groups`, `programs`, `session_templates`: root_id
- **Scoped Sessions:** `get_scoped_session()` provides thread-local sessions with automatic cleanup via Flask's `teardown_appcontext`
- **Batched Analytics:** Analytics endpoint uses 3 batch queries instead of N+1 pattern
- **Eager Loading:** Session and Goal endpoints use `selectinload()` for goals, notes, activity_instances, and recursive goal children (avoids N+1 query pattern)
- **Recursive Tree Optimization:** The main fractal tree fetcher (`get_fractal_goals`) uses a specialized recursive `selectinload` to fetch the entire 7-level hierarchy and all SMART status associations in one operation.
- **SMART Status Optimization:** `Goal.to_dict()` associations are now eagerly loaded in all common query paths, preventing database waterfalls during serialization.
- **Composite Indexing:** Optimized common query patterns with multi-column indexes:
  - `ix_goals_root_deleted_type`: (root_id, deleted_at, type)
  - `ix_goals_root_parent_deleted`: (root_id, parent_id, deleted_at)
  - `ix_sessions_root_deleted_completed`: (root_id, deleted_at, completed)
  - `ix_activity_instances_session_deleted`: (session_id, deleted_at)
  - `ix_notes_root_context_deleted`: (root_id, context_type, context_id, deleted_at)
- **Additional Foreign Key Indexes:** Migration `94a9feab5041` added indexes to `activity_definitions.group_id`, `activity_instances.activity_definition_id`, `metric_definitions.activity_id`, `split_definitions.activity_id`, `program_blocks.program_id`, and `program_days.block_id`.
- **Program Day Session N+1 Resolution:** `serialize_program_day_session_light` reduces frontend payload nesting to prevent N+1 serialization bloat on the Programs page.
- **Frontend Code Splitting:** Implemented `React.lazy` and `Suspense` in `AppRouter.jsx` to lazy load non-critical pages (Programs, Sessions, Analytics, Logs), reducing initial bundle size.
- **API Rate Limiting:** Implemented strict rate limits on goal/fractal creation endpoints via `Flask-Limiter`.
- **TanStack Query (React Query):** Implemented on the frontend for `GoalsContext` and `SessionsContext`:
  - Automatic caching with `staleTime: 60s` and `cacheTime: 5m`.
  - Automatic cache invalidation on mutations (create/update/delete).
  - Background revalidation prevents stale data while maintaining "instant" UI feel.
  - **Mutation Return Values:** Mutations consistently return `response.data` rather than the full Axios response object, preventing stale UI states and empty modals when updating entities.
- **Robust JSON Handling:** Standardized backend JSON parsing across all blueprints using `models._safe_load_json`. This ensures compatibility between SQLite (which returns JSON as strings) and PostgreSQL (which returns `JSONB` as native Python dictionaries), preventing `TypeError` during deserialization in production.
- **Server-Side Compression:** `flask-compress` enabled on backend. Reduces large JSON payloads (fractal tree) by up to 90%.
- **Native JSONB Storage:** Optimized metadata storage using PostgreSQL `JSONB` for targets, attributes, and templates. Enables binary indexing and removes serialization overhead in Python.
- **Pagination:** Sessions list API returns paginated results (default: 10 per page, max: 50)
  - API: `GET /<root_id>/sessions?limit=10&offset=0` → `{sessions: [...], pagination: {limit, offset, total, has_more}}`
  - Frontend: Sessions page has "Load More" button to fetch additional sessions
  - Notes image_data excluded from list view (only loaded in detail view) to reduce response size
- **Service Layer Serialization**: All API responses are now serialized via [serializers.py](file:///Users/will/Projects/fractal-goals/services/serializers.py). Models no longer have `to_dict()` methods. This ensures consistent field naming, date formatting, and secure handling of sensitive data.
- **Nested Contextual Data**: Serializers for `Session`, `ProgramDay`, and `ActivityInstance` now automatically include their associated `notes` (filtered by context IDs) to ensure the frontend has immediate access to timeline data without secondary fetches.
- **Strict Pydantic Validation**: All POST/PUT requests are validated via `@validate_request` decorator in [validators.py](file:///Users/will/Projects/fractal-goals/validators.py), ensuring data integrity before processing.

### 10. Visualization Annotations
- **Universal Annotation System:** Allows users to annotate specific data points on any analytical visualization (heatmap, scatter plot, line graph, etc.).
- **Drag-to-Select Interface:** Users can drag to select a range of data points (cells in heatmap, region in charts) to annotate.
- **Visual Feedback:** Selection is highlighted, and annotated regions are marked with interactive indicators.
- **Persistence:** Annotations are stored in the database linked to the visualization type, context (e.g., specific activity), and selected data points.
- **Timezone Localization**: Implemented global timezone selection in Settings (General tab) and updated all components to use `useTimezone` for consistent, localized datetime displays across the app.
- **Activity Heatmap Fixes:** Improved crash resilience by handling non-array API responses and added interactive highlighting synchronized with the sidebar.

### 11. Profile Window & Unified Navigation
- **Breadcrumb-Style Navigation:** Visualizations now use a single unified header that replaces buttons as you drill down (Category → Visualization → Configuration).
- **Navigation Controls:** Added [🏠 Top] and [⬅️ Back] buttons to navigate between hierarchical levels while saving vertical space.
- **Integrated Configs:** Visualization-specific controls (like Heatmap Time Range or Activity Selectors) are now rendered inside the top bar.
- **Persistent Annotations:** The "Annotations" button has been moved to the right side next to Split/Close controls for constant accessibility.
- **Responsive Header:** Header adapts to narrow windows by collapsing labels into icons.

### 12. Event-Driven Architecture (services/)
Backend event system for decoupled, cascading updates:

**Event Bus (`services/events.py`):**
- Pub/sub pattern with wildcard support (`goal.*`, `*`)
- Events emitted from API endpoints after successful operations

**Standard Event Types:**
| Category | Events |
|----------|--------|
| Session | `SESSION_CREATED`, `SESSION_UPDATED`, `SESSION_COMPLETED`, `SESSION_DELETED` |
| Goal | `GOAL_CREATED`, `GOAL_UPDATED`, `GOAL_COMPLETED`, `GOAL_UNCOMPLETED`, `GOAL_DELETED` |
| Target | `TARGET_ACHIEVED`, `TARGET_CREATED`, `TARGET_DELETED` |
| Activity | `ACTIVITY_INSTANCE_CREATED`, `ACTIVITY_INSTANCE_DELETED`, `ACTIVITY_METRICS_UPDATED` |
| Program | `PROGRAM_CREATED`, `PROGRAM_UPDATED`, `PROGRAM_DELETED`, `PROGRAM_COMPLETED` |

**Completion Handlers (`services/completion_handlers.py`):**
- `@event_bus.on(Events.SESSION_COMPLETED)`: Evaluates targets for linked goals AND checks Program Day completion
- `@event_bus.on(Events.GOAL_COMPLETED)`: Updates parent goals (`completed_via_children`) and program progress
- Auto-completion cascade: Session → Targets → Goal → Parent Goal → Program
- Program Cascade: Session → Program Day → Program Block → Program

**API Endpoints Emitting Events:**
- `blueprints/goals_api.py`: Goal CRUD + completion toggle
- `blueprints/sessions_api.py`: Session CRUD + activity instance operations
- `services/programs.py`: Program CRUD (emitted by service now)

**Usage:**
```python
from services import event_bus, Event, Events

# Emit when session is completed
event_bus.emit(Event(Events.SESSION_COMPLETED, {
    'session_id': session.id,
    'root_id': root_id
}, source='my_module.my_function'))
```

**Initialization:** `init_services()` called in `app.py` on startup.

### 13. Event-Driven Logging System
Captures and persists all application events to the database for auditing and history.
- **Event Logger (`services/event_logger.py`):** Subscribes to all events (`*`) and stores them in `event_logs` table.
- **Logs API (`blueprints/logs_api.py`):** Endpoint to fetch paginated logs scoped by `root_id`.
- **Frontend Integration:**
  - **Standalone Logs Page:** Reachable via the "LOGS" button in the navigation header.
  - **Enhanced Log View:** Displays interactive event log with human-readable descriptions, full entity IDs, and color-coded event badges (including red for deletion events).
  - **Audit Quality Improvements:** Backend events now reliably include human-readable entity names (e.g., activity name, goal name) to ensure logs aren't filled with "Unknown" labels.
  - **Categorized Tracking:** Automatically tracks Goals, Sessions, Targets, Activities (Definitions & Instances), Activity Groups, and Programs.

---
---

## Database Schema

The database is normalized and split into domain-specific tables. See `models/` directory for SQLAlchemy definitions.

| Domain | Key Tables | Description |
|--------|------------|-------------|
| **Core** | `users` | User accounts and authentication. |
| **Fractal** | `goals`, `targets` | The 7-level goal hierarchy and measurable targets. |
| **Sessions** | `sessions`, `activity_instances` | Practice sessions and their tracked activities. |
| **Activities** | `activity_definitions`, `activity_groups` | Reusable activity templates and metrics. |
| **Programs** | `programs`, `program_blocks`, `program_days` | Training macro-cycles, auto-completed blocks, and day-goal `program_day_goals` mappings. |
| **Data** | `notes`, `metric_values` | Polymorphic notes and discrete metric data points. |
| **Logs** | `event_logs` | System-wide event audit trail. |

## Frontend Architecture

The frontend is a **React 19 + Vite** SPA using **ReactFlow** for the fractal visualization.

### Key Directories (`client/src/`)
- **`components/`**: Reusable UI components (Modals, Forms, etc.).
- **`pages/`**: Top-level route views (`FractalGoals`, `Sessions`, `Analytics`).
- **`hooks/`**: Custom hooks for business logic (`useSessionLogic`, `useGoalForm`).
- **`contexts/`**: Global state (`AuthContext`, `GoalContext`, `SessionContext`).
- **`utils/`**: Helpers for API calls, date formatting, and goal logic.

### Core Pages
- **Fractal View (`FractalGoals.jsx`)**: The interactive goal tree.
- **Session Detail (`SessionDetail.jsx`)**: Active practice mode with timers and real-time tracking.
- **Programs (`Programs.jsx`)**: Calendar and block-based training planner.
- **Analytics (`Analytics.jsx`)**: Data visualization dashboard.

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

- **`copy-db-to-envs.sh`** - Copy production database to dev/test environments
  - Copies `goals.db` to `goals_dev.db` and `goals_test.db`
  - Creates timestamped backups in `/backups/` folder (gitignored)
  - Useful for syncing production data to development/testing

### Python Utility Scripts (in `/python-scripts/`)

- **Migration Scripts:** `migrate_*.py` - Database schema migrations
- **Demo Data:** `create_demo_*.py` - Create sample data for testing
- **Debug Tools:** `debug_*.py` - Database inspection and debugging utilities

---

## Environment Configuration

### Environment Files

- **`.env.development`** - Development settings (uses `goals_dev.db`)
- **`.env.testing`** - Testing settings (uses `goals_test.db`)
- **`.env.production`** - Production settings (uses `goals.db`)
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

### Python Dependencies

- **`requirements.txt`** - Production dependencies (Flask, SQLAlchemy, etc.) with pinned versions
- **`requirements-test.txt`** - Testing dependencies (pytest, coverage, etc.)

**Installation:**
```bash
# Production dependencies
pip install -r requirements.txt

# Add testing dependencies for development
pip install -r requirements-test.txt
```

---

---

## Known Issues & Roadmap

From `/my-implementation-plans/features.txt`:

**Completed:**
- ✅ Re-order activity order in sessions
- ✅ Session start/end time adjustments
- ✅ Card layout for activity management
- ✅ Activity builder as separate component
- ✅ Activity groups (families)
- ✅ Practice sessions show session start date instead of age
- ✅ Programming section (composable session templates)
- ✅ Improve "add practice session" functionality in fractal UI (redirects to Create Session page)

**In Progress:**
- 🔄 Programs feature integration with backend
- 🔄 Navigation improvements (Programs tab added)

**To-Do:**
- ⏳ Allow adjustments to estimated time in sessions
- ⏳ Toggle hiding practice sessions from fractal view
- ✅ Add immediate goals to practice sessions
- ⏳ SMART mode for goals
- ⏳ Detailed notes interface (multiple notes per set, new DB table)
- ⏳ Additional programming features (backend integration)
- ⏳ Search functionality for activities

- ⏳ Make duration updates more sensible
- ⏳ Fix nav bar alignment (selected section slightly lower)
- ⏳ Add session button text always white (not just on hover)
- ⏳ Dark/light theme toggle

**To-Do:**
- ⏳ Allow adjustments to estimated time in sessions
- ⏳ Practice sessions show session start date instead of age
- ⏳ Toggle hiding practice sessions from fractal view
- ✅ Add immediate goals to practice sessions
- ⏳ SMART mode for goals
- ⏳ Programming section enhancements
- ⏳ Detailed notes interface (multiple notes per set, new DB table)
- ⏳ Additional programming features
- ⏳ Search functionality for activities

- ⏳ Make duration updates more sensible

### Recent Fixes
- **Production Migration (2026-01-04):** Applied database updates to production:
  - Applied `migrate_program_day_templates.py` migration:
    - Created `program_day_templates` junction table for many-to-many relationship
    - Added `program_day_id` column to `goals` table (links sessions to program days)
    - Added `is_completed` column to `program_days` table
    - Dropped legacy `scheduled_sessions` table
    - Backup: `goals_db_backup_program_migration_20260104_114659.db`
  - Added missing `completed_at` column to `goals` table (tracks when goals were marked complete)
  - Production schema now matches development schema
- **CreateSession Page:** Fixed styling consistency (colors), added multi-selection for existing immediate goals, corrected API call for updating goals (fixed 404 error).
- **Backend API:** Updated `update_fractal_goal` to allow reparenting via `parent_id` (enabling attachment of existing goals to sessions).
- **Program Scheduling Refactor:** Shifted from "Copying Program Days" to "Creating Practice Sessions linked to Templates". This prevents clutter in the Blocks view and streamlines the data model.
- **DayViewModal:** Unified display of Scheduled Program Days (Sessions) and Legacy Days, added "Unassign" capability, and restricted single-day scheduling.
- **Calendar Rendering Fix:** Added `program_day_id` to `Goal.to_dict()` serialization so scheduled sessions properly link to their template program days for calendar display.
- **Datetime Standardization:** Implemented global `format_utc` in `models.py` to ensure all `DateTime` fields (Sessions, Goals, Activities, Programs) are serialized as ISO 8601 strings with 'Z' suffix, ensuring correct UTC-to-Local conversion on the frontend.
- **Note Display (2026-01-16):** Updated notes timeline in Sessions list and Note Items to display Activity Name on its own line, followed by Set Index (if applicable) and Timestamp separated by a hyphen, improving readability.
- **Session Duration Calculation:** Fixed issue where session duration was incorrectly calculated using "Last Modified" time instead of "Session End" time. Updated `Sessions.jsx` and `SessionDetail.jsx` to prioritize `End - Start` calculation using canonical session timestamps.
- **Notes System Implementation:**
  - Implemented comprehensive `SessionSidePane` with collapsible metadata, Notes, and History panels.
  - Updated `notes` table schema to support polymorphic associations (`context_type`, `context_id`) and specific foreign keys (`activity_instance_id`, `set_index`).
  - Fixed database migration mismatch in development environment (`migrate_notes_schema_dev.py`).
  - Integrated notes synchronization across SessionDetail and SidePane.
## Project Status
Fractal Goals is currently in active development. The core fractal goal structure (Ultimate -> Nano) is implemented, along with sessions, program management, and settings.
Recent focus has been on:
- **Session Creation**: Auto-associating goals based on template activities and program context.
- **UI Refinement**: Improving the "Create Session" flow with dynamic goal colors (user-configurable) and "Smart Ring" visualizations.
- **Performance**: Optimizing database queries and eagerness.

## Recent Changes
- **Goal Characteristics Renaming**: Renamed the "Goal Styling" tab in the Settings Modal to "Goal Characteristics" for consistency with the section heading.
- **Goal Association**: Moved from manual selection to automatic inheritance logic in `sessions_api.py`.
- **UI Layout**: Reordered Create Session page to prioritize the Create button while showing detailed associated goals below.
- **Visuals**: Added Smart Goal "bullseye" rings and dynamic coloring based on user settings (`ThemeContext`).
- **Database**: Added `block_goal_ids` to `ProgramDay` for tighter scoping.al.
- **Session Display:** Updated `Sessions.jsx` duration calculation to prioritize the difference between Session End and Session Start times, resolving a discrepancy where the displayed duration did not match the visual timeframe.
- **Goal Detail Display:** Limited the number of practice sessions shown in `GoalDetailModal` (and Sidebar) to the most recent 5, with a count for additional sessions, improving load times and visual clutter.
- **Refactor "Practice Session" -> "Session" API:** Removed "practice" prefix from UI text, standardizing terminology to "Session" across the application (Sidebar, Modals, Pages, CSS).
- **Renamed PracticeSessionModal**: Renamed `PracticeSessionModal.jsx` to `SessionModal.jsx` and updated component definition.
- **GoalDetailModal Resilience**: Added safety checks in `GoalDetailModal` to prevent crashes when filtering sessions with potential null/undefined values or when `sessions` is not an array.
- **Restored SessionModal**: Restored `SessionModal.jsx` which was accidentally deleted during the rename process.
- **TargetCard Safety**: Updated `TargetCard.jsx` to safely access `metric_definitions` using optional chaining to prevent crashes for activities with missing definitions.
- **GoalDetailModal Activity Safety**: Added `Array.isArray(activityDefinitions)` checks in `GoalDetailModal` to prevent crashes when `activityDefinitions` prop is null or invalid.
- **CRITICAL FIX: Missing onAddChild Prop**: Added `onAddChild` to `GoalDetailModal` props destructuring. This missing prop caused a `ReferenceError` that crashed the entire sidebar when clicking any goal. Also added `ErrorBoundary` component to `FractalGoals.jsx` to catch and display future errors gracefully.
- **FlowTree Evidence Resolution**: Expanded `deriveEvidenceGoalIds` in `FlowTree.jsx` so highlights and fades accurately reflect work logged against Activity Groups (not just direct activities). Added strict fallback logic to map evidence to session-level goals dynamically if specific activities cannot be cleanly matched.
- **FlowTree Metrics Overlay**: Implemented a comprehensive dynamic metrics overlay in `FlowTree.jsx` that computes statistics exactly on the currently visible goal lineage, displaying key insights across Goals, Work Evidence, Pathways, Momentum (Last 7 Days), and Program Alignment.
- **Goal Mapping Centralization (2026-02-20)**: Replaced duplicate, fallback `_goal_type_from_level` logic across the backend with a single `get_canonical_goal_type` and `get_canonical_goal_level_name` utility in `services/goal_type_utils.py`. Enforced strict foreign-keys and visual characteristics by backfilling `level_id` values for all existing goals, resolving a major bug where unmapped goals rendered incorrectly as a generic `"Goal"` in the UI.
- **Metric Persistence Fix (2026-02-24)**: Resolved "disappearing metrics" bug by implementing the missing `PUT /api/<root_id>/sessions/<session_id>/activities/<instance_id>/metrics` binary-safe upsert endpoint in `sessions_api.py`. Added strict validation to ensure metric IDs belong to the activity definition and added integration tests.

---

### AI Agent Development Protocol

**⚠️ CRITICAL: Follow this protocol for EVERY code change request to prevent breaking existing functionality.**

#### Phase 1: Investigation (REQUIRED BEFORE ANY CODE CHANGES)

When a user reports an issue or requests a fix:

1. **Ask Clarifying Questions First**
   - What is the exact behavior you're seeing?
   - What did you expect to happen?
   - Are there any error messages in the browser console or backend logs?
   - Can you reproduce this consistently?
   - When did this start happening? (Was it working before?)

2. **Investigate the Current State**
   - Read the relevant code sections
   - Trace the data flow from frontend → API → database
   - Check browser console for errors
   - Verify what's actually in the database (if applicable)
   - Review recent changes in this file that might be related

3. **Provide a Diagnosis**
   - Explain what you found during investigation
   - Show the user the relevant code sections
   - Describe the root cause with evidence
   - Explain what is working vs. what is broken
   - **DO NOT make changes yet**

4. **Wait for User Confirmation**
   - Present your diagnosis to the user
   - Ask: "Does this match what you're experiencing?"
   - Get explicit approval before proceeding to fixes

#### Phase 2: Planning the Fix

1. **Propose the Minimal Change**
   - Identify the smallest possible fix
   - Explain exactly what you'll change and why
   - List any files that will be modified
   - Describe potential risks or side effects

2. **One Change at a Time**
   - If multiple issues exist, fix them separately
   - Never bundle unrelated changes together
   - Each fix should be independently testable

3. **Get Approval**
   - Wait for user to approve the proposed fix
   - User may ask you to adjust the approach

#### Phase 3: Implementation

1. **Make the Minimal Change**
   - Change only what's necessary
   - Don't "improve" working code unless explicitly asked
   - Don't refactor while fixing bugs
   - Preserve existing behavior wherever possible

2. **Update Documentation**
   - Add entry to "Recent Fixes" section
   - Update relevant sections of this file
   - Document what was changed and why

3. **Provide Testing Instructions**
   - Tell the user exactly how to test the fix
   - List the expected behavior
   - Suggest edge cases to check

#### Phase 4: Verification

1. **Wait for User Testing**
   - Don't assume the fix worked
   - Don't make additional changes until user confirms

2. **If Issues Persist**
   - Return to Phase 1: Investigation
   - Don't guess - investigate further
   - Ask for more details about what's not working

#### Red Flags - STOP and Investigate If:

- ❌ You're changing code you haven't fully read and understood
- ❌ You're making multiple unrelated changes at once
- ❌ You're "improving" code that wasn't mentioned in the issue
- ❌ You haven't verified the issue actually exists
- ❌ You're guessing at the solution without evidence
- ❌ You're changing API contracts without checking all callers
- ❌ You haven't considered what might break

#### Example Good Workflow:

```
User: "Metrics don't seem to save"

Agent: "Let me investigate this. I'll check:
1. The browser console for errors
2. The API call being made
3. The backend endpoint handling metrics
4. What's actually in the database

[After investigation]

I found that metrics ARE being saved to the database correctly. 
The issue appears to be that the UI isn't refreshing after save.
Here's the code flow: [shows code]

Does this match what you're seeing? If so, I can fix the UI refresh 
issue with a small change to SessionDetail.jsx line 467."
```

#### Example Bad Workflow (DON'T DO THIS):

```
User: "Metrics don't seem to save"

Agent: "I'll fix the metrics saving and also improve the session 
timing persistence while I'm at it."

[Makes multiple changes without investigation]
[Breaks working functionality]
```

---

### For AI Agents Working on This Project

1. **Always read this file first** to understand the current state of the project
2. **Follow the AI Agent Development Protocol above** - it is MANDATORY
3. **Check recent changes** section to avoid re-implementing fixes
4. **Update this file** after making significant changes to:
   - Database schema
   - API endpoints
   - Frontend components
   - Features
   - Known issues
5. **Follow existing patterns:**
   - Use blueprint structure for new API endpoints
   - Follow Single Table Inheritance for goal types
   - Use context providers for global state
   - Maintain environment separation
6. **Test across environments** when making infrastructure changes
7. **Document breaking changes** in this file
8. **Keep the To-Do list updated** as features are completed

### Code Organization Principles

- **Backend:** Blueprint-based API organization by domain (goals, sessions, activities, timers, templates)
- **Frontend:** Page-based routing with shared components and contexts
- **Database:** Single Table Inheritance for goal hierarchy, separate tables for activities/metrics
- **State Management:** React Context for global state, local state for component-specific data
- **Styling:** Component-scoped CSS with global theme variables

---

## Documentation Protocol for AI Agents

### 📁 Documentation Organization

All project documentation is organized in the `/docs/` directory. **NEVER create documentation files in the project root** (except `index.md` and `README.md`).

#### Directory Structure

```
/docs/
├── README.md                    # Documentation organization guide
├── /architecture/               # System design & architecture decisions
├── /migrations/                 # Database migration docs & reports
├── /features/                   # Feature implementation docs
├── /planning/                   # Roadmaps, backlogs, planning docs
└── /guides/                     # How-to guides & tutorials
```

### 📝 When to Create Documentation

| Situation | Location | Example Filename |
|-----------|----------|------------------|
| Planning a new feature | `/docs/features/` | `timer-controls-plan.md` |
| Documenting feature completion | `/docs/features/` | `timer-controls-complete.md` |
| Planning a database migration | `/docs/migrations/` | `MIGRATION_SCHEMA_V2_PLAN.md` |
| Completing a migration | `/docs/migrations/` | `MIGRATION_SCHEMA_V2_REPORT.md` |
| Architectural decisions | `/docs/architecture/` | `ACTIVITY_INSTANCE_ARCHITECTURE.md` |
| Adding to feature backlog | `/docs/planning/` | `features.txt` |
| Creating setup guide | `/docs/guides/` | `ENVIRONMENT_SETUP.md` |

### 🎯 Documentation Workflow

#### 1. Before Creating Documentation

- ✅ Search `/docs/` to avoid duplication
- ✅ Choose the appropriate subdirectory
- ✅ Use descriptive, consistent naming
- ✅ Check if existing docs need updating instead

#### 2. During Implementation

- ✅ Create planning docs in `/docs/features/` or `/docs/planning/`
- ✅ Update implementation docs as you progress
- ✅ Document architectural decisions in `/docs/architecture/`
- ✅ Keep migration docs in `/docs/migrations/`

#### 3. After Completion

- ✅ Create completion summary in `/docs/features/`
- ✅ Update `/docs/planning/features.txt` to mark feature complete
- ✅ Update `/index.md` if core components changed
- ✅ Cross-reference related documentation

### 📋 Naming Conventions

**Architecture & Migration Docs (UPPERCASE):**
- `ARCHITECTURE_NAME.md`
- `MIGRATION_DESCRIPTION_TYPE.md`
- `DATABASE_IMPROVEMENTS.md`
- `MULTI_USER_ARCHITECTURE.md`

**Feature & Planning Docs (lowercase-with-hyphens):**
- `feature-name-implementation.md`
- `feature-name-complete.md`
- `features.txt`

**Guides (UPPERCASE):**
- `SETUP_GUIDE.md`
- `DEPLOYMENT_GUIDE.md`

### 🚫 What NOT to Do

❌ **NEVER** create documentation in project root  
❌ **NEVER** use vague names like `notes.md`, `temp.md`, `doc.md`  
❌ **NEVER** duplicate information across multiple docs  
❌ **NEVER** leave orphaned docs without context  
❌ **NEVER** mix implementation plans with completion reports in same file  

### ✅ What TO Do

✅ **ALWAYS** place docs in appropriate `/docs/` subdirectory  
✅ **ALWAYS** use clear, descriptive filenames  
✅ **ALWAYS** include creation/update dates in documents  
✅ **ALWAYS** cross-reference related documentation  
✅ **ALWAYS** update `/index.md` when core components change  
✅ **ALWAYS** archive obsolete docs (add `_ARCHIVED` suffix)  

### 📊 Required Updates Checklist

When making changes, update these files as needed:

- [ ] `/index.md` - Update if core features, APIs, or components changed
- [ ] `/docs/planning/features.txt` - Mark features complete or add new ones
- [ ] `/docs/README.md` - Update if adding new doc categories
- [ ] Cross-reference related docs with relative links

### 🗂️ File Lifecycle Example

**Planning Phase:**
1. Create `/docs/features/timer-controls-plan.md`
2. Add to `/docs/planning/features.txt`

**Implementation Phase:**
1. Update `/docs/features/timer-controls-plan.md` with progress
2. Create `/docs/architecture/TIMER_ARCHITECTURE.md` if needed

**Completion Phase:**
1. Create `/docs/features/timer-controls-complete.md`
2. Update `/docs/planning/features.txt` (mark ✅)
3. Update `/index.md` with new API endpoints/components
4. Archive plan: rename to `timer-controls-plan_ARCHIVED.md`

**Migration Phase (if needed):**
1. Create `/docs/migrations/MIGRATION_TIMER_SCHEMA_PLAN.md`
2. Run migration
3. Create `/docs/migrations/MIGRATION_TIMER_SCHEMA_REPORT.md`

### 📚 Quick Reference

**Need to document something?** → Check `/docs/README.md` for detailed guidelines

**Completed a feature?** → Update `/docs/planning/features.txt` and create summary in `/docs/features/`

**Made architecture changes?** → Document in `/docs/architecture/`

**Ran a migration?** → Create report in `/docs/migrations/`

**Root directory getting messy?** → Move docs to appropriate `/docs/` subdirectory immediately

---

## Quick Reference

### Common Tasks

- **Start All Services:**
  ```bash
  ./shell-scripts/start-all.sh
  ```
  (Starts Backend on port 8001 and Frontend on port 5173)

- **View Logs:**
  ```bash
  tail -f logs/development_backend.log
  tail -f logs/development_frontend.log
  ```

- **Run Database Migration:**
  ```bash
  source fractal-goals-venv/bin/activate
  python python-scripts/migrate_<name>.py
  ```

### Key Locations

- **Models:** `/models/` (Domain-specific modules)
- **API Config:** `/app.py` & `/config.py`
- **API Routes:** `/blueprints/`
- **Frontend App:** `/client/src/`
- **Documentation:** `/docs/`
- **Scripts:** `/python-scripts/` & `/shell-scripts/`

---

**Last Updated:** 2026-02-20
**Version:** 2.0.0 (Refactored Architecture)
**Maintained By:** Project AI Agents

---

## Key Reference Documents

- **[ENGINEERING_ANALYSIS.md](/docs/planning/ENGINEERING_ANALYSIS.md)** — Comprehensive analysis of risks, scalability limits, simplification opportunities, and production blockers
- **[production_review.md](/docs/planning/production_review.md)** — Top 10 production improvements with implementation steps
- **[PRODUCTION_QUALITY_ASSESSMENT.md](/docs/planning/PRODUCTION_QUALITY_ASSESSMENT.md)** — Quality assessment and testing framework status