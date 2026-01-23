# Fractal Goals - Project Index

> **⚠️ IMPORTANT FOR AI AGENTS:**
> 1. **READ THIS FILE FIRST** before starting any new task to understand the project context
> 2. **UPDATE THIS FILE** after completing tasks that add, modify, or remove core components
> 3. Keep this index current and accurate - it's the single source of truth for project structure

---

## Project Overview

**Fractal Goals** is a hierarchical goal tracking and practice session management system. It uses a fractal pattern where each goal can have children, creating a tree structure from ultimate life goals down to nano-level tasks. The system includes practice session tracking with customizable activities, metrics, timers, and reusable templates.

**Tech Stack:**
- **Backend:** Flask + SQLAlchemy + Pydantic validation (port 8001)
- **Frontend:** React 19.2.0 + Vite + React Router + ReactFlow (port 5173)
- **Database:** SQLite (development) / PostgreSQL (production) with Alembic migrations
- **Migrations:** Alembic for database schema versioning

---

## Core Features

### 1. Hierarchical Goal Management
- 7-level goal hierarchy: UltimateGoal → LongTermGoal → MidTermGoal → ShortTermGoal → ImmediateGoal → MicroGoal → NanoGoal
- Visual tree representation using ReactFlow
- Goal completion tracking with targets
- Goal age calculation and display
- **Note:** Sessions are now managed separately from the goal hierarchy

### 2. Session Management
- **Sessions are stored in a separate `sessions` table** (not part of the goal tree)
- Session start/end times with duration tracking
- Activity instances with timers
- Session templates for recurring practices
- **Session-Goal Associations:**
  - Many-to-many relationship with Goals via `session_goals` junction table
  - Sessions can be linked to ShortTermGoals (`goal_type='short_term'`)
  - Sessions can be linked to ImmediateGoals (`goal_type='immediate'`)
  - CreateSession page allows selecting STGs and their child IGs in a unified flow
  - SessionDetail header displays associated STGs and IGs with clickable links
  - GoalDetailModal shows associated sessions for both STGs and IGs
- **Refactored Session Detail**:
  - Moved **Session Controls** (Complete, Save, Cancel, Delete) to the Side Pane for better ergonomics (2x2 Grid, Badge style).
  - Implemented **Auto-expanding Note Inputs** (Textarea) for better writing experience.
  - Enhanced **Activity History** to display notes with timestamps and set badges for each previous instance.
  - Refined **Side Pane UI**: Removed redundant context indicator, improved "Details" tab layout with collapsible metadata.
  - **Click-to-Select Activity**: Activities cards are now selectable by clicking anywhere on the card.
  - **Click-to-Deselect Set**: Click on activity header/name to clear set selection and return context to whole activity.
  - **Activity Reordering**: Up/down arrow buttons for within-section reordering; drag-and-drop for between-section moves.
  - **Note Separation**: SidePane is for session-level notes only; activity/set notes are in the activity cards.
  - **Editable Metadata**: Edit Session Start/End times directly in Side Pane.
  - **Previous Notes**: Side pane shows session-level notes from last 3 sessions; History tab limits activity instances to last 3.

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

### 6. Programs (Composable Session Templates)
- Create reusable practice session templates with components
- Component types: Warm-up, Drill, Practice, Cool-down
- Visual template builder with drag-and-drop ordering
- JSON export for template sharing
- Load and edit existing templates

### 7. Multi-Environment Support
- Development, Testing, and Production environments
- Separate databases per environment (goals_dev.db, goals_test.db, goals.db)
- Environment-specific configuration via .env files
- Environment indicator in UI

### 8. SMART Goals
Goals can be evaluated against SMART criteria with visual indicators:
- **S**pecific: Goal has a description
- **M**easurable: Goal has targets attached
- **A**chievable: Goal has activities associated (via `activity_goal_associations` table)
- **R**elevant: User provided a relevance statement explaining how goal helps achieve parent
- **T**ime-bound: Goal has a deadline

**Visual Indicators:**
- `SMARTIndicator` component shows "SMART" text with each letter colored based on criterion status
- `FlowTree` nodes display an outer glowing ring for goals meeting all SMART criteria
- `GoalDetailModal` includes the SMART indicator in the header and a "Relevance" field in edit mode
- **Conditional Completion Logic:** Goals can customize how progress is measured:
  - **Activities & Targets:** Track specific performance data.
  - **Completed via Children:** Completion is derived from child goal status (for goals above `ShortTermGoal`).
  - **Manual Completion:** Allow users to manually toggle completion status in the modal.
  - **Dynamic Completion Status:** When manual completion is disabled, the "Mark Complete" button becomes a status badge showing the automatic criteria (e.g., "Complete via Children").
  - **Automatic Target-Based Completion:** When all targets on a goal are achieved, the goal is automatically marked as complete via the event system.
- **Event-Driven Target Completion Flow:**
  1. User marks session as complete → `SESSION_COMPLETED` event emitted
  2. `handle_session_completed` handler evaluates targets for all linked goals
  3. For each target met, `TARGET_ACHIEVED` event emitted, target marked `completed=true`
  4. If ALL targets on a goal are complete → goal auto-completes, `GOAL_COMPLETED` emitted
  5. `handle_goal_completed` updates parent goals (if `completed_via_children`) and program progress
  6. Frontend refetches goals to display completion results
- **Real-Time Target Achievement Tracking:**
  - During a session, targets are evaluated in real-time against activity instances using the `useTargetAchievements` hook
  - Toast notifications show "🎯 Target achieved: [name]" when metrics meet target thresholds
  - On session completion, backend event system persists target completion with `completed_at` and `completed_session_id`
- **Associated Children View:** `GoalDetailModal` displays a list of child goals at the level below for better context.

**Database Tables:**
- `goals.relevance_statement` - Stores the user's explanation of goal relevance
- `goals.is_smart` - Boolean flag computed when goal is saved
- `activity_goal_associations` - Junction table linking activities to goals (for "A" criterion)

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
- **TanStack Query (React Query):** Implemented on the frontend for `GoalsContext` and `SessionsContext`:
  - Automatic caching with `staleTime: 60s` and `cacheTime: 5m`.
  - Automatic cache invalidation on mutations (create/update/delete).
  - Background revalidation prevents stale data while maintaining "instant" UI feel.
- **Server-Side Compression:** `flask-compress` enabled on backend. Reduces large JSON payloads (fractal tree) by up to 90%.
- **Native JSONB Storage:** Optimized metadata storage using PostgreSQL `JSONB` for targets, attributes, and templates. Enables binary indexing and removes serialization overhead in Python.
- **Pagination:** Sessions list API returns paginated results (default: 10 per page, max: 50)
  - API: `GET /<root_id>/sessions?limit=10&offset=0` → `{sessions: [...], pagination: {limit, offset, total, has_more}}`
  - Frontend: Sessions page has "Load More" button to fetch additional sessions
  - Notes image_data excluded from list view (only loaded in detail view) to reduce response size

### 10. Visualization Annotations
- **Universal Annotation System:** Allows users to annotate specific data points on any analytical visualization (heatmap, scatter plot, line graph, etc.).
- **Drag-to-Select Interface:** Users can drag to select a range of data points (cells in heatmap, region in charts) to annotate.
- **Visual Feedback:** Selection is highlighted, and annotated regions are marked with interactive indicators.
- **Persistence:** Annotations are stored in the database linked to the visualization type, context (e.g., specific activity), and selected data points.
- **Interactive Modals:** Annotation Modal for creating notes, and view modal for reading existing annotations.
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
- `@event_bus.on(Events.SESSION_COMPLETED)`: Evaluates targets for linked goals
- `@event_bus.on(Events.GOAL_COMPLETED)`: Updates parent goals (`completed_via_children`) and program progress
- Auto-completion cascade: Session → Targets → Goal → Parent Goal → Program

**API Endpoints Emitting Events:**
- `blueprints/goals_api.py`: Goal CRUD + completion toggle
- `blueprints/sessions_api.py`: Session CRUD + activity instance operations
- `blueprints/programs_api.py`: Program CRUD

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

---
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
- `completed_at` (DateTime, nullable) - When goal was marked complete
- `created_at` (DateTime)
- `updated_at` (DateTime)
- `parent_id` (String, FK to goals.id)
- `root_id` (String) - Reference to ultimate goal
- `targets` (Text/JSON) - Goal targets for completion tracking
- `relevance_statement` (Text, nullable) - SMART "R" criterion: How goal helps achieve parent
- `is_smart` (Boolean) - Whether goal meets all SMART criteria
- `completed_via_children` (Boolean) - If true, completion is derived from child goals
- `track_activities` (Boolean) - If true, goal tracks activities and targets
- `allow_manual_completion` (Boolean) - If true, goal can be manually marked as complete

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
- ImmediateGoal
- MicroGoal
- NanoGoal

**Note:** PracticeSession is NO LONGER a goal type. Sessions are now stored in the separate `sessions` table.

**Relationships:**
- Self-referential parent-child via `parent_id`

#### `sessions` (Separate Table)
Stores practice session data independently from the goal hierarchy.

**Fields:**
- `id` (String, UUID, PK)
- `name` (String)
- `description` (String)
- `root_id` (String, FK to goals.id) - Reference to fractal root
- `completed` (Boolean)
- `completed_at` (DateTime, nullable)
- `created_at` (DateTime)
- `updated_at` (DateTime)
- `deleted_at` (DateTime, nullable) - Soft delete
- `duration_minutes` (Integer)
- `session_start` (DateTime)
- `session_end` (DateTime)
- `total_duration_seconds` (Integer)
- `template_id` (String)
- `program_day_id` (String, FK to program_days.id)
- `attributes` (Text/JSON) - Flexible session data storage

**Relationships:**
- Has many ActivityInstances
- Has many-to-many with Goals via `session_goals`

#### `session_goals` (Junction Table)
Links Sessions to multiple Goals (many-to-many). Supports both ShortTermGoals and ImmediateGoals.

**Fields:**
- `session_id` (String, FK to sessions.id, PK)
- `goal_id` (String, FK to goals.id, PK)
- `goal_type` (String) - 'short_term' or 'immediate'
- `created_at` (DateTime)

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
Actual activity occurrences within sessions.

**Fields:**
- `id` (String, UUID, PK)
- `session_id` (String, FK to sessions.id)
- `activity_definition_id` (String, FK to activity_definitions.id)
- `root_id` (String, FK to goals.id) - For performance
- `created_at` (DateTime)
- `time_start` (DateTime, nullable)
- `time_stop` (DateTime, nullable)
- `duration_seconds` (Integer, nullable)
- `completed` (Boolean)
- `notes` (Text)
- `data` (Text/JSON) - Flexible data storage (sets, etc.)

**Relationships:**
- Belongs to Session
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

#### `notes`
Timestamped notes attached to sessions, activity instances, or sets.

**Fields:**
- `id` (String, UUID, PK)
- `root_id` (String, FK to goals.id) - For fractal scoping
- `context_type` (String) - 'session', 'activity_instance', or 'set'
- `context_id` (String) - ID of the parent entity
- `session_id` (String, FK to sessions.id, nullable)
- `activity_instance_id` (String, FK to activity_instances.id, nullable)
- `activity_definition_id` (String, FK to activity_definitions.id, nullable)
- `set_index` (Integer, nullable) - For set-level notes
- `content` (Text)
- `created_at` (DateTime)
- `updated_at` (DateTime)
- `deleted_at` (DateTime, nullable)

**Relationships:**
- Belongs to Session (optional)
- Belongs to ActivityInstance (optional)
- Belongs to ActivityDefinition (optional)

#### `visualization_annotations`
Stores annotations on data visualizations.

**Fields:**
- `id` (String, UUID, PK)
- `root_id` (String, FK to goals.id)
- `visualization_type` (String) - 'heatmap', 'scatter', 'line', etc.
- `visualization_context` (Text/JSON) - Identifiers for context (e.g. activity_id)
- `selected_points` (Text/JSON) - List of data points selected
- `selection_bounds` (Text/JSON) - Coordinates of selection box
- `content` (Text)
- `created_at` (DateTime)
- `updated_at` (DateTime)

#### `session_templates`
Reusable session templates.

**Fields:**
- `id` (String, UUID, PK)
- `name` (String)
- `description` (String)
- `root_id` (String, FK to goals.id)
- `created_at` (DateTime)
- `template_data` (String/JSON)

#### `programs`
Manages training programs (macro-cycles).

**Fields:**
- `id` (String, UUID, PK)
- `root_id` (String, FK to goals.id)
- `name` (String)
- `description` (String)
- `start_date` (DateTime)
- `end_date` (DateTime)
- `is_active` (Boolean)
- `created_at` (DateTime)
- `updated_at` (DateTime)

#### `program_blocks`
Training blocks within a program (meso-cycles).

**Fields:**
- `id` (String, UUID, PK)
- `program_id` (String, FK to programs.id)
- `name` (String)
- `start_date` (Date)
- `end_date` (Date)
- `color` (String)
- `goal_ids` (Text/JSON) - Goals targeted by this block

#### `program_days`
Days within a block (micro-cycles).

**Fields:**
- `id` (String, UUID, PK)
- `block_id` (String, FK to program_blocks.id)
- `day_number` (Integer) - Order within block
- `date` (Date)
- `name` (String)
- `notes` (Text)
- `is_completed` (Boolean)

#### `program_day_templates` (Junction Table)
Links ProgramDays to multiple SessionTemplates (many-to-many).

**Fields:**
- `program_day_id` (String, FK to program_days.id, PK)
- `session_template_id` (String, FK to session_templates.id, PK)
- `order` (Integer)

---

## Backend API Structure

### Request Validation (`/validators.py`)
Pydantic-based validation for all API endpoints.

**Features:**
- `@validate_request(SchemaClass)` decorator for automatic request validation
- String sanitization (whitespace normalization, null byte removal)
- Structured error responses with field-level details
- Maximum length enforcement to prevent abuse

**Key Schemas:**
- `GoalCreateSchema`, `GoalUpdateSchema` - Goal CRUD validation
- `FractalCreateSchema` - Root goal creation validation
- `SessionCreateSchema`, `SessionUpdateSchema` - Session validation
- `NoteCreateSchema`, `NoteUpdateSchema` - Note validation
- `ProgramCreateSchema`, `ProgramBlockSchema` - Program validation

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
- `POST /api/<root_id>/goals/<goal_id>/evaluate-targets` - Evaluate and persist target completion for a session

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

#### `programs_api.py`
Manages training programs, blocks, and scheduled sessions.

**Key Endpoints:**
- `GET /api/<root_id>/programs` - Get all programs
- `GET /api/<root_id>/programs/<program_id>` - Get specific program
- `POST /api/<root_id>/programs` - Create program
- `PUT /api/<root_id>/programs/<program_id>` - Update program
- `DELETE /api/<root_id>/programs/<program_id>` - Delete program
- `GET /api/<root_id>/programs/active-days` - Get active program days for current date
- `POST /api/<root_id>/programs/<program_id>/blocks/<block_id>/days` - Add day to block
- `PUT /api/<root_id>/programs/<program_id>/blocks/<block_id>/days/<day_id>` - Update program day
- `DELETE /api/<root_id>/programs/<program_id>/blocks/<block_id>/days/<day_id>` - Delete program day
- `POST /api/<root_id>/programs/<program_id>/blocks/<block_id>/days/<day_id>/copy` - Copy day to other blocks
- `POST /api/<root_id>/programs/<program_id>/blocks/<block_id>/goals` - Attach goal to block

#### `notes_api.py`
Manages timestamped notes for sessions, activities, and sets.

**Key Endpoints:**
- `GET /api/<root_id>/sessions/<session_id>/notes` - Get all notes for a session
- `GET /api/<root_id>/sessions/<session_id>/previous-session-notes` - Get session-level notes from last 3 sessions (grouped by session)
- `GET /api/<root_id>/activity-instances/<instance_id>/notes` - Get notes for activity instance
- `GET /api/<root_id>/activities/<activity_id>/notes` - Get notes across sessions for activity
- `GET /api/<root_id>/activities/<activity_id>/history` - Get previous activity instances (default limit: 3)
- `POST /api/<root_id>/notes` - Create note
- `PUT /api/<root_id>/notes/<note_id>` - Update note
- `DELETE /api/<root_id>/notes/<note_id>` - Soft delete note

#### `annotations_api.py`
Manages visualization annotations.

**Key Endpoints:**
- `GET /api/roots/<root_id>/annotations` - Get annotations (can filter by type/context)
- `POST /api/roots/<root_id>/annotations` - Create annotation
- `PUT /api/roots/<root_id>/annotations/<annotation_id>` - Update annotation
- `DELETE /api/roots/<root_id>/annotations/<annotation_id>` - Delete annotation

#### `pages.py`
Serves static pages (minimal usage, mostly SPA).

---

## Frontend Component Structure

### Main Application Files (in `/client/src/`)

- **`main.jsx`** - Application entry point
- **`AppRouter.jsx`** - Route configuration and navigation
- **`FlowTree.jsx`** - ReactFlow-based goal tree visualization. Custom nodes with circular design, cosmic color coding, and 3-layer "bullseye" (outer ring, middle ring, core) for SMART goals.
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
- Direct navigation to session creation from ShortTermGoal nodes

#### `Sessions.jsx`
Practice sessions list and management.

**Features:**
- Session list with filtering
- Session creation from templates
- Session deletion
- Navigation to session detail
- **Expandable Notes Accordion:** Each session card has a "📝 Notes" toggle that expands to show session-level notes, with note count badge

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
Composable practice session template builder.

**Features:**
- Create session templates with multiple components
- Component types with color coding (warmup, drill, practice, cooldown)
- Reorder components within template
- Duration tracking and calculation
- Save and load templates
- Export templates as JSON
- Custom modals for alerts and confirmations

#### `Programs.jsx`
Programs list and management page.

**Features:**
- List all saved programs/templates
- Create new programs
- Edit existing programs
- Delete programs with custom modal and session impact warning
- Navigate to program detail view
- Visual improvements:
  - Block date ranges and active status indicators
  - Correct grouping of attached goals

#### `ProgramDetail.jsx`
Detailed view of a single program/template.

**Features:**
- Calendar and blocks view modes
- **Calendar View updates:**
  - Toggle between "Select Dates to Add Block" mode and Day View mode
  - Comprehensive Day View Modal showing schedule, templates, and goals due
  - Set goal deadlines directly from Day View
  - Dynamic calendar events (hiding planned templates if session matches, showing all goal deadlines)
- **Block Interaction:**
  - Create and edit training blocks with custom colors and date ranges
  - User-controlled day creation (days not auto-populated)
  - Edit existing blocks (name, dates, color)
  - Delete blocks with confirmation dialog and cascade warning
  - Active block indicators
- **Scheduling (New Architecture):**
  - "Assigning" a Program Day to a calendar date creates a **Practice Session** (linked to the template) rather than duplicating the Program Day definition.
  - Calendar displays these "Planned Sessions" unified with "Completed Sessions".
- **Legacy Support:** view completed sessions linked to program days
- Attach goals to blocks with deadline management
- View completed sessions linked to program days

#### `CreateSession.jsx`
Session creation page (refactored into focused sub-components).

**Features:**
- Enhanced session creation flow with dual-source support
- Option to create sessions from active program days
- Option to create sessions from templates directly
- Auto-detection of available sources (program days vs templates)
- Program context tracking (links sessions to program/block/day)
- Associate sessions with multiple short-term goals
- Smart UI that adapts based on available options (all steps visible simultaneously)
- Add/Attach Immediate Goals to new sessions (both new and existing immediate goals)

**Sub-components (in `/client/src/components/createSession/`):**
- `StepHeader.jsx` - Reusable step header with numbered badge
- `ProgramSelector.jsx` - Step 0a: Choose program when multiple available
- `SourceSelector.jsx` - Step 0b: Choose between program days vs templates
- `ProgramDayPicker.jsx` - Step 1: Select program day and session
- `TemplatePicker.jsx` - Step 1: Select template directly
- `GoalAssociation.jsx` - Step 2: Associate with STGs and IGs
- `ImmediateGoalSection.jsx` - Sub-component for IG display/management
- `CreateSessionActions.jsx` - Step 3: Create button and summary
- `SelectExistingGoalModal.jsx` - Modal for selecting existing IGs


#### `Selection.jsx`
Fractal selection/home page.

**Features:**
- List all fractals
- Create new fractal
- Delete fractal
- Navigate to fractal view

### Components (in `/client/src/components/`)

#### Core Components

- **`Sidebar.jsx`** - Sidebar for goal details; uses GoalDetailModal for goals, inline UI for sessions
- **`GoalDetailModal.jsx`** - Unified goal viewing/editing/creating component with dual display modes (modal/panel):
  - **Mode support:** 'view', 'edit', or 'create' mode via `mode` prop
  - **Refactored Architecture:** Complex logic extracted into focused sub-components (`TargetManager`, `ActivityAssociator`, `GoalSessionList`).
  - View/Edit goal name, description, deadline
  - **Create mode:** Used for creating new child goals with consistent UI (replaces old GoalModal)
  - **Associated/Targeting Programs display**
  - **Associated Activities (SMART Achievable):** Managed via `ActivityAssociator`. Shows count of activities linked to goal.
    - Activity Selector: Card-based group selection + individual activity selection.
    - **Constraint:** Activities cannot be removed if used by existing targets.
  - **Inline target builder:** Managed via `TargetManager`. Add/Edit targets with bubble-based activity selection interface. Auto-saves changes in View Mode.
  - Completion confirmation flow with program/target summary
  - **SMART Indicator:** Real-time feedback based on current editing state.
  - **Goal Metadata:** Horizontal display of Created, Deadline, and Completed dates in the header.
  - **Practice session relationships:** Managed via `GoalSessionList` (children for ShortTermGoals, parent for ImmediateGoals).
  - **Action buttons layout:** 2x2 Grid layout (Complete, Add Child, Edit, Delete) for better ergonomics.
  - **Contextual Styling:** 
    - Goal Name, Date Labels, and Section Headers (Activities, Targets, Sessions) are colored with the goal's cosmic color.
    - Parent goal references highlighted in parent goal color.
  - **Completion Choices:** For higher-level goals, choose between tracking activities or delegating to child goals.
  - **Associated Children:** View list of child goals directly in the modal.

**Sub-components (in `/client/src/components/goalDetail/`):**
- `TargetManager.jsx` - Manages target list, deletion, and inline target creation/editing.
- `ActivityAssociator.jsx` - Manages activity associations and the activity selector UI.
- `GoalSessionList.jsx` - Displays associated sessions contextually based on goal type.
- **`SelectActivitiesModal.jsx`** - Modal for selecting activities to associate with a goal (for SMART "Achievable" criterion)
- **`FractalView.jsx`** - Wrapper for fractal visualization
- **`ActivityBuilder.jsx`** - Modal for creating/editing activity definitions
- **`ActivitiesManager.jsx`** - Activity selection and management interface
- **`ActivityCard.jsx`** - Card display for activities

- **`AddTargetModal.jsx`** - Modal for adding targets to goals
- **`TargetCard.jsx`** - Display card for targets
- **`ConfirmationModal.jsx`** - Reusable confirmation dialog

#### Modal Components (in `/client/src/components/modals/`)

- **`AddChildModal.jsx`** - Modal for adding child goals
- **`CreateFractalModal.jsx`** - Modal for creating new fractals
- **`EditGoalModal.jsx`** - Modal for editing goal details
- **`SessionCreationModal.jsx`** - Modal for creating sessions
- **`TemplateSelectionModal.jsx`** - Modal for selecting templates
- **`AlertModal.jsx`** - Reusable alert/notification modal
- **`DeleteConfirmModal.jsx`** - Reusable delete confirmation modal. Supports `requireMatchingText` to enforce typing a specific string to enable the delete button.
- **`ProgramBuilder.jsx`** - Modal for creating/editing programs
- **`ProgramBlockModal.jsx`** - Modal for creating/editing program blocks
- **`ProgramDayModal.jsx`** - Modal for creating/editing program days
- **`AttachGoalModal.jsx`** - Modal for attaching goals to blocks
- **DeleteProgramModal.jsx** - Modal for confirming program deletion with session count warning. Supports `requireMatchingText` to enforce typing a specific string.
- **`DayViewModal.jsx`** - Detailed view of a calendar day (schedule + goal deadlines)
- **`PracticeSessionModal.jsx`** - Modal for creating/editing practice sessions
- **`GroupBuilderModal.jsx`** - Modal for creating/editing activity groups

#### Analytics Components (in `/client/src/components/analytics/`)

- **`AnnotatedHeatmap.jsx`** - GitHub-style heatmap with drag-to-select annotation support
- **`AnnotatedChartWrapper.jsx`** - Wrapper for Chart.js charts adding annotation functionality
- **`AnnotationModal.jsx`** - Modal for adding notes to selected data points
- **`ProfileWindow.jsx`** - Main container for analytics visualizations
- **`ActivityHeatmap.jsx`** - Core heatmap component
- **`ScatterPlot.jsx`** - Scatter plot for metric correlations
- **`LineGraph.jsx`** - Line graph for metric trends
- **`WeeklyBarChart.jsx`** - Bar chart for weekly session counts
- **`GoalCompletionTimeline.jsx`** - Stacked area chart for goal completions
- **`GoalTimeDistribution.jsx`** - Stacked bar chart for time tracking
- **`StreakTimeline.jsx`** - Visual timeline of activity streaks

#### Session Detail Components (in `/client/src/components/sessionDetail/`)

- **`SessionSidePane.jsx`** - Persistent side panel with Notes and History modes
- **`SessionInfoPanel.jsx`** - Collapsible header panel showing session metadata and goals (used in Sidebar)
- **`SessionSection.jsx`** - Renders a session section with its activities
- **`SessionControls.jsx`** - Sticky footer controls for session actions (Delete, Cancel, Mark Complete, Done)
- **`SessionActivityItem.jsx`** - Activity item in session with timer controls (moved from components root)
- **`NotesPanel.jsx`** - Notes mode with quick-add, timeline, and previous session notes
- **`NoteQuickAdd.jsx`** - Quick input for adding notes with Enter key submission
- **`NoteTimeline.jsx`** - Chronological list of notes
- **`NoteItem.jsx`** - Individual note with inline edit/delete
- **`PreviousNotesSection.jsx`** - Collapsible section showing notes from previous sessions
- **`HistoryPanel.jsx`** - Activity history mode showing previous instance metrics

### Hooks (in `/client/src/hooks/`)

- **`useSessionNotes.js`** - Session notes CRUD with `notes`, `previousNotes` (activity-specific), and `previousSessionNotes` (last 3 sessions)
- **`useActivityHistory.js`** - Fetch previous activity instances for history panel
- **`useAutoSave.js`** - Reusable debounced auto-save with status tracking
- **`useTargetAchievements.js`** - Real-time target achievement detection during sessions (client-side only, no persistence until session completion)

### Contexts (in `/client/src/contexts/`)

- **`GoalContext.jsx`** - Global state for goals
- **`SessionContext.jsx`** - Global state for sessions
- **`ActivityContext.jsx`** - Global state for activities
- **`TimezoneContext.jsx`** - Global timezone management
- **`HeaderContext.jsx`** - Dynamic header actions for page-specific controls

### Utilities (in `/client/src/utils/`)

- **`api.js`** - Axios-based API client with all endpoint functions
- **`dateUtils.js`** - Date formatting and timezone utilities:
  - `getLocalISOString()` - Create timestamps in local time (use for session_start, etc.)
  - `getTodayLocalDate()` - Get today's date as YYYY-MM-DD (local)
  - `parseAnyDate()` - Safely parse any date string (handles date-only and datetime)
  - `formatForInput()` - Format dates for input fields
  - `formatDateInTimezone()` - Format dates for display
- **`goalColors.js`** - Color schemes for goal types
- **`goalHelpers.js`** - Goal hierarchy and validation helpers
- **`metricsHelpers.js`** - Metric calculation utilities
- **`targetUtils.js`** - Target validation and progress calculation
- **`programUtils.jsx`** - Shared utilities for program block status (Active badges)

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
- **Backend Performance:** Optimized `get_session_activities` with eager loading to eliminate N+1 queries. Removed dead code `sync_session_activities`.
- **Frontend Performance:** Refactored `CreateSession.jsx` to parallelize immediate goal creation requests using `Promise.all`.
- **Data Fetching Optimization:** Addressed inefficient data loading in `CreateSession.jsx` by implementing a dedicated `goals/selection` endpoint that fetches only active Short-Term and Immediate goals, avoiding full-tree traversal.
- **Session Display:** Updated `Sessions.jsx` duration calculation to prioritize the difference between Session End and Session Start times, resolving a discrepancy where the displayed duration did not match the visual timeframe.
- **Goal Detail Display:** Limited the number of practice sessions shown in `GoalDetailModal` (and Sidebar) to the most recent 5, with a count for additional sessions, improving load times and visual clutter.
- **Refactor "Practice Session" -> "Session" API:** Removed "practice" prefix from UI text, standardizing terminology to "Session" across the application (Sidebar, Modals, Pages, CSS).
- **Renamed PracticeSessionModal**: Renamed `PracticeSessionModal.jsx` to `SessionModal.jsx` and updated component definition.
- **GoalDetailModal Resilience**: Added safety checks in `GoalDetailModal` to prevent crashes when filtering sessions with potential null/undefined values or when `sessions` is not an array.
- **Restored SessionModal**: Restored `SessionModal.jsx` which was accidentally deleted during the rename process.
- **TargetCard Safety**: Updated `TargetCard.jsx` to safely access `metric_definitions` using optional chaining to prevent crashes for activities with missing definitions.
- **GoalDetailModal Activity Safety**: Added `Array.isArray(activityDefinitions)` checks in `GoalDetailModal` to prevent crashes when `activityDefinitions` prop is null or invalid.
- **CRITICAL FIX: Missing onAddChild Prop**: Added `onAddChild` to `GoalDetailModal` props destructuring. This missing prop caused a `ReferenceError` that crashed the entire sidebar when clicking any goal. Also added `ErrorBoundary` component to `FractalGoals.jsx` to catch and display future errors gracefully.

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

**Copy production database to dev/test:**
```bash
./shell-scripts/copy-db-to-envs.sh
```

### Important File Locations

- **Database models:** `/models.py`
- **Flask app:** `/app.py`
- **API blueprints:** `/blueprints/`
- **Frontend entry:** `/client/src/main.jsx`
- **API client:** `/client/src/utils/api.js`
- **Environment config:** `/.env.*` files
- **Logs:** `/logs/`
- **Database backups:** `/backups/` (gitignored)
- **Documentation:** `/docs/` (organized by category)
  - Architecture docs: `/docs/architecture/`
  - Migration docs: `/docs/migrations/`
  - Feature docs: `/docs/features/`
  - Planning docs: `/docs/planning/`
  - Guides: `/docs/guides/`
- **Python Scripts:** `/python-scripts/` (organized by purpose)
  - Migrations: `/python-scripts/migrations/`
  - Debug tools: `/python-scripts/debug/`
  - Demo data: `/python-scripts/demo-data/`
  - Utilities: `/python-scripts/utilities/`

---

**Last Updated:** 2026-01-09  
**Version:** 1.2.0  
**Maintained By:** Project AI Agents

---

## Key Reference Documents

- **[ENGINEERING_ANALYSIS.md](/docs/planning/ENGINEERING_ANALYSIS.md)** — Comprehensive analysis of risks, scalability limits, simplification opportunities, and production blockers
- **[production_review.md](/docs/planning/production_review.md)** — Top 10 production improvements with implementation steps
- **[PRODUCTION_QUALITY_ASSESSMENT.md](/docs/planning/PRODUCTION_QUALITY_ASSESSMENT.md)** — Quality assessment and testing framework status