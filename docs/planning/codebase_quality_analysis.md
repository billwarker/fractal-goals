# Codebase Quality Analysis — Engineering Standards Ranking

> Evaluated against the architectural standards defined in [index.md](file:///Users/will/Projects/fractal-goals/index.md).
> Reviewed: March 10, 2026

## Scoring Framework

Each section is scored against 5 criteria from index.md:

| Criteria | Description |
|----------|-------------|
| **Backend Flow** | `request → blueprint → validation → service → serializer → response` |
| **Frontend Flow** | `page/component → query hook → shared query key → API module` |
| **Separation** | Service logic ≠ route logic; serialization ≠ business logic |
| **Test Coverage** | Meaningful integration + unit tests for the functional area |
| **Consistency** | Soft-delete, events, ownership checks, error handling patterns |

Grades: **S** (exemplary) · **A** (strong) · **B** (good, minor gaps) · **C** (functional but noticeably off-standard) · **D** (significant deviations)

---

## Rankings Summary

| # | Section | Grade | One-Line Verdict |
|---|---------|-------|------------------|
| 1 | **Activities** | **A** | Clean end-to-end; blueprint is thin, service is comprehensive |
| 2 | **Programs** | **A** | Dedicated service with validation errors, thorough test suite |
| 3 | **Goals** | **A−** | Best service coverage; blueprint is slightly fat (764 lines) |
| 4 | **Sessions** | **B+** | Mostly service-delegated; two inline query endpoints remain |
| 5 | **Session Templates** | **B+** | Textbook thin blueprint; service is small but lean |
| 6 | **Analytics & Annotations** | **B−** | Analytics uses service; annotations blueprint has all CRUD inline |
| 7 | **Timers / Activity Time-Tracking** | **C+** | Heaviest blueprint (601 lines), substantial inline business logic |
| 8 | **Auth & Settings** | **C** | No service layer at all; all logic inline in blueprint |
| 9 | **Logging / Event Logs** | **C** | No service layer; uses `get_scoped_session()` differently from rest |

---

## Detailed Section Analysis

### 1. Activities — Grade: A

**Backend:**
- [activities_api.py](file:///Users/will/Projects/fractal-goals/blueprints/activities_api.py) (516 lines) is a thin blueprint that delegates almost everything to [activity_service.py](file:///Users/will/Projects/fractal-goals/services/activity_service.py) (35KB).
- Uses `validate_request` decorator consistently. Custom `_parse_activity_payload` for activities with translated errors is the one non-standard pattern.
- Service owns all mutations: create, update, delete, goal-associations, batch operations, group reordering.
- Serialization goes through `serialize_activity_definition` and `serialize_activity_group`.

**Frontend:**
- `useActivityQueries.js` uses centralized query keys.
- `ActivitiesContext.jsx` wraps mutations with optimistic cache updates via `queryClient.setQueryData`.
- `ManageActivities.jsx` (21KB) is the largest page — could benefit from decomposition but is functional.

**Tests:** [test_activities_api.py](file:///Users/will/Projects/fractal-goals/tests/integration/test_activities_api.py) at 34KB is the largest integration test file.

**Gaps:**
- `get_activities` GET endpoint has inline ORM query instead of delegating to service.
- `delete_activity` partially delegates (fetches activity inline, then calls `service.delete_activity`).
- `_parse_activity_payload` bypasses the standard `@validate_request` decorator.

---

### 2. Programs — Grade: A

**Backend:**
- [programs_api.py](file:///Users/will/Projects/fractal-goals/blueprints/programs_api.py) (436 lines) is exemplary — every endpoint delegates to `ProgramService` static methods.
- [programs.py](file:///Users/will/Projects/fractal-goals/services/programs.py) (49KB) is the largest service, with `ProgramServiceValidationError` for structured errors.
- Block management, day scheduling/unscheduling, goal attachment — all in the service.

**Frontend:**
- Rich set of hooks: `useProgramData`, `useProgramDetailController`, `useProgramDetailMutations`, `useProgramDetailViewModel`, `useProgramDayViewModel`, `useProgramGoalSets`, `useProgramLogic`.
- 7 dedicated hook tests.

**Tests:** [test_programs_api.py](file:///Users/will/Projects/fractal-goals/tests/integration/test_programs_api.py) at 24KB.

**Gaps:**
- Error handling in blueprint uses string parsing (`"not found" in str(e).lower()`) to decide status codes — fragile.
- Uses `ValueError` exceptions for control flow rather than the `ServiceResult` tuple pattern used elsewhere.
- Missing event bus emissions for program mutations (other sections emit events consistently).

---

### 3. Goals — Grade: A−

**Backend:**
- [goal_service.py](file:///Users/will/Projects/fractal-goals/services/goal_service.py) (1098 lines, 43KB) is the most comprehensive service with proper domain rule extraction into [goal_domain_rules.py](file:///Users/will/Projects/fractal-goals/services/goal_domain_rules.py), [goal_target_rules.py](file:///Users/will/Projects/fractal-goals/services/goal_target_rules.py), and [goal_tree_service.py](file:///Users/will/Projects/fractal-goals/services/goal_tree_service.py).
- Serialization separated into `serializers.py` and `view_serializers.py`.
- Payload normalization uses `normalize_goal_payload`.
- `ServiceResult` type alias used consistently.

**Frontend:**
- `useGoalQueries.js`, `useGoalDetailController.js`, `useGoalForm.js`, `useGoalAssociationMutations.js` — well-decomposed.
- `GoalDetailModal.jsx` (22KB) is large but has been decomposed with sub-components in `components/goalDetail/`.

**Tests:** Multiple test files: `test_goals_api.py` (25KB), `test_goal_service_routes.py`, `test_goal_updates.py`, `test_micro_goals.py`, `test_inherited_activities.py`, `test_goal_metrics.py`.

**Gaps:**
- [goals_api.py](file:///Users/will/Projects/fractal-goals/blueprints/goals_api.py) is **764 lines** — the blueprint is not as thin as Activities or Programs. Several endpoints still have inline serialization calls and event emissions rather than letting the service handle these.
- `update_goal_completion_endpoint` does inline Pydantic validation instead of using `@validate_request`.
- `get_session_micro_goals` has a complex inline SQLAlchemy query that should be in a service.
- Events are emitted in the blueprint rather than after the service commit — violates the "events after successful commits" principle since the service already commits.

---

### 4. Sessions — Grade: B+

**Backend:**
- [sessions_api.py](file:///Users/will/Projects/fractal-goals/blueprints/sessions_api.py) (397 lines) delegates most mutations to [session_service.py](file:///Users/will/Projects/fractal-goals/services/session_service.py) (36KB).
- Create, update, delete, add/remove/reorder activities, update metrics — all service-delegated.
- Events are emitted in the blueprint (same pattern as goals).

**Frontend:**
- Excellent decomposition: `ActiveSessionContext.jsx` splits into `SessionDataContext`, `SessionUiContext`, `SessionActionsContext`.
- Supporting hooks: `useSessionDetailData`, `useSessionDetailMutations` (23KB), `useSessionDraftAutosave`, `useSessionAchievementNotifications`, `useSessionGoalsViewModel`, `useSessionDuration`.
- 10+ hook test files for session-related hooks.

**Tests:** [test_sessions_api.py](file:///Users/will/Projects/fractal-goals/tests/integration/test_sessions_api.py) at 27KB.

**Gaps:**
- `get_all_sessions_endpoint` (global sessions GET) has a full inline ORM query with joins and eager loads — should be in `SessionService`.
- `get_session_activities` also has inline ORM query instead of delegating to service.
- `useSessionDetailMutations.js` at 23KB is very large — could benefit from further splitting.

---

### 5. Session Templates — Grade: B+

**Backend:**
- [templates_api.py](file:///Users/will/Projects/fractal-goals/blueprints/templates_api.py) (142 lines) is the **most textbook-thin blueprint** in the codebase. Every endpoint delegates to [template_service.py](file:///Users/will/Projects/fractal-goals/services/template_service.py) (3.3KB).
- Events emitted after service calls. Consistent error handling.

**Frontend:**
- `CreateSessionTemplate.jsx` (10.9KB) handles template management.

**Tests:** [test_templates_api.py](file:///Users/will/Projects/fractal-goals/tests/integration/test_templates_api.py) at 6.2KB.

**Gaps:**
- Template service is very thin (3.3KB) — ownership checks and CRUD are simple, but there's limited domain logic.
- No frontend hook tests specifically for template queries.
- `TemplateCard.jsx` (7.7KB) is a standalone component without dedicated tests.

---

### 6. Analytics & Annotations — Grade: B−

**Analytics Backend:**
- [goal_analytics_service.py](file:///Users/will/Projects/fractal-goals/services/goal_analytics_service.py) properly encapsulates analytics queries.
- Blueprint delegates to service; in-memory cache layer via `analytics_cache.py`.
- Goal metrics endpoints also delegate to `GoalService` / `GoalMetricsService`.

**Annotations Backend:**
- [annotations_api.py](file:///Users/will/Projects/fractal-goals/blueprints/annotations_api.py) (237 lines) has **all CRUD logic inline** — no `AnnotationService` exists.
- ORM queries, object creation, field updates, soft-delete — all in the blueprint.
- In-Python JSON filtering for `visualization_context` matching is complex logic that belongs in a service.

**Frontend:**
- `Analytics.jsx` (8.2KB) and `components/analytics/` subdirectory.
- `useAnalyticsPageData.js` uses centralized query keys.

**Tests:**
- [test_annotations_api.py](file:///Users/will/Projects/fractal-goals/tests/integration/test_annotations_api.py) is minimal at 3.4KB.
- [test_goal_analytics_service.py](file:///Users/will/Projects/fractal-goals/tests/integration/test_goal_analytics_service.py) at 2.2KB.

**Gaps:**
- **No `AnnotationService`** — biggest gap in this section.
- Annotations blueprint uses `get_engine()` / `get_session()` directly instead of `models.get_engine()` / `models.get_session()` like other blueprints (minor inconsistency).
- No event emissions for annotation mutations.
- Analytics test coverage is thin relative to the feature's complexity.

---

### 7. Timers / Activity Time-Tracking — Grade: C+

**Backend:**
- [timers_api.py](file:///Users/will/Projects/fractal-goals/blueprints/timers_api.py) is **601 lines** — the second-largest blueprint and the most problematic from a standards perspective.
- Contains substantial inline business logic:
  - Timer start/stop/pause/resume logic with paused-time calculations.
  - Activity instance creation with existence checks.
  - Session pause/resume with cascading to activity instances.
  - ISO datetime parsing utility function (`parse_iso_datetime`).
  - Achievement retrieval from `completion_handlers`.
- Uses `datetime.utcnow()` (deprecated) while other parts of the codebase use `datetime.now(timezone.utc)`.
- Dual GET/POST on single route (`/activity-instances`) is unconventional.

**Frontend:**
- Timer logic is spread across `useSessionDuration.js`, `useSessionTimer.js`, and mutation hooks.

**Tests:** [test_timers_api.py](file:///Users/will/Projects/fractal-goals/tests/integration/test_timers_api.py) at 16.8KB — decent coverage.

**Gaps:**
- **No `TimerService`** — all pause/resume/complete logic should be extracted to a service.
- Helper functions (`parse_iso_datetime`) live in the blueprint file.
- `complete_activity_instance` has inline achievement retrieval — mixing concerns.
- Inconsistent async/sync event emission (`emit_async` vs `emit`).

---

### 8. Auth & Settings — Grade: C

**Backend:**
- [auth_api.py](file:///Users/will/Projects/fractal-goals/blueprints/auth_api.py) (379 lines) has **zero service layer** — all logic is inline:
  - JWT token generation and refresh.
  - Login with lockout tracking and failed-attempt counting.
  - Signup with duplicate checking.
  - Password/email/username updates with re-authentication.
  - Account deletion with PII anonymization.
  - Preferences update with JSON merge logic.
- `token_required` decorator has its own DB session management.

**Frontend:**
- `AuthContext.jsx` (3.6KB) manages auth state.
- Settings presumably live within preferences update flow.

**Tests:** [test_auth_api.py](file:///Users/will/Projects/fractal-goals/tests/integration/test_auth_api.py) at 18.7KB — good integration coverage.

**Gaps:**
- **No `AuthService` or `UserService`** — all business rules (lockout, PII anonymization, password hashing) are in the blueprint.
- Inline imports (`from werkzeug.security import generate_password_hash`, `from sqlalchemy.orm.attributes import flag_modified`) are code smells.
- `update_preferences` has inline JSON merge logic with `flag_modified` — should be in a service.
- No event emissions for auth actions (login, signup, password change, account deletion).
- `db_session.query(User).get()` is deprecated in SQLAlchemy 2.0+.

---

### 9. Logging / Event Logs — Grade: C

**Backend:**
- [logs_api.py](file:///Users/will/Projects/fractal-goals/blueprints/logs_api.py) (119 lines) has **all logic inline** — no `LogService`.
- Uses `get_scoped_session()` instead of `models.get_engine()` / `get_session(engine)` — different pattern from every other blueprint.
- Inline SQL query building with date parsing and filtering.
- Hard-delete (`DELETE ... WHERE`) instead of soft-delete — inconsistent with the rest of the codebase.

**Frontend:**
- `useLogsData.js` (1.6KB) and `Logs.jsx` (7.2KB).
- `LogsModal.jsx` in modals directory.

**Tests:** [test_logs_api.py](file:///Users/will/Projects/fractal-goals/tests/integration/test_logs_api.py) — minimal at 1.7KB.

**Gaps:**
- **No `LogService`** — query building and date parsing belong in a service.
- Session management pattern (`get_scoped_session()`) is inconsistent with the rest of the codebase.
- `clear_logs` does a hard delete — all other surfaces use soft-delete.
- Inline `from sqlalchemy import func, delete` and `from datetime import datetime` imports.

---

## Cross-Cutting Observations

### Frontend Patterns

| Pattern | Status |
|---------|--------|
| TanStack Query as data layer | ✅ Widely adopted |
| Centralized query keys | ✅ `queryKeys.js` at 2.5KB |
| Context decomposition | ✅ Strong in Sessions (3-context split) |
| Hook-based logic extraction | ✅ 41 hooks, 23 with tests |
| CSS Modules adoption | ⚠️ Mixed — some files still use `.css`, others `.module.css` |
| Stale `context/` directory | ⚠️ `client/src/context/HeaderContext.jsx` exists alongside `client/src/contexts/` |

### Backend Patterns

| Pattern | Status |
|---------|--------|
| Service layer coverage | ⚠️ 5 of 9 areas fully service-backed |
| Pydantic validation decorator | ✅ Most endpoints, except timers POST and goal completion |
| Serialization separation | ✅ `serializers.py` + `view_serializers.py` |
| Event emissions after commits | ⚠️ Events emitted in blueprints, not always after service commits |
| Soft-delete consistency | ⚠️ Logs uses hard delete; rest uses soft-delete |
| DB session management | ⚠️ Logs uses `get_scoped_session()`; rest uses `get_session(engine)` |

---

## Priority Action Items

1. **Extract `TimerService`** — Move ~400 lines of timer/pause/resume logic from `timers_api.py` into a new service.
2. **Extract `AuthService`/`UserService`** — Move login, signup, lockout, PII anonymization, and preferences logic from `auth_api.py`.
3. **Extract `AnnotationService`** — Move CRUD and context-matching logic from `annotations_api.py`.
4. **Extract `LogService`** — Move query building and date parsing from `logs_api.py`; fix `get_scoped_session()` usage; switch from hard-delete to soft-delete.
5. **Slim `goals_api.py`** — Move inline micro-goal queries and completion validation into services; standardize event emission.
6. **Slim `sessions_api.py`** — Move the two remaining inline GET endpoints into `SessionService`.
7. **Clean up stale `context/` directory** — Move or remove `client/src/context/HeaderContext.jsx`.
8. **Standardize `datetime` usage** — Replace `datetime.utcnow()` calls in `timers_api.py` with `datetime.now(timezone.utc)`.
