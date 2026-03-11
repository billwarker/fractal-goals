# Codebase Quality Analysis — Engineering Standards Ranking

> Evaluated against the architectural standards defined in [index.md](file:///Users/will/Projects/fractal-goals/index.md).
> Reviewed: March 11, 2026

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

## Overall Grade

**Overall codebase grade: A-**

The codebase is now strongly aligned with the architecture described in [index.md](file:///Users/will/Projects/fractal-goals/index.md). The main backend surfaces are service-backed, the main frontend surfaces are query-first, post-commit event ownership is largely standardized, and the session/session-detail area has been substantially decomposed. The remaining distance from `S` is concentrated in a few older large blueprints, uneven analytics/annotation depth, and a handful of intentionally non-standard edges such as log retention and some timer-path transport quirks.

## What Was Accomplished

The following architecture work is now complete:

- Session and session-detail frontend refactoring into focused hooks, contexts, controllers, and view models.
- Timer lifecycle extraction into [timer_service.py](file:///Users/will/Projects/fractal-goals/services/timer_service.py).
- Session read/write extraction into [session_service.py](file:///Users/will/Projects/fractal-goals/services/session_service.py), including global list and session-activities reads.
- Logging extraction into [log_service.py](file:///Users/will/Projects/fractal-goals/services/log_service.py).
- Annotation extraction into [annotation_service.py](file:///Users/will/Projects/fractal-goals/services/annotation_service.py).
- Goal blueprint slimming, including service-owned goal and target event flow.
- Auth/account extraction into [auth_service.py](file:///Users/will/Projects/fractal-goals/services/auth_service.py) and [user_service.py](file:///Users/will/Projects/fractal-goals/services/user_service.py).
- Cross-cutting event-boundary cleanup so the main write surfaces emit from services after commit.
- Frontend context cleanup, including migration of `HeaderContext` into [client/src/contexts/](file:///Users/will/Projects/fractal-goals/client/src/contexts/).
- Documentation updates in [index.md](file:///Users/will/Projects/fractal-goals/index.md) and this analysis file to match the current architecture.

## Overall Alignment To `index.md`

Current alignment to the repo standards is strong:

- **Backend flow:** The dominant pattern is now `request -> blueprint -> validation -> service -> serializer -> response`, especially across sessions, timers, goals, templates, logs, annotations, and auth.
- **Frontend flow:** The dominant pattern is now `page/component -> query hook or mutation hook -> shared query key -> API module`, with the session detail area as the clearest example of the intended architecture.
- **Separation of concerns:** Business rules and mutation orchestration are mostly out of route files and concentrated in services or focused frontend hooks.
- **Consistency:** Soft-delete, ownership checks, query-key usage, and post-commit event behavior are much more standardized than before.
- **Testing discipline:** Focused regression coverage was added around the refactored service boundaries and the session/session-detail flows that had shown production instability.

The remaining misalignment is narrower:

- A few older blueprints are still larger than the standard ideal.
- Analytics and annotation surfaces still lag the core domains in depth of tests and observability.
- Logs intentionally differ from the soft-delete model.
- Some timer/session transport shapes are still less elegant than the newer service-backed surfaces.

---

## Rankings Summary

| # | Section | Grade | One-Line Verdict |
|---|---------|-------|------------------|
| 1 | **Activities** | **A** | Clean end-to-end; blueprint is thin, service is comprehensive |
| 2 | **Programs** | **A** | Dedicated service with validation errors, thorough test suite |
| 3 | **Goals** | **A−** | Strong service ownership with residual blueprint size, but the main write/event paths now sit behind services |
| 4 | **Sessions** | **A** | Backend and frontend now align closely to the intended service/query architecture |
| 5 | **Session Templates** | **A−** | Thin blueprint with service-owned post-commit event flow |
| 6 | **Analytics & Annotations** | **B+** | Analytics and annotations now both sit behind service boundaries, with testing still lighter than core domains |
| 7 | **Timers / Activity Time-Tracking** | **B+** | Timer lifecycle logic and timer-driven events now live in the service layer |
| 8 | **Auth & Settings** | **B+** | Auth and account flows are service-backed, with service-level observability improved |
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
- [goals_api.py](file:///Users/will/Projects/fractal-goals/blueprints/goals_api.py) is still large enough to justify another slimming pass.
- Some goal endpoints still do transport-level serialization and response shaping that could be pushed further toward dedicated service/view helpers.

---

### 4. Sessions — Grade: A

**Backend:**
- [sessions_api.py](file:///Users/will/Projects/fractal-goals/blueprints/sessions_api.py) is now transport-oriented across both mutations and reads, delegating to [session_service.py](file:///Users/will/Projects/fractal-goals/services/session_service.py).
- Create, update, delete, add/remove/reorder activities, update metrics, global session list, and session activities reads are all service-delegated.
- Main session and session-activity write events now emit from services after commit.

**Frontend:**
- Excellent decomposition: `ActiveSessionContext.jsx` splits into `SessionDataContext`, `SessionUiContext`, `SessionActionsContext`.
- Supporting hooks: `useSessionDetailData`, `useSessionDetailMutations` (23KB), `useSessionDraftAutosave`, `useSessionAchievementNotifications`, `useSessionGoalsViewModel`, `useSessionDuration`.
- 10+ hook test files for session-related hooks.

**Tests:** [test_sessions_api.py](file:///Users/will/Projects/fractal-goals/tests/integration/test_sessions_api.py) at 27KB.

**Gaps:**
- `useSessionDetailMutations.js` at 23KB is still large and could benefit from one more split.
- Session-side activity/timer behavior still spans two blueprints, even though the write logic now lands in services.

---

### 5. Session Templates — Grade: A−

**Backend:**
- [templates_api.py](file:///Users/will/Projects/fractal-goals/blueprints/templates_api.py) (142 lines) is the **most textbook-thin blueprint** in the codebase. Every endpoint delegates to [template_service.py](file:///Users/will/Projects/fractal-goals/services/template_service.py).
- Template create/update events now emit from the service after commit. Error handling is consistent.

**Frontend:**
- `CreateSessionTemplate.jsx` (10.9KB) handles template management.

**Tests:** [test_templates_api.py](file:///Users/will/Projects/fractal-goals/tests/integration/test_templates_api.py) at 6.2KB.

**Gaps:**
- Template service remains intentionally thin because the domain is still CRUD-heavy rather than rule-heavy.
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
- Annotation writes still have lighter downstream observability than the core goal/session surfaces.
- Analytics test coverage is thin relative to the feature's complexity.

---

### 7. Timers / Activity Time-Tracking — Grade: B+

**Backend:**
- [timers_api.py](file:///Users/will/Projects/fractal-goals/blueprints/timers_api.py) now delegates activity-instance lifecycle and session pause/resume logic to [timer_service.py](file:///Users/will/Projects/fractal-goals/services/timer_service.py).
- `TimerService` owns create/list/start/complete/update/pause/resume behavior, including datetime parsing and pause-duration handling.
- Deprecated timer-path `datetime.utcnow()` usage was replaced with centralized UTC normalization inside the service.
- Dual GET/POST on single route (`/activity-instances`) is unconventional.

**Frontend:**
- Timer logic is spread across `useSessionDuration.js`, `useSessionTimer.js`, and mutation hooks.

**Tests:** [test_timers_api.py](file:///Users/will/Projects/fractal-goals/tests/integration/test_timers_api.py) at 16.8KB — decent coverage.

**Gaps:**
- `complete_activity_instance` still enriches the HTTP response with achievements in the blueprint after the service mutation returns.
- The dual GET/POST `/activity-instances` route shape is still less explicit than the rest of the API.

---

### 8. Auth & Settings — Grade: B+

**Backend:**
- [auth_api.py](file:///Users/will/Projects/fractal-goals/blueprints/auth_api.py) now delegates signup/login/refresh/token resolution to [auth_service.py](file:///Users/will/Projects/fractal-goals/services/auth_service.py).
- Account/profile mutations now delegate to [user_service.py](file:///Users/will/Projects/fractal-goals/services/user_service.py): preferences, password, email, username, and account deletion/anonymization.
- Deprecated auth-path `query(...).get()` usage was replaced with `db_session.get(...)` inside the new user service.
- `token_required` still lives in the blueprint layer, but it now resolves users through `AuthService` instead of holding the token lookup logic inline.

**Frontend:**
- `AuthContext.jsx` (3.6KB) manages auth state.
- Settings presumably live within preferences update flow.

**Tests:** [test_auth_api.py](file:///Users/will/Projects/fractal-goals/tests/integration/test_auth_api.py) at 18.7KB — good integration coverage.

**Gaps:**
- Auth actions still rely on service logging rather than first-class domain events.
- The auth decorator remains blueprint-owned rather than part of a more centralized auth boundary.

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
| Context directory consistency | ✅ `HeaderContext` now lives under `client/src/contexts/` with the rest of the app contexts |

### Backend Patterns

| Pattern | Status |
|---------|--------|
| Service layer coverage | ✅ All major areas are now service-backed |
| Pydantic validation decorator | ✅ Used across nearly all write endpoints, with only a few custom timer-path validations left |
| Serialization separation | ✅ `serializers.py` + `view_serializers.py` |
| Event emissions after commits | ✅ Main write surfaces now emit from services after commit |
| Soft-delete consistency | ⚠️ Logs uses hard delete; rest uses soft-delete |
| DB session management | ✅ Main surfaces now use the repo-standard `get_session(engine)` pattern |

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

- [x] Create `services/auth_service.py`.
- [x] Create `services/user_service.py` or equivalent account/profile service boundary.
- [x] Move login/signup/refresh/lockout logic out of [auth_api.py](file:///Users/will/Projects/fractal-goals/blueprints/auth_api.py).
- [x] Move password/email/username update logic out of [auth_api.py](file:///Users/will/Projects/fractal-goals/blueprints/auth_api.py).
- [x] Move preferences JSON merge logic out of the blueprint.
- [x] Move account deletion / anonymization logic out of the blueprint.
- [x] Replace deprecated `query(...).get()` usage while touching these paths.
- [x] Preserve current auth integration coverage during the extraction.

Wave 4 verification completed:
- `tests/integration/test_auth_api.py`

### Wave 5 — Cross-Cutting Consistency

- [x] Standardize “service commit first, event emit second” across timers, sessions, goals, logs, annotations, and auth-adjacent account flows.
- [x] Audit event emission ownership in blueprints after service extractions land.
- [x] Remove or migrate stale [HeaderContext.jsx](file:///Users/will/Projects/fractal-goals/client/src/contexts/HeaderContext.jsx) from the old `client/src/context/` location.
- [x] Resolve leftover `client/src/context/` vs `client/src/contexts/` naming inconsistency.
- [x] Update [index.md](file:///Users/will/Projects/fractal-goals/index.md) once the service-boundary cleanup materially changes the architecture map.

Wave 5 verification completed:
- `tests/integration/test_timers_api.py`
- `tests/integration/test_sessions_api.py`
- `tests/integration/test_templates_api.py`
- `tests/integration/test_notes_api.py`
- `tests/integration/test_auth_api.py`

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
- Wave 5 cross-cutting consistency cleanup is complete for the current architecture plan.
- The largest remaining architecture gaps are now:
  - blueprint size reduction in a few older large files (`goals_api.py`, some auth/session route shells)
  - deeper analytics/annotation test and observability coverage
