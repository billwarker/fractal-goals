# Implementation Roadmap

> Compiled: March 10, 2026
> References: [codebase_quality_analysis.md](file:///Users/will/Projects/fractal-goals/docs/planning/codebase_quality_analysis.md) · [performance_analysis.md](file:///Users/will/Projects/fractal-goals/docs/planning/performance_analysis.md)

---

## Part 1 — Closing Distance to A

These are the concrete items that keep the overall grade at A− instead of a clean A. Each is scoped, low-risk, and directly addresses an identified gap.

### 1.1 Goals Blueprint Final Slim (goals_api.py 607 → ~400 lines)

- [ ] Push response serialization out of route handlers — create view helpers (e.g. `serialize_goal_response`, `serialize_goal_tree_response`) that live in `view_serializers.py` so blueprints return plain `service_result → jsonify(payload)`.
- [ ] Extract the analytics cache lookup/store pattern from `get_goal_analytics` into a reusable decorator or utility (it's duplicated boilerplate with `get_analytics` / `set_analytics` calls).
- [ ] Move `_sync_targets` injection out of every endpoint — use a factory or constructor default so each handler doesn't manually pass it.

### 1.2 Session Detail Frontend Hook Split

- [ ] Split `useSessionDetailMutations.js` (23KB) into focused sub-hooks:
  - `useSessionActivityMutations` — add/remove/reorder activity instances
  - `useSessionTimerMutations` — start/stop/pause/resume timers
  - `useSessionMetricMutations` — metric and set CRUD
  - `useSessionGoalMutations` — goal association adds/removes
  - `useSessionNoteMutations` — note CRUD
- [ ] Each sub-hook should own its query invalidation and optimistic update logic.

### 1.3 Auth Domain Events

- [ ] Add event bus emissions for auth actions: `USER_SIGNED_UP`, `USER_LOGGED_IN`, `USER_LOGIN_FAILED`, `ACCOUNT_LOCKED`, `ACCOUNT_DELETED`.
- [ ] Wire these into the existing `EventLog` system so login/lockout history is observable alongside domain events.

### 1.4 Dual DB Session Consolidation

- [x] Refactor `token_required` to set the resolved user on Flask's `g` object and pass the DB session through via `g.db_session`, so the downstream handler reuses the same connection.
- [x] Update all blueprints to read from `g.db_session` instead of creating `engine = models.get_engine(); db_session = get_session(engine)` per endpoint.
- [x] This eliminates the 2-sessions-per-request overhead.

### 1.5 Events for Programs

- [ ] Add event bus emissions for program mutations: `PROGRAM_CREATED`, `PROGRAM_UPDATED`, `PROGRAM_DELETED`, `PROGRAM_BLOCK_CREATED`, `PROGRAM_DAY_COMPLETED`.
- [ ] These are the only major section missing event emissions entirely.

### 1.6 Programs Error Handling

- [ ] Replace string-parsing error detection (`"not found" in str(e).lower()`) with typed exceptions or the `ServiceResult` tuple pattern.
- [ ] Consider a `ProgramServiceError(status_code, message)` exception class to unify error handling with the rest of the codebase.

### 1.7 Schema Introspection Cache

- [x] Cache `session_goals_supports_source()` as a module-level variable in `goal_service.py` (the standalone function at L79-81). `SessionService` already caches it; the standalone function does not.
- [x] This eliminates a SQLAlchemy `inspect` call on every goal-related request.

---

## Part 2 — Distance to S

S-rank means the architecture is not just correct but exemplary: no tech debt, comprehensive observability, fully testable, consistently documented, and ready for scale. These items go beyond gap-closing into excellence.

### Architecture & Patterns

- [ ] **2.1 Unified request lifecycle middleware** — Create a Flask `before_request` / `after_request` pair that handles DB session creation, auth resolution, request ID generation, and session cleanup. Eliminate per-endpoint boilerplate.
- [ ] **2.2 Request-scoped DB session** — All services, event handlers, and serializers within a single request should share one DB session via Flask `g`. This is the single highest-leverage architecture change.
- [ ] **2.3 Structured error types** — Replace ad-hoc `(None, "error string", status)` tuples with a `ServiceError` exception hierarchy. Each service raises, the blueprint catches with a single error handler. Eliminates repetitive `if error: return jsonify` blocks.
- [ ] **2.4 Blueprint generator / base class** — Extract the repeated `engine = get_engine(); db_session = get_session(engine); try/except/finally` pattern into a decorator or Flask Blueprint subclass. Every endpoint currently repeats ~8 lines of boilerplate.
- [ ] **2.5 API versioning** — Add `v1` prefix to all routes. Future API changes won't need backward-compatible shimming.
- [ ] **2.6 OpenAPI/Swagger spec** — Auto-generate from Pydantic schemas and Flask routes. Enables contract testing and client code generation.

### Separation of Concerns

- [ ] **2.7 View serializer completion** — Move all remaining `serialize_*` calls out of blueprints into view-layer functions. Blueprints should never import from `serializers.py` directly; they should call service methods that return pre-serialized payloads.
- [ ] **2.8 Thin event handler refactor** — `completion_handlers.py` (982 lines) is the largest file outside services. Extract into: `TargetEvaluationService`, `AchievementTracker`, `CompletionCascadeHandler`. Each should be independently testable.
- [ ] **2.9 Extract `_extract_def_id` and section hydration** from `serializers.py` into a `session_hydrator.py` module. The 100+ line section normalization block (L282-360) is business logic disguised as serialization.
- [ ] **2.10 Separate query layer** — For the most complex services (`GoalService`, `SessionService`, `ProgramService`), extract raw query building into repository/query classes. Services should orchestrate business rules, not construct SQLAlchemy queries.

### Test Coverage

- [ ] **2.11 Unit tests for all services** — Currently integration tests dominate. Add pure unit tests for service methods with mocked DB sessions: `GoalService`, `SessionService`, `ProgramService`, `TimerService`, `CompletionHandlers`.
- [ ] **2.12 Contract tests for serializers** — Snapshot tests for `serialize_session`, `serialize_goal`, `serialize_program` outputs. These are the API contract — changes should be intentional.
- [ ] **2.13 Frontend component tests** — Add React Testing Library tests for key views: `SessionDetail`, `GoalDetailModal`, `ProgramDetail`, `Analytics`. Currently test coverage is hook-focused but view-sparse.
- [ ] **2.14 Property-based tests for goal tree operations** — Use Hypothesis (Python) or fast-check (JS) to verify `serialize_goal` handles arbitrary tree depths, `buildFlattenedGoalTree` is idempotent, and `deriveEvidenceGoalIds` is commutative.
- [ ] **2.15 E2E smoke test suite** — Playwright or Cypress tests for the 5 critical user flows: create fractal → create session → start timer → complete activity → complete session.

### Observability & Documentation

- [ ] **2.16 Structured logging** — Replace `logger.info(f"...")` with structured `logger.info("event", extra={"session_id": ..., "root_id": ...})`. Enable log aggregation and search.
- [ ] **2.17 Request timing middleware** — Log elapsed time per request, per service call, and per DB query. Identify slow endpoints empirically.
- [ ] **2.18 Health check endpoint** — Add `/api/health` that verifies DB connectivity, returns service versions, and reports cache status.
- [ ] **2.19 Architecture decision records (ADRs)** — Document the "why" behind key decisions: soft-delete policy, event bus design, session_goals schema migration, analytics cache strategy.
- [ ] **2.20 Service interface documentation** — Each service class should have a docstring block describing its responsibilities, invariants, and dependencies.

### Frontend Excellence

- [ ] **2.21 TypeScript migration** — Convert hooks, contexts, and utilities from JS to TS. Start with `queryKeys.ts`, `goalNodeModel.ts`, and `useFlowTreeMetrics.ts` where type safety has the most impact.
- [ ] **2.22 CSS Modules completion** — Migrate remaining `.css` files to `.module.css` for component-scoped styles. The doc notes this is currently mixed.
- [ ] **2.23 Error boundary coverage** — Add React error boundaries to every route-level component. Currently silently swallowed errors may corrupt UI state.
- [ ] **2.24 Accessibility audit** — Ensure all interactive elements have proper ARIA labels, keyboard navigation, and focus management. Modals (`GoalDetailModal`, session sidepanel) are highest priority.
- [ ] **2.25 Bundle analysis** — Run `vite-bundle-visualizer` and identify oversized dependencies. Target < 200KB gzipped initial bundle.

---

## Part 3 — Performance Enhancements (30+)

Organized by area. Each item includes the specific code location and expected impact.

### Backend — Serialization (P1-P6)

- [ ] **P1. Create `serialize_session_list_item`** — Light serializer returning only scalar fields + instance count + goal names. Skip full instance/note/section serialization for list views. *Files:* `serializers.py`, `session_service.py`. *Impact:* 80-90% payload reduction on session list.

- [ ] **P2. Eliminate double-serialization in `serialize_session`** — The section hydration loop (L282-360) re-serializes instances that were already serialized at L247. Build a `{instance_id: serialized_dict}` map once and reference it in sections. *File:* `serializers.py`. *Impact:* 2× fewer serialize calls per session.

- [ ] **P3. Create `serialize_goal_list_item`** — For list contexts (session goal cards, program goal chips), return only `id`, `name`, `type`, `level_id`, `completed`. Skip `smart_status`, `targets`, `attributes`, `level_characteristics`. *File:* `serializers.py`. *Impact:* ~70% reduction per goal in list context.

- [ ] **P4. Pre-compute `group_path` in `serialize_activity_instance`** — The group parent chain walk (L100-107) traverses up to 3 levels on every call. Cache the `group_path` on the `ActivityGroup` model or compute it once during eager-load. *File:* `serializers.py`. *Impact:* Eliminates O(depth) traversal per instance.

- [ ] **P5. Remove redundant `attributes` nesting in `serialize_session`** — The response includes the same data at `result["attributes"]`, `result["attributes"]["session_data"]`, and top-level fields. Consolidate into a single flat structure. *File:* `serializers.py`. *Impact:* 30-40% reduction in session response size.

- [ ] **P6. Lazy-serialize notes with `has_notes` flag** — Don't serialize notes in the session response unless specifically requested. Add a `has_notes: bool` + `note_count: int` to the default payload; return full notes only when `include_notes=true` query param is set. *Files:* `serializers.py`, `session_service.py`. *Impact:* Avoids note serialization for all non-detail views.

### Backend — Query Efficiency (P7-P14)

- [ ] **P7. Eager-load `targets_rel` and `level` in goal tree queries** — `GoalTreeService.get_session_goals_view_payload` loads `children`, `associated_activities`, `associated_activity_groups` but not `targets_rel`, `sessions`, or `level`. Add these to the `selectinload` chain. *File:* `goal_tree_service.py`. *Impact:* Eliminates N+1 for every child in the goal tree.

- [ ] **P8. Replace `goal.sessions[0].id` with a direct query** — L181 of `serialize_goal` accesses `goal.sessions[0].id`, triggering a lazy load of the entire `sessions` relationship just for one ID. Replace with a scalar subquery or precomputed field. *File:* `serializers.py`. *Impact:* Eliminates a full relationship load per goal.

- [ ] **P9. Replace dual-query in `list_activity_instances`** — `TimerService.list_activity_instances` queries all session IDs, then queries instances by `IN(session_ids)`. Replace with a single `JOIN` query: `ActivityInstance.join(Session).filter(Session.root_id == root_id)`. *File:* `timer_service.py`. *Impact:* 1 query instead of 2.

- [ ] **P10. Add DB indexes for hot query paths** — Add composite indexes on `(session_id, deleted_at)` for `ActivityInstance`, `(root_id, deleted_at)` for `Goal`, `(root_id, event_type)` for `EventLog`. *File:* Alembic migration. *Impact:* Faster filtering on all major list queries.

- [ ] **P11. Use `selectinload` batch limiting** — For session list queries loading 10 sessions with 5+ instances each, configure `selectinload` batch size (e.g., `selectinload(...).options(sa.orm.Load(ActivityInstance).subqueryload(...))`) to avoid cartesian joins. *File:* `session_service.py`. *Impact:* Reduces query result set sizes.

- [ ] **P12. Pagination for GET activities** — The activities list endpoint returns all activities for a fractal with no limit. Add `limit`/`offset` with a default cap of 100. *File:* `activities_api.py` or `activity_service.py`. *Impact:* Prevents unbounded response sizes.

- [ ] **P13. Pagination for GET annotations** — Same issue as activities. Add `limit`/`offset`. *File:* `annotation_service.py`. *Impact:* Prevents unbounded responses.

- [ ] **P14. SQL-level annotation context filtering** — `_context_contains` currently loads all annotations then filters in Python using JSON comparison. Use PostgreSQL's `@>` JSON containment operator at the query level. *File:* `annotation_service.py`. *Impact:* Database does the filtering instead of Python.

### Backend — Completion Handlers (P15-P20)

- [x] **P15. Pass DB session through event handlers** — Add `db_session` to the Event data payload. Handlers use the caller's session instead of creating new ones via `_get_db_session()`. *Files:* `completion_handlers.py`, `events.py`. *Impact:* Eliminates 3-5 concurrent DB connections per completion cascade.

- [x] **P16. Replace `serialize_activity_instance` in `_run_evaluation_for_instance`** — The handler only needs `metric_values` and `sets` for target evaluation. Read `instance.metric_values` directly from the ORM and parse `instance.data` for sets. Don't build the full serialized payload. *File:* `completion_handlers.py`. *Impact:* Eliminates group tree walk, JSON data parsing, and full serialization in the hot path.

- [ ] **P17. Batch target reversion** — `_revert_achievements_for_instance` updates targets one-by-one with N+1 on `target.goal.targets_rel`. Eager-load `goal` and `goal.targets_rel` in the initial query, or use a bulk `UPDATE ... SET completed=False WHERE completed_instance_id = :id`. *File:* `completion_handlers.py`. *Impact:* 1 query instead of N.

- [ ] **P18. Debounce `ACTIVITY_METRICS_UPDATED` events** — Rapid metric edits (e.g., typing a value) fire an event per keystroke. The handler reverts and re-evaluates everything each time. Add a debounce window (e.g., 500ms) at the event emission level. *Files:* `timer_service.py`, `completion_handlers.py`. *Impact:* Reduces redundant recomputation.

- [ ] **P19. Replace `threading.local()` achievement context** — `_achievement_context` is fragile with async event emission. Replace with a request-scoped store on Flask `g`, or return achievements directly from the service result. *File:* `completion_handlers.py`. *Impact:* Correctness under async + cleaner architecture.

- [ ] **P20. Avoid redundant goal loading in cascades** — When multiple targets for the same goal are evaluated in sequence, each checks `all_active_targets_completed(goal)` which re-queries `goal.targets_rel`. Cache the target list for the current evaluation pass. *File:* `completion_handlers.py`. *Impact:* Eliminates repeated relationship access.

### Backend — Caching & Analytics (P21-P25)

- [x] **P21. Targeted analytics cache invalidation** — Replace `@event_bus.on("*")` with specific event subscriptions: `SESSION_COMPLETED`, `GOAL_COMPLETED`, `ACTIVITY_INSTANCE_COMPLETED`, `TARGET_ACHIEVED`. Ignore UI-only events. *File:* `analytics_cache.py`. *Impact:* Cache actually survives during active sessions.

- [ ] **P22. Analytics: pre-build `session_id → session` map** — The `activity_durations_by_date` loop (L142-154 of `goal_analytics_service.py`) does `next(session for session in sessions_for_goal if ...)` per instance — O(I × S). Build a `{session_id: session_dict}` map for O(1) lookups. *File:* `goal_analytics_service.py`. *Impact:* O(G × I) → O(G + I).

- [ ] **P23. Database-level analytics aggregation** — For large fractals, replace the 3-table Python-side aggregation with SQL `GROUP BY` queries: `SELECT goal_id, COUNT(*), SUM(duration_seconds) FROM ... GROUP BY goal_id`. *File:* `goal_analytics_service.py`. *Impact:* Orders of magnitude faster for 1000+ sessions.

- [ ] **P24. ETag support for goal tree responses** — Goal tree payloads can be 200KB+. Add ETag headers based on `max(updated_at)` of goals in the tree. Return `304 Not Modified` when unchanged. *Files:* `goals_api.py`, `goal_service.py`. *Impact:* Eliminates redundant large payload transfers.

- [ ] **P25. Redis-backed analytics cache** — Replace process-local `_ANALYTICS_BY_ROOT` dict with Redis. Shared across workers, survives restarts, and supports TTL natively. *File:* `analytics_cache.py`. *Impact:* Cache consistency across processes.

### Frontend — Computation (P26-P30)

- [ ] **P26. Memoize `goalNodeModel.js` tree operations** — The 4706-line model does full tree walks on every update. Add `WeakMap`-based memoization keyed on the raw goal tree reference. Only recompute when the tree data actually changes. *File:* `goalNodeModel.js`. *Impact:* Eliminates redundant O(N) traversals.

- [ ] **P27. Web Worker for `deriveGraphMetrics`** — Move the O(sessions × instances × activities) computation in `useFlowTreeMetrics.js` to a Web Worker. Return results asynchronously and display a lightweight skeleton while computing. *File:* `useFlowTreeMetrics.js`. *Impact:* Unblocks main thread during metric computation.

- [ ] **P28. Stabilize `useMemo` dependencies in `useFlowTreeMetrics`** — The hook depends on `sessions`, `activities`, `activityGroups`, `programs` — all arrays. If the parent re-renders with new array references (even if content is identical), the entire computation re-runs. Use `useMemo` with deep equality or stable query references. *File:* `useFlowTreeMetrics.js`. *Impact:* Prevents unnecessary recomputation from reference changes.

- [ ] **P29. Split `queryKeys.js` into domain modules** — The 2.5KB centralized file forces re-evaluation of all key factories on import. Split into `goalQueryKeys.js`, `sessionQueryKeys.js`, `programQueryKeys.js`, etc. *File:* `queryKeys.js`. *Impact:* Better tree-shaking and code splitting.

- [ ] **P30. Lazy-load analytics page** — The Analytics page imports heavy charting libraries. Use `React.lazy()` with `Suspense` to defer loading until navigation. *File:* `App.jsx` or router config. *Impact:* Reduces initial bundle size.

### Frontend — Rendering (P31-P35)

- [ ] **P31. Virtual scrolling for session list** — Sessions list renders all items to the DOM. Use `react-window` or `@tanstack/virtual` for windowed rendering. *File:* `Sessions.jsx` or relevant list component. *Impact:* Constant DOM size regardless of session count.

- [ ] **P32. Virtual scrolling for activity list** — Same for the activities management page. *File:* `ManageActivities.jsx`. *Impact:* Same as above.

- [ ] **P33. Debounce search/filter inputs** — Filter inputs on session list, activity list, and logs should debounce before triggering query invalidation. *Files:* Any component with search/filter state. *Impact:* Fewer re-renders and API calls during typing.

- [ ] **P34. `React.memo` for heavy list items** — Wrap `SessionCard`, `ActivityCard`, `TargetCard`, and `ProgramDayCard` in `React.memo` with shallow comparison. *Files:* Respective component files. *Impact:* Prevents re-render of unchanged items.

- [ ] **P35. Skeleton loading states** — Replace spinners with skeleton placeholders for the main page shells (Goals, Sessions, Analytics, Programs). This improves perceived performance even when actual load times don't change. *Files:* Page components. *Impact:* Better perceived performance.

### Infrastructure (P36-P38)

- [ ] **P36. Connection pooling** — Verify `SQLAlchemy` engine is configured with proper pool settings (`pool_size`, `max_overflow`, `pool_recycle`). The current `get_engine()` pattern creates a new engine per call unless cached. *File:* `models/__init__.py`. *Impact:* Prevents connection exhaustion under load.

- [ ] **P37. Response compression** — Enable gzip/brotli compression via Flask middleware (e.g., `flask-compress`). Large JSON payloads (sessions, goal trees, analytics) compress 5-10× well. *File:* `app.py` or WSGI config. *Impact:* 5-10× reduction in wire transfer size.

- [ ] **P38. Database query logging in development** — Enable SQLAlchemy `echo=True` or configure the `sqlalchemy.engine` logger in development to identify accidental queries. Add a query counter middleware that warns if a single request exceeds a threshold (e.g., 10 queries). *File:* `config.py`, development settings. *Impact:* Makes N+1 queries immediately visible during development.

---

## Recommended Execution Order

### Phase 1 — High-Impact, Low-Risk (1-2 weeks)
Close the A− → A gap and land the highest-ROI performance wins.

| Priority | Items | Rationale |
|----------|-------|-----------|
| 1st | **1.4** (Dual DB session) + **P15** (Completion handler sessions) | Architecture-level fix that improves every endpoint |
| 2nd | **P1** (Session list serializer) + **P2** (Double-serialization) | Biggest payload reduction |
| 3rd | **1.7** (Schema introspection cache) + **P21** (Analytics cache granularity) | Quick wins, 30 minutes each |
| 4th | **P7** (Goal tree eager-loading) + **P8** (goal.sessions[0] fix) | Eliminates N+1 in goal tree |

### Phase 2 — Architecture Cleanup (1-2 weeks)
Finish the blueprint slimming and add missing observability.

| Priority | Items | Rationale |
|----------|-------|-----------|
| 1st | **1.1** (Goals blueprint slim) + **1.6** (Programs error handling) | Blueprint consistency |
| 2nd | **1.3** (Auth domain events) + **1.5** (Programs events) | Event bus completeness |
| 3rd | **1.2** (Session mutations hook split) | Frontend architecture parity |
| 4th | **2.1 + 2.4** (Request lifecycle middleware) | Eliminates per-endpoint boilerplate |

### Phase 3 — Performance Depth (2-3 weeks)
Address the remaining serialization, query, and frontend computation issues.

| Priority | Items | Rationale |
|----------|-------|-----------|
| 1st | **P16** + **P17** + **P20** (Completion handler optimization) | Hot path during active sessions |
| 2nd | **P22** + **P23** (Analytics O(n³) fix) | Analytics page load time |
| 3rd | **P26** + **P28** (Frontend memoization) | Main thread performance |
| 4th | **P31** + **P32** (Virtual scrolling) | DOM rendering for large datasets |
| 5th | **P10** (Database indexes) + **P36** (Connection pooling) | Infrastructure-level |

### Phase 4 — Excellence (Ongoing)
Items from Part 2 (S-rank) that can be done incrementally.

| Priority | Items | Rationale |
|----------|-------|-----------|
| 1st | **2.2** (Request-scoped DB session) | Prerequisite for many other improvements |
| 2nd | **2.3** (Structured error types) | Code clarity |
| 3rd | **2.8** (Completion handler decomposition) | Testability |
| 4th | **2.11-2.15** (Test coverage expansion) | Reliability |
| 5th | **2.21** (TypeScript migration) | Long-term maintainability |
