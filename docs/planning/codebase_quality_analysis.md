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
| 4 | **Sessions** | **A−** | Backend and frontend are now largely aligned to the intended service/query architecture |
| 5 | **Session Templates** | **B+** | Textbook thin blueprint; service is small but lean |
| 6 | **Analytics & Annotations** | **B+** | Analytics and annotations now both sit behind service boundaries, with testing still lighter than core domains |
| 7 | **Timers / Activity Time-Tracking** | **B** | Timer lifecycle logic now lives in a service, though blueprint-owned orchestration remains |
| 8 | **Auth & Settings** | **C** | No service layer at all; all logic inline in blueprint |
| 9 | **Logging / Event Logs** | **B** | Log reads and retention are now service-backed and use the repo-standard DB session pattern |

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

### 4. Sessions — Grade: A−

**Backend:**
- [sessions_api.py](file:///Users/will/Projects/fractal-goals/blueprints/sessions_api.py) is now transport-oriented across both mutations and reads, delegating to [session_service.py](file:///Users/will/Projects/fractal-goals/services/session_service.py).
- Create, update, delete, add/remove/reorder activities, update metrics, global session list, and session activities reads are all service-delegated.
- Events are emitted in the blueprint (same pattern as goals).

**Frontend:**
- Excellent decomposition: `ActiveSessionContext.jsx` splits into `SessionDataContext`, `SessionUiContext`, `SessionActionsContext`.
- Supporting hooks: `useSessionDetailData`, `useSessionDetailMutations` (23KB), `useSessionDraftAutosave`, `useSessionAchievementNotifications`, `useSessionGoalsViewModel`, `useSessionDuration`.
- 10+ hook test files for session-related hooks.

**Tests:** [test_sessions_api.py](file:///Users/will/Projects/fractal-goals/tests/integration/test_sessions_api.py) at 27KB.

**Gaps:**
- Events are still emitted in the blueprint rather than being fully service-owned after commit.
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

### 6. Analytics & Annotations — Grade: B+

**Analytics Backend:**
- [goal_analytics_service.py](file:///Users/will/Projects/fractal-goals/services/goal_analytics_service.py) properly encapsulates analytics queries.
- Blueprint delegates to service; in-memory cache layer via `analytics_cache.py`.
- Goal metrics endpoints also delegate to `GoalService` / `GoalMetricsService`.

**Annotations Backend:**
- [annotations_api.py](file:///Users/will/Projects/fractal-goals/blueprints/annotations_api.py) now delegates CRUD and read filtering to [annotation_service.py](file:///Users/will/Projects/fractal-goals/services/annotation_service.py).
- Ownership checks, annotation CRUD, soft-delete behavior, and `visualization_context` containment matching now live in the service.

**Frontend:**
- `Analytics.jsx` (8.2KB) and `components/analytics/` subdirectory.
- `useAnalyticsPageData.js` uses centralized query keys.

**Tests:**
- [test_annotations_api.py](file:///Users/will/Projects/fractal-goals/tests/integration/test_annotations_api.py) now covers CRUD plus context-containment filtering.
- [test_goal_analytics_service.py](file:///Users/will/Projects/fractal-goals/tests/integration/test_goal_analytics_service.py) at 2.2KB.

**Gaps:**
- No event emissions for annotation mutations.
- Analytics test coverage is thin relative to the feature's complexity.

---

### 7. Timers / Activity Time-Tracking — Grade: B

**Backend:**
- [timers_api.py](file:///Users/will/Projects/fractal-goals/blueprints/timers_api.py) now delegates activity-instance lifecycle and session pause/resume logic to [timer_service.py](file:///Users/will/Projects/fractal-goals/services/timer_service.py).
- `TimerService` owns create/list/start/complete/update/pause/resume behavior, including datetime parsing and pause-duration handling.
- Deprecated timer-path `datetime.utcnow()` usage was replaced with centralized UTC normalization inside the service.
- Dual GET/POST on single route (`/activity-instances`) is unconventional.

**Frontend:**
- Timer logic is spread across `useSessionDuration.js`, `useSessionTimer.js`, and mutation hooks.

**Tests:** [test_timers_api.py](file:///Users/will/Projects/fractal-goals/tests/integration/test_timers_api.py) at 16.8KB — decent coverage.

**Gaps:**
- `complete_activity_instance` still has inline achievement retrieval/orchestration in the blueprint.
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

### 9. Logging / Event Logs — Grade: B

**Backend:**
- [logs_api.py](file:///Users/will/Projects/fractal-goals/blueprints/logs_api.py) now delegates filtering, date parsing, pagination payload assembly, and clearing to [log_service.py](file:///Users/will/Projects/fractal-goals/services/log_service.py).
- Logs now use the repo-standard `models.get_engine()` plus `get_session(engine)` DB session pattern.
- Clear behavior is now explicitly documented as a hard-delete retention operation because `EventLog` has no `deleted_at` column.

**Frontend:**
- `useLogsData.js` (1.6KB) and `Logs.jsx` (7.2KB).
- `LogsModal.jsx` in modals directory.

**Tests:** [test_logs_api.py](file:///Users/will/Projects/fractal-goals/tests/integration/test_logs_api.py) now covers event-type filtering, date-range filtering, and clear behavior.

**Gaps:**
- Logs still intentionally use hard-delete retention rather than the app-wide soft-delete model.
- No event/retention audit surface exists yet beyond the API itself.

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
| Service layer coverage | ⚠️ 8 of 9 areas fully service-backed |
| Pydantic validation decorator | ✅ Most endpoints, except timers POST and goal completion |
| Serialization separation | ✅ `serializers.py` + `view_serializers.py` |
| Event emissions after commits | ⚠️ Events emitted in blueprints, not always after service commits |
| Soft-delete consistency | ⚠️ Logs uses hard delete; rest uses soft-delete |
| DB session management | ⚠️ Logs uses `get_scoped_session()`; rest uses `get_session(engine)` |

---

## Prioritized Implementation Checklist

This checklist supersedes the original action-item ordering above.
It reflects the current architecture state as of March 10, 2026, including the session/session-detail frontend refactors that have already landed.

### Wave 1 — Active Session Backend Cleanup

- [x] Create `services/timer_service.py`.
- [x] Move activity-instance create/list logic out of [timers_api.py](file:///Users/will/Projects/fractal-goals/blueprints/timers_api.py) into `TimerService`.
- [x] Move timer start/complete/update logic out of [timers_api.py](file:///Users/will/Projects/fractal-goals/blueprints/timers_api.py) into `TimerService`.
- [x] Move session pause/resume cascade logic out of [timers_api.py](file:///Users/will/Projects/fractal-goals/blueprints/timers_api.py) into `TimerService`.
- [x] Move ISO datetime parsing helper out of the blueprint and into the service layer.
- [x] Replace `datetime.utcnow()` usage in timer flows with `datetime.now(timezone.utc)` plus centralized normalization where needed.
- [x] Standardize timer event emission boundaries so the blueprint only emits after successful service results.
- [x] Keep current `async_completion` behavior intact while moving completion orchestration into the service.
- [x] Move `get_all_sessions_endpoint` query from [sessions_api.py](file:///Users/will/Projects/fractal-goals/blueprints/sessions_api.py) into [session_service.py](file:///Users/will/Projects/fractal-goals/services/session_service.py).
- [x] Move `get_session_activities` query from [sessions_api.py](file:///Users/will/Projects/fractal-goals/blueprints/sessions_api.py) into [session_service.py](file:///Users/will/Projects/fractal-goals/services/session_service.py).
- [x] Leave session blueprint endpoints as transport/delegation only.
- [x] Add or update focused backend tests for timer service-backed endpoints.
- [x] Add or update focused backend tests for session list/session-activities service delegation.
- [x] Re-run focused timer/session backend verification after extraction.

Wave 1 verification completed:
- `tests/integration/test_timers_api.py`
- `tests/integration/test_phase1_confidence.py`
- `tests/integration/test_sessions_api.py`

### Wave 2 — Logging And Annotation Service Boundaries

- [x] Create `services/log_service.py`.
- [x] Move log filtering, query building, and date parsing out of [logs_api.py](file:///Users/will/Projects/fractal-goals/blueprints/logs_api.py).
- [x] Replace `get_scoped_session()` usage in logs with the repo-standard DB session pattern.
- [ ] Decide and implement explicit deletion policy for logs:
  - [ ] soft-delete if logs should follow the rest of the app
  - [x] documented hard-delete retention path if logs are intentionally different
- [x] Create `services/annotation_service.py`.
- [x] Move annotation CRUD and visualization-context matching out of [annotations_api.py](file:///Users/will/Projects/fractal-goals/blueprints/annotations_api.py).
- [x] Remove inline ORM/business logic from both blueprints.
- [x] Expand integration tests for logs and annotations beyond the current minimal coverage.

Wave 2 verification completed:
- `tests/integration/test_logs_api.py`
- `tests/integration/test_annotations_api.py`

### Wave 3 — Goals Blueprint Slimming

- [x] Move session micro-goal query logic out of [goals_api.py](file:///Users/will/Projects/fractal-goals/blueprints/goals_api.py) into goal services.
- [x] Replace inline goal-completion validation with the standard request validation pattern.
- [x] Reduce blueprint-owned event orchestration in [goals_api.py](file:///Users/will/Projects/fractal-goals/blueprints/goals_api.py) for goal completion updates.
- [x] Push post-commit event ownership toward service boundaries where feasible.
- [x] Add regression tests for the moved goal query/completion paths.

Wave 3 progress completed so far:
- `GoalService.get_session_micro_goals(...)` now owns the session micro-goal query path.
- `validate_request(..., allow_empty_json=True)` now covers the goal completion toggle path without custom inline validation.
- Manual goal completion now emits its completion/uncompletion event from `GoalService` after commit.
- Goal create/update/delete and target create/delete event emission now lives in `GoalService` rather than `goals_api.py`.
- Global `/api/goals` listing now delegates to `GoalService` instead of running an inline ORM query in the blueprint.

Wave 3 verification completed so far:
- `tests/integration/test_goals_api.py`
- `tests/integration/test_micro_goals.py`
- `tests/integration/test_phase1_confidence.py`

### Wave 4 — Auth And User Services

- [ ] Create `services/auth_service.py`.
- [ ] Create `services/user_service.py` or equivalent account/profile service boundary.
- [ ] Move login/signup/refresh/lockout logic out of [auth_api.py](file:///Users/will/Projects/fractal-goals/blueprints/auth_api.py).
- [ ] Move password/email/username update logic out of [auth_api.py](file:///Users/will/Projects/fractal-goals/blueprints/auth_api.py).
- [ ] Move preferences JSON merge logic out of the blueprint.
- [ ] Move account deletion / anonymization logic out of the blueprint.
- [ ] Replace deprecated `query(...).get()` usage while touching these paths.
- [ ] Preserve current auth integration coverage during the extraction.

### Wave 5 — Cross-Cutting Consistency

- [ ] Standardize “service commit first, event emit second” across timers, sessions, goals, logs, annotations, and auth.
- [ ] Audit event emission ownership in blueprints after service extractions land.
- [ ] Remove or migrate stale [HeaderContext.jsx](file:///Users/will/Projects/fractal-goals/client/src/context/HeaderContext.jsx) from `client/src/context/`.
- [ ] Resolve leftover `client/src/context/` vs `client/src/contexts/` naming inconsistency.
- [ ] Update [index.md](file:///Users/will/Projects/fractal-goals/index.md) once the service-boundary cleanup materially changes the architecture map.

## Recommended Execution Order

1. Wave 1 — highest impact on active production surfaces.
2. Wave 2 — fast standards wins on self-contained backend areas.
3. Wave 3 — broad but manageable after Wave 1/2 service patterns are established.
4. Wave 4 — security-sensitive, highest migration risk, do after the service extraction pattern is stable.
5. Wave 5 — cross-cutting cleanup after the service-boundary moves are complete.

## Notes On Current State

- The earlier sessions frontend concerns in this document are partly historical.
- Session/session-detail frontend architecture has already been substantially decomposed into focused hooks, view models, and thin layout components.
- Wave 1 backend cleanup is complete for the active session surface.
- The largest remaining backend architecture gaps are now:
  - [goals_api.py](file:///Users/will/Projects/fractal-goals/blueprints/goals_api.py)
  - [auth_api.py](file:///Users/will/Projects/fractal-goals/blueprints/auth_api.py)
