# Fractal Goals - Codebase Index

> Read this file first for a high-level map of the repo.
> Update it when the architecture, major workflows, or core tooling meaningfully change.

## Overview

Fractal Goals is a full-stack goal and practice-tracking application built around a hierarchical "fractal" model of work:

- Goals flow from `Ultimate` down through `Nano`
- Sessions capture real execution work
- Activities, templates, and programs structure recurring practice
- Analytics, annotations, and logs explain what happened over time

The codebase is now organized around two main ideas:

1. The backend owns business rules in service modules, not in route files.
2. The frontend is query-first, with TanStack Query as the main source of truth for remote data.

## Runtime

- Backend: Flask on port `8001`
- Frontend: Vite + React on port `5173`
- Database: PostgreSQL only
- Schema management: Alembic migrations

Development note:

- Local startup now auto-applies pending Alembic migrations by default in development.
- This is meant to protect long-lived local databases from drifting behind the current model/schema.

## Current Architecture

### Backend shape

The backend is split into:

- `blueprints/`: thin HTTP route layers
- `services/`: business logic, orchestration, domain rules, serialization, and shared query helpers
- `models/`: SQLAlchemy models and session/engine management
- `validators.py`: request validation schemas and decorators
- `migrations/`: Alembic schema history

The intended backend flow is:

`request -> blueprint -> validation -> service -> serializer -> response`

Important backend design choices:

- Services are the canonical boundary for validation, ownership checks, and transaction behavior.
- Payload normalization is centralized.
- Serialization is separated from business logic.
- Main domain events are emitted from services after successful commits.
- Soft-delete behavior is standardized across the main app surfaces.

### Frontend shape

The frontend is split into:

- `client/src/pages/`: route-level screens
- `client/src/components/`: reusable UI and feature components
- `client/src/hooks/`: query hooks, orchestration hooks, and feature helpers
- `client/src/contexts/`: auth, header, selection, theme, and lightweight mutation/selection facades
- `client/src/utils/`: API modules, goal-tree normalization, optimistic helpers, formatting, and low-level utilities

The intended frontend flow is:

`page/component -> query hook or mutation hook -> shared query key -> API module`

Important frontend design choices:

- TanStack Query is the canonical remote-data layer.
- Query keys are centralized in `client/src/hooks/queryKeys.js`.
- Older hand-managed fetch state has largely been removed.
- Large multi-mode components were decomposed into coordinators plus focused subcomponents/hooks.
- Modal behavior and state reset patterns are more standardized than before.

## Core Domain Areas

### Goals

Goals are the core domain object. The app supports a 7-level hierarchy:

- `UltimateGoal`
- `LongTermGoal`
- `MidTermGoal`
- `ShortTermGoal`
- `ImmediateGoal`
- `MicroGoal`
- `NanoGoal`

Key supporting backend pieces:

- `services/goal_service.py`
- `services/goal_tree_service.py`
- `services/goal_domain_rules.py`
- `services/goal_target_rules.py`
- `services/goal_analytics_service.py`

Key supporting frontend pieces:

- `client/src/utils/goalNodeModel.js`
- `client/src/hooks/useGoalQueries.js`
- `client/src/hooks/useGoalDetailController.js`
- `client/src/components/GoalDetailModal.jsx`
- `client/src/pages/FractalGoals.jsx`

### Sessions

Sessions capture actual work performed against a root/fractal.

Sessions support:

- session notes
- linked goals
- activity instances
- timers and manual duration updates
- session-specific micro/nano goal flows

Key backend pieces:

- `services/session_service.py`
- `blueprints/sessions_api.py`
- `blueprints/timers_api.py`

Key frontend pieces:

- `client/src/hooks/useSessionQueries.js`
- `client/src/contexts/ActiveSessionContext.jsx`
- `client/src/pages/SessionDetail.jsx`
- `client/src/hooks/useSessionGoalsViewModel.js`

### Activities

Activities are reusable definitions used inside sessions and templates.

They support:

- groups
- metrics
- splits
- goal associations

Key backend pieces:

- `services/activity_service.py`
- `blueprints/activities_api.py`

Key frontend pieces:

- `client/src/hooks/useActivityQueries.js`
- `client/src/components/ActivityBuilder.jsx`
- `client/src/components/common/ActivitySearchWidget.jsx`
- `client/src/pages/ManageActivities.jsx`

### Programs and Templates

Programs model longer planning structures:

- programs
- blocks
- days
- attached goals
- attached session templates

Important program-domain rules now enforced in the backend service layer:

- program scope is defined by the program's selected long-term / mid-term goals
- block goal attachments must stay within that scope and within the block date range
- scheduling and unscheduling program-day occurrences run through `ProgramService`
- calendar-day goal deadline changes on the programs page go through the programs API instead of generic client-side goal mutation assembly

Templates model reusable session structures.

Key backend pieces:

- `services/programs.py`
- `services/template_service.py`
- `blueprints/programs_api.py`
- `blueprints/templates_api.py`

Program-day scheduling now goes through the programs service/API as a validated backend write path, rather than constructing program session linkage in the client.

Key frontend pieces:

- `client/src/pages/Programs.jsx`
- `client/src/pages/ProgramDetail.jsx`
- `client/src/pages/CreateSessionTemplate.jsx`
- `client/src/components/modals/ProgramBuilder.jsx`
- `client/src/components/modals/ProgramDayModal.jsx`

### Auth and User Settings

Authentication, token refresh, and account/profile mutations now sit behind dedicated services rather than living directly in the blueprint layer.

Key backend pieces:

- `services/auth_service.py`
- `services/user_service.py`
- `blueprints/auth_api.py`

Key frontend pieces:

- `client/src/contexts/AuthContext.jsx`
- `client/src/components/modals/SettingsModal.jsx`

### Analytics, Annotations, and Logs

The app includes historical and analytical tooling on top of the core execution data.

This includes:

- analytics views and goal metrics
- chart and heatmap annotations
- event logging and audit history

Key backend pieces:

- `services/event_logger.py`
- `services/events.py`
- `services/annotation_service.py`
- `services/log_service.py`
- `blueprints/annotations_api.py`
- `blueprints/logs_api.py`

Key frontend pieces:

- `client/src/pages/Analytics.jsx`
- `client/src/components/analytics/`
- `client/src/components/modals/LogsModal.jsx`
- `client/src/pages/Logs.jsx`

## Data And State Flow

### Backend

Most write paths now follow this pattern:

1. Validate the incoming request with Pydantic-backed schemas.
2. Normalize payload shape with shared helpers where needed.
3. Perform ownership checks and business rules in a service.
4. Commit inside the service boundary.
5. Emit events only after persistence succeeds.
6. Return serialized response data.

Programs now follow this more strictly for:

- block-day scheduling
- recurring occurrence unscheduling
- program-calendar goal deadline updates
- block goal attachment validation

Shared backend infrastructure to know:

- `services/payload_normalizers.py`
- `services/view_serializers.py`
- `services/serializers.py`
- `services/owned_entity_queries.py`
- `services/service_types.py`

### Frontend

Most read paths now follow this pattern:

1. Query hook reads from the backend using a canonical query key.
2. UI consumes query data directly instead of mirroring it into local state.
3. Mutation hooks invalidate or update the relevant query family.
4. Optimistic flows are only used where rollback behavior is explicit.

Shared frontend infrastructure to know:

- `client/src/hooks/queryKeys.js`
- `client/src/utils/optimisticQuery.js`
- `client/src/utils/goalNodeModel.js`

## Repository Map

### Top-level backend entry points

- `app.py`: Flask app creation, blueprint registration, service initialization, development startup migration hook
- `config.py`: environment loading and runtime configuration
- `db_migrate.py`: Alembic helper wrapper
- `models/`: ORM models and DB session setup

### Important directories

- `blueprints/`: HTTP APIs
- `services/`: application and domain logic
- `migrations/`: Alembic revisions
- `client/src/`: React app source
- `tests/`: backend tests
- `client/src/**/__tests__/` and `client/src/hooks/__tests__/`: frontend tests
- `docs/architecture/`: ADRs
- `docs/planning/`: roadmap and planning docs

## Testing And Quality

The repo now has a real quality toolchain instead of ad hoc checks.

### Main test runner

Use:

```bash
./run-tests.sh
```

Useful modes:

- `./run-tests.sh frontend`
- `./run-tests.sh backend`
- `./run-tests.sh unit`
- `./run-tests.sh integration`
- `./run-tests.sh coverage`
- `./run-tests.sh verify`
- `./run-tests.sh doctor`
- `./run-tests.sh file <path>`

### Frontend

- test runner: Vitest
- lint: ESLint
- maintainability audit: `client/scripts/maintainability-audit.mjs`
- responsive audit: `client/scripts/responsive-audit.mjs`

### Backend

- test runner: Pytest
- env bootstrap: `tests/test_env.py` and `tests/conftest.py`
- migrations: Alembic
- local test DB orchestration: Docker Compose plus `run-tests.sh` helpers

### CI and hooks

- split CI for frontend, backend unit, backend integration, and coverage
- repo-tracked git hooks for pre-commit and pre-push verification

## Architectural Improvements Already Landed

This repo recently went through a large quality pass. The most important outcomes were:

- The frontend data layer is now query-first.
- Service coverage is broad across goals, sessions, activities, notes, templates, programs, and goal levels.
- Major route files were reduced and simplified.
- Serialization, payload normalization, and domain rules were separated into dedicated modules.
- Soft-delete, transaction ownership, and post-commit event behavior were standardized.
- Regression coverage was added across backend and frontend hotspots.
- Tooling was upgraded with a better test runner, audits, CI splits, hooks, ADRs, and roadmap tracking.

The detailed execution history for that work lives in:

- `docs/planning/A_PLUS_S_RANK_ROADMAP.md`

## Where To Start

If you are new to the codebase:

1. Read this file.
2. Read `app.py`, `config.py`, and `client/src/main.jsx`.
3. Read the service for the domain you are changing.
4. Read the matching blueprint and query hooks.
5. Check `client/src/hooks/queryKeys.js` before adding new frontend data flows.
6. Check existing tests before inventing new patterns.

## Practical Rules

- Do not add new manual fetch/state machines if a query hook should own the data.
- Do not add new route-level business rules if a service should own them.
- Prefer extending existing query-key families over inventing one-off cache keys.
- Prefer explicit rollback-safe optimistic behavior, or use invalidate-and-refetch.
- Keep route files thin, service logic testable, and serializer behavior centralized.

## Current Quality Posture

At a high level, the repo is in strong shape structurally:

- Architecture: much cleaner than before
- Testing: broad and meaningful
- Tooling: solid
- Maintainability: improved substantially

The main remaining work at any given moment is likely to be incremental product bugs or cleanup, not missing core architecture.
