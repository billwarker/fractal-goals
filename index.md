# Fractal Goals - Codebase Index

> Read this file first for a high-level map of the repo.
> Update it when the architecture, major workflows, or core tooling meaningfully change.

## Overview

Fractal Goals is a full-stack goal and practice-tracking application built around a hierarchical "fractal" model of work:

- Goals flow from `Ultimate` down through `Immediate`
- Sessions capture real execution work
- Activities, templates, and programs structure recurring practice
- Analytics, dashboards, annotations, and logs explain what happened over time
- Auth, admin tooling, quotas, storage limits, and tier limits provide the current SaaS account boundary

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
- Ownership checks are centralized around user-owned roots/fractals and shared query helpers.
- Quota checks are enforced in service write paths for SaaS resource limits.

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
- Broad invalidation should use centralized query-key prefix helpers, not ad hoc raw arrays.
- Repeated invalidation clusters should use shared helpers in `client/src/utils/queryInvalidation.js` so query churn remains visible and easy to tune.
- Account-owned homepage data must be scoped by the authenticated user id or cleared on auth transitions; auth changes clear the query cache to prevent cross-account data bleed.
- The selection page consumes `/api/fractals` summaries directly, including effective `display_level` metadata, rather than issuing per-fractal goal-level fetches.
- Older hand-managed fetch state has largely been removed.
- Large multi-mode components were decomposed into coordinators plus focused subcomponents/hooks.
- Modal behavior and state reset patterns are more standardized than before.
- The app shell exposes `--app-viewport-height`, using dynamic viewport units when available, so mobile browser chrome does not hide headers or bottom content.

## SaaS And Account Layer

The app has a real account boundary rather than a purely local/single-user model.

Current SaaS/account pieces:

- JWT auth with HttpOnly cookie support
- CSRF double-submit protection for cookie-authenticated mutating requests
- role-backed admin accounts
- invite-key gated tester signup
- user profile, password, email, username, and preferences endpoints
- membership tiers and quota limits for free/paid/legacy users
- per-user app-data storage limits and usage reporting
- quota usage reporting in account settings
- admin user management, invite-key generation, support access into user fractals, and grouped admin user actions for tier/quota updates, temporary passwords, suspend/reactivate, unlock, role changes, soft delete, and hard delete
- admin quota editing consumes backend-owned tier default metadata so reset-to-default behavior stays aligned with quota enforcement
- admin tier quota management persists default free/paid resource quotas and storage limits in `app_settings`; changes can apply to existing tier users or preserve existing users for new-user-only rollout
- user-scoped selection-page cache and recent-fractal localStorage keys
- production security checks for JWT secrets, CORS, and cookie settings
- production security checks for debug mode, shared rate-limit storage, and secure auth cookies
- rate limiting on sensitive auth and selected write endpoints
- frontend production serving uses security headers and immutable caching for built assets

Key backend pieces:

- `services/auth_service.py`
- `services/admin_service.py`
- `services/user_service.py`
- `services/quota_service.py`
- `blueprints/auth_api.py`
- `blueprints/admin_api.py`
- `models/user.py`

Key frontend pieces:

- `client/src/contexts/AuthContext.jsx`
- `client/src/pages/Admin.jsx`
- `client/src/components/modals/AuthModal.jsx`
- `client/src/components/modals/SettingsModal.jsx`

Performance and production-hardening notes:

- Backend responses include `X-Response-Time-Ms`; slow requests are logged using `SLOW_REQUEST_THRESHOLD_MS`.
- API request bodies are capped by `MAX_CONTENT_LENGTH`.
- SQLAlchemy pool sizing is environment-driven via `DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `DB_POOL_TIMEOUT`, and `DB_POOL_RECYCLE_SECONDS`.
- Goal tree/detail, activity-definition, activity-group, program, fractal-summary, session `goals-view`, goal-activity association, and goal-timeline endpoints intentionally batch the relationships or aggregates consumed by their serializers to avoid N+1 round trips against remote Postgres.
- Session detail add/remove activity and timer start/reset mutations keep response serialization on the already-loaded instance path and have query/latency budget coverage.
- Fractal-route header root-goal lookups request `include_children=false`; full goal-tree consumers should use the dedicated tree query instead of duplicating root detail fetches.
- Goal detail timeline data remains lazy-loaded by the frontend; the backend timeline endpoint uses the shared eager goal-tree loader once the user opens the Timeline tab.
- Browser CSRF handling shares a single in-flight `/auth/csrf` fetch across concurrent writes, reads the token from the response body/header for cross-origin production API calls, and retries once on stale-token CSRF 403s.
- Frontend API contract tests cover mutating helpers across goals, programs, sessions, notes, and analytics to catch CSRF regressions and endpoint path drift.
- Backend performance tests include query-count, response-size, and latency budget checks for core endpoints.
- Large-account budget tests cover goal-tree, sessions search, notes pagination, and admin user-list paths.
- Frontend performance coverage includes a large session-goals view-model budget test.

Remaining SaaS build-out to know:

- Stripe/customer-portal/webhook integration is not yet wired as a full billing system.
- Email workflows such as user-initiated password reset, verification, billing notices, and quota warnings are not yet present; admins can generate temporary passwords manually.
- Admin force-password-change is currently an account marker, not an enforced login-time password-change gate.
- Admin support access is explicit and scoped by `admin_user_id` plus `admin_mode=read_only|read_write`; it is not full impersonation.

## Core Domain Areas

### Goals

Goals are the core domain object. The app supports a 5-level hierarchy:

- `UltimateGoal`
- `LongTermGoal`
- `MidTermGoal`
- `ShortTermGoal`
- `ImmediateGoal`

Key supporting backend pieces:

- `services/goal_service.py`
- `services/goal_tree_service.py`
- `services/goal_level_service.py`
- `services/goal_domain_rules.py`
- `services/goal_target_rules.py`
- `services/goal_target_service.py`
- `services/goal_timeline_service.py`
- `services/goal_workflow_service.py`
- `services/goal_analytics_service.py`
- `blueprints/goals_api.py`
- `blueprints/goal_levels_api.py`

Key supporting frontend pieces:

- `client/src/utils/goalNodeModel.js`
- `client/src/hooks/useGoalQueries.js`
- `client/src/hooks/useGoalDetailController.js`
- `client/src/components/GoalDetailModal.jsx`
- `client/src/components/goals/GoalHierarchyList.jsx`
- `client/src/components/flowTree/FlowTreeNode.jsx`
- `client/src/components/flowTree/FlowTreeOptionsPane.jsx`
- `client/src/components/flowTree/flowTreeGraphUtils.js`
- `client/src/pages/FractalGoals.jsx`

Goals page view modes:

- The goals page uses the FlowTree/ReactFlow renderer for both tree and experimental hierarchy layouts.
- Desktop defaults to tree layout; mobile defaults to hierarchy layout.
- `flowTreeGraphUtils.buildGraphPresentation` owns both Dagre tree layout and deterministic hierarchy layout from the same node/edge presentation data.
- `FlowTreeNode` owns custom ReactFlow node rendering, while `FlowTreeOptionsPane` owns the tree/hierarchy widget and shared view options.
- Goal detail/create interactions on the mobile goals page open `GoalDetailModal` as a full-screen modal instead of a docked side panel.
- Sessions page cards render from the sessions search payload without waiting for goal/activity filter reference data; the filter sidebar hydrates those reference lists separately.

### Sessions

Sessions capture actual work performed against a root/fractal.

Sessions support:

- session notes
- manual session-goal links
- activity-derived goal scope for session detail hierarchy views
- activity instances
- timers and manual duration updates

Session activity placement contract:

- the add-activity API accepts `section_index` and persists the new instance id into `attributes.session_data.sections[section_index].activity_ids`
- if a session has no section structure yet, adding to section `0` creates a default `Main` section
- removing an activity marks the instance deleted and removes that instance id from persisted section activity lists
- session detail and session cards both depend on this persisted section ordering, while `activity_instances` remains the canonical instance payload source

Key backend pieces:

- `services/session_service.py`
- `services/session_activity_service.py`
- `services/session_analytics_service.py`
- `services/session_filters.py`
- `services/session_lifecycle_service.py`
- `services/session_runtime.py`
- `services/session_structure.py`
- `services/session_template_stats_service.py`
- `services/timer_service.py`
- `blueprints/sessions_api.py`
- `blueprints/timers_api.py`

Key frontend pieces:

- `client/src/hooks/useSessionQueries.js`
- `client/src/hooks/useSessionDetailData.js`
- `client/src/hooks/useSessionDetailMutations.js`
- `client/src/hooks/useSessionDetailController.js`
- `client/src/contexts/ActiveSessionContext.jsx`
- `client/src/pages/Sessions.jsx`
- `client/src/pages/CreateSession.jsx`
- `client/src/pages/SessionDetail.jsx`
- `client/src/hooks/useSessionGoalsViewModel.js`
- `client/src/hooks/useSessionSidePaneViewModel.js`
- `client/src/components/sessionDetail/SessionGoalHierarchyPanel.jsx`
- `client/src/components/sessionDetail/TimelinePanel.jsx`
- `client/src/components/common/TimelineShell.jsx`

Session detail goal hierarchy contract:

- `session_goals` / `session_goal_ids` represent direct manual session links.
- Activity and activity-group associations define activity-derived scope.
- `GoalTreeService.get_session_goals_view_payload` returns the canonical session detail goal payload, including `activity_goal_ids_by_activity`, `session_activity_ids`, and a pruned goal tree containing the complete lineage for in-scope goals.
- The frontend should render from that canonical payload rather than rebuilding association scope from activity definition caches.

### Notes

Notes are now a first-class cross-cutting domain area rather than just a session subfeature.

They support:

- root/fractal notes
- goal notes, including descendant goal views
- session and activity-instance notes
- image notes
- pinning and timeline-style browsing

Key backend pieces:

- `services/note_service.py`
- `services/serializers.py`
- `services/view_serializers.py`
- `blueprints/notes_api.py`
- `validators.py`

Key frontend pieces:

- `client/src/pages/Notes.jsx`
- `client/src/hooks/useNotesPageQuery.js`
- `client/src/components/notes/`
- `client/src/components/goalDetail/GoalNotesView.jsx`
- `client/src/components/sessionDetail/TimelinePanel.jsx`
- `client/src/components/common/TimelineShell.jsx`

### Activities

Activities are reusable definitions used inside sessions and templates.

They support:

- groups
- metrics
- splits
- goal associations
- progress tracking and comparison settings

Activity metrics now use fractal-level metric definitions as the user-facing configuration source:

- session metric inputs honor metric input type, default value, predefined allowed values, and min/max bounds
- predefined values render as constrained session input options with helper text, not optional quick-pick buttons
- metric definition validation prevents conflicting default/min/max/predefined value settings
- duration metrics are entered as `MM:SS` but stored numerically as seconds for progress calculations
- product/yield behavior is driven by metric-level `is_multiplicative` flags, not the legacy activity-level `metrics_multiplicative` switch

Key backend pieces:

- `services/activity_service.py`
- `services/activity_association_service.py`
- `services/activity_group_service.py`
- `services/activity_metric_service.py`
- `services/metrics.py`
- `blueprints/activities_api.py`

Key frontend pieces:

- `client/src/hooks/useActivityQueries.js`
- `client/src/hooks/useActivityHistory.js`
- `client/src/components/ActivityBuilder.jsx`
- `client/src/components/common/ActivitySearchWidget.jsx`
- `client/src/pages/ManageActivities.jsx`

### Progress Tracking

Progress comparisons are a first-class activity/session feature.

They support:

- persisted `ProgressRecord` history for completed instances
- live comparison hints while a session is still in progress
- activity-level and metric-level aggregation configuration
- root-level progress settings and full-root recomputation
- historical progress APIs for session and activity views

Key backend pieces:

- `services/progress_service.py`
- `services/completion_handlers.py`
- `blueprints/activities_api.py`
- `blueprints/sessions_api.py`
- `blueprints/timers_api.py`

Key frontend pieces:

- `client/src/hooks/useProgressComparison.js`
- `client/src/hooks/useProgressHistory.js`
- `client/src/hooks/useSessionProgressSummary.js`
- `client/src/hooks/useRootProgressSettings.js`
- `client/src/components/sessionDetail/SessionActivityItem.jsx`
- `client/src/components/sessionDetail/TimelinePanel.jsx`
- `client/src/components/modals/SettingsModal.jsx`

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
- program-day completion is driven by per-template required flags plus an optional day-level minimum completed-template threshold; legacy template links default to required
- program days no longer support a note-required completion condition; notes remain available as ordinary session/program context

Templates model reusable session structures.

Key backend pieces:

- `services/programs.py`
- `services/template_service.py`
- `blueprints/programs_api.py`
- `blueprints/templates_api.py`

Program-day scheduling now goes through the programs service/API as a validated backend write path, rather than constructing program session linkage in the client.

Key frontend pieces:

- `client/src/pages/ProgramCalendarPage.jsx`
- `client/src/hooks/useProgramsCalendarData.js`
- `client/src/hooks/useProgramData.js`
- `client/src/hooks/useProgramDetailController.js`
- `client/src/hooks/useProgramDetailMutations.js`
- `client/src/hooks/useProgramDetailViewModel.js`
- `client/src/pages/CreateSessionTemplate.jsx`
- `client/src/components/modals/ProgramBuilder.jsx`
- `client/src/components/modals/ProgramBlockModal.jsx`
- `client/src/components/modals/ProgramDayModal.jsx`
- `client/src/components/programs/ProgramCalendarView.jsx`
- `client/src/components/programs/ProgramBlockView.jsx`
- `client/src/components/programs/ProgramSidebar.jsx`

### Auth and User Settings

Authentication, token refresh, and account/profile mutations now sit behind dedicated services rather than living directly in the blueprint layer.

Key backend pieces:

- `services/auth_service.py`
- `services/user_service.py`
- `blueprints/auth_api.py`

Key frontend pieces:

- `client/src/contexts/AuthContext.jsx`
- `client/src/components/modals/SettingsModal.jsx`

### Analytics, Dashboards, Annotations, and Logs

The app includes historical and analytical tooling on top of the core execution data.

This includes:

- analytics views, dashboards, visualization state, and goal metrics
- frontend chart and heatmap annotations
- event logging and audit history

Key backend pieces:

- `services/analytics_cache.py`
- `services/dashboard_service.py`
- `services/event_logger.py`
- `services/events.py`
- `services/goal_analytics_service.py`
- `services/log_service.py`
- `blueprints/dashboards_api.py`
- `blueprints/logs_api.py`

Key frontend pieces:

- `client/src/pages/Analytics.jsx`
- `client/src/components/analytics/`
- `client/src/components/analytics/visualizations/registry.js`
- `client/src/hooks/useAnalyticsPageData.js`
- `client/src/hooks/useDashboardQueries.js`
- `client/src/components/modals/LogsModal.jsx`
- `client/src/pages/Logs.jsx`

Session analytics note:

- Session trend analytics are consolidated under `sessions:sessionTrends`, a bar chart with configurable day/week/month/year grain and optional session count and summed duration metrics. Retired duration trend, weekly chart, consistency, activity heatmap, completion rate, and planned-vs-actual panel ids are migrated to this visualization.
- Session start/end time distribution supports optional start and end markers, and the session duration histogram supports configurable bucket counts.

Activity analytics note:

- Activity trend analytics are consolidated under `activities:activityTrends`, a mixed chart where completed activity instances render as bars and activity duration renders as a line on a separate y-axis.
- Activity totals live under `activities:activityFrequency` and can switch between completed instance counts and duration. Retired line graph, time-per-activity, personal-best, and metric-volume panel ids are migrated to the consolidated activity visualizations.
- Individual activity metric analytics include `activities:metricTrends`, which plots up to two selected activity metrics as lines over time, and `activities:metricProgress`, which renders persisted progress-comparison percent improvement bars for progress-tracked metrics.
- When global filters resolve to exactly one activity or goal, single-selection analytics panels use that scoped item as their effective selected activity/goal. Multi-item global scopes continue to filter aggregate panels without pretending there is a single selected item.
- Analytics panels now use the app-wide graph-paper visual model: a bounded 20px cell grid using `--color-grid`, with panel geometry stored in whole cells. Only the selected panel can be dragged or resized; selected panels drag from any non-interactive panel space and resize from any edge or corner. Blank graph-paper clicks, including gaps between absolute-positioned panels, clear panel selection. Panel moves preserve dropped positions instead of auto-compacting upward, reject drag/resize proposals that would overlap another panel with a red conflict highlight, rescale proportionally when the filters pane changes workspace bounds, and persist saved-view workspace bounds so restored views scale into the current open/closed filters workspace. Restored views render only after the fitted layout has settled, avoiding visible load-time resize artifacts. A legacy restore fallback expands views that were saved at roughly one filters-pane width narrower than the current closed-pane workspace. The standard Cmd/Ctrl+Shift+D red debug outline remains available around the analytics workspace. The first empty-view panel defaults to the full measured workspace, and layout migration preserves older split-pane saved views.
- The analytics views modal supports saved-view search by name or displayed update date and highlights rows/buttons on hover or keyboard focus.

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
- `services/db_migration_service.py`
- `services/analytics_cache.py`

### Frontend

Most read paths now follow this pattern:

1. Query hook reads from the backend using a canonical query key.
2. UI consumes query data directly instead of mirroring it into local state.
3. Mutation hooks invalidate or update the relevant query family.
4. Optimistic flows are only used where rollback behavior is explicit.

Shared frontend infrastructure to know:

- `client/src/hooks/queryKeys.js`
- `client/src/utils/optimisticQuery.js`
- `client/src/utils/api/core.js`
- `client/src/utils/goalNodeModel.js`
- `client/src/utils/programViewModel.js`
- `client/src/utils/sessionRuntime.js`

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
- Cloud Build deploys backend/frontend Cloud Run services and runs migration jobs with Secret Manager-backed database/JWT settings.
- Current production deploy is a budget private-beta profile: `RATELIMIT_STORAGE_URI=memory://`, `ALLOW_IN_MEMORY_RATELIMIT=true`, `WEB_CONCURRENCY=1`, and Cloud Run `--max-instances=1`.
- Full production should switch `RATELIMIT_STORAGE_URI` to shared Redis-compatible storage and remove the single-instance private-beta constraint.

## Architectural Improvements Already Landed

This repo recently went through a large quality pass. The most important outcomes were:

- The frontend data layer is now query-first.
- Auth, quotas, user settings, and tier-aware usage reporting are now part of the core product layer.
- Analytics dashboards, visualization registry/state, and cache helpers have become first-class infrastructure.
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
- Maintainability: improved substantially, with a known decomposition backlog for the largest services, hooks, and React components

The main remaining work is no longer just incremental cleanup. The highest-leverage next phase is SaaS hardening and scale-readiness:

- decompose large services and UI coordinators before they calcify
- wire real billing, webhook, and email workflows into the quota/account layer
- add async/background job execution for analytics, email, billing sync, and heavy recomputation
- expand observability beyond exception capture into request, latency, quota, and business metrics
- add admin/support tooling for paid-customer operations
