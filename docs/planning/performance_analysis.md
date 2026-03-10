# Performance Analysis — All Sections

> Evaluated: March 10, 2026

## Scoring Framework

Each section is scored on 5 performance criteria:

| Criteria | Description |
|----------|-------------|
| **Query Efficiency** | N+1 avoidance, eager-loading, pagination |
| **Payload Size** | Response size, over-fetching, unnecessary nesting |
| **Computation** | Algorithmic complexity of backend/frontend processing |
| **Caching** | Effective use of server-side and client-side caching |
| **Scalability** | How behavior degrades as data volume grows |

Grades: **S** (exemplary) · **A** (strong) · **B** (good, minor gaps) · **C** (functional but noticeably off-standard) · **D** (significant issues)

---

## Rankings Summary

| # | Section | Grade | One-Line Verdict |
|---|---------|-------|------------------|
| 1 | **Session Templates** | **A** | Thin payloads, simple queries, minimal overhead |
| 2 | **Activities** | **B+** | Efficient eager-loading; serializer walks group tree traversals |
| 3 | **Programs** | **B** | Deep `selectinload` chains; `serialize_program` recursively loads blocks→days→sessions |
| 4 | **Auth** | **B** | Simple queries, small payloads; `session_goals_supports_source()` introspects schema per call |
| 5 | **Sessions** | **B−** | Heaviest serializer in the codebase; list endpoint loads full session payloads |
| 6 | **Goals** | **B−** | Recursive `serialize_goal` walks entire tree; N+1 risk on `targets_rel`, `associated_activities` |
| 7 | **Timers** | **C+** | Dual GET/POST endpoint; cascading pause/resume queries all active instances |
| 8 | **Analytics & Annotations** | **C** | O(goals × sessions × instances) with no pagination; cache invalidated on every event |
| 9 | **Completion Handlers** | **C−** | New DB session per event; serializes instances mid-handler; cascading event chains |

---

## Detailed Analysis

### 1. Session Templates — Grade: A

- Simple CRUD with pagination support and `etag_json_response`.
- `serialize_session_template` is lightweight — only `_safe_load_json` on `template_data`.
- No relationship chains to eager-load beyond goals (which are already attached).

**Gaps:** `serialize_session_template` calls `serialize_goal(include_children=False)` per attached goal — could become slow if templates have many goals.

---

### 2. Activities — Grade: B+

- `activity_service.py` uses `selectinload` for associated goals and metric/split definitions.
- `serialize_activity_definition` eagerly serializes `metric_definitions`, `split_definitions`, and `associated_goals` — all pre-loaded.

**Gaps:**
- `serialize_activity_instance` (L94-130 of `serializers.py`) walks the **group parent chain** (`current_group.parent`) to build a `group_path` string. This is an unbounded traversal for deeply nested groups (up to 3 levels currently, but no guard).
- The GET activities endpoint returns **all** activities for a fractal without pagination — could be problematic for fractals with hundreds of activities.

---

### 3. Programs — Grade: B

- `ProgramService` uses deep `selectinload` chains: `Program` → `blocks` → `days` → `templates` + `completed_sessions`.
- `serialize_program_day_session_light` correctly avoids N+1 by skipping instances/goals/notes for embedded sessions.

**Gaps:**
- `serialize_program` (L489-512 of `serializers.py`) calls `serialize_program_block` for every block, which calls `serialize_program_day` for every day, which calls `serialize_session_template` for every template **and** `serialize_program_day_session_light` for every session. For a program with 12 blocks × 7 days × 3 templates = **252 template serializations** per request.
- `serialize_program_block` accesses `block.program.goals` — this can trigger a lazy-load if `program.goals` wasn't eagerly loaded.
- No pagination on the program list endpoint.

---

### 4. Auth — Grade: B

- Simple single-table queries on `User` — no joins needed.
- Payloads are tiny (`serialize_user` is 6 fields).
- Rate limiting correctly applied to all sensitive endpoints.

**Gaps:**
- `session_goals_supports_source()` in `goal_service.py` calls `inspect(db_session.bind).get_columns('session_goals')` **every time it's invoked** — schema introspection on every request. `SessionService` caches this internally via `_session_goals_has_source`, but `GoalService.session_goals_supports_source()` (the standalone function at L79-81) does not cache.
- `token_required` creates a **new DB session per request** (`get_engine()` + `get_session(engine)`) just to look up the user, then closes it. The downstream handler then creates another one. This means **two DB sessions per authenticated request**.
- `db_session.query(User).get(...)` is used in several endpoints — this is deprecated in SQLAlchemy 2.0.

---

### 5. Sessions — Grade: B−

**The heaviest serializer in the codebase is `serialize_session`** (L210-393 of `serializers.py`, 183 lines).

**Backend Query Efficiency:**
- `get_fractal_sessions` and `get_session_details` use comprehensive `selectinload` chains (6 deep loads per query) — good N+1 prevention.
- Session list uses `COUNT` + paginated query — correct pattern.

**Serialization Hotspots:**
- `serialize_session` does **O(sections × instances)** work:
  1. First, it serializes all activity instances into a list.
  2. Then, it builds `instance_map` and `ids_by_def` maps.
  3. Then, it walks each section's `exercises`/`activities` arrays to normalize IDs.
  4. Then, for each matched instance in each section, it calls `serialize_activity_instance` **again** (double-serialization).
- The section hydration loop (`_extract_def_id`) has a fallback waterfall: try 6 different key names, then try a nested `activity` dict. This runs per exercise per section.
- `serialize_session` is called for **every session in the list endpoint** — a page of 10 sessions could trigger 10 × (instances + sections) serialization passes.

**Payload Size:**
- Session responses include **full activity instances**, **notes**, **goals** (with `serialize_goal`), and the legacy `session_data` structure. A session with 10 activities and 5 notes can produce a 50-100KB response.
- The `attributes` JSON column is merged into the response at multiple levels (`result["attributes"]`, `result["attributes"]["session_data"]`) — significant redundancy.

**Gaps:**
- `get_all_sessions_endpoint` (inline in `sessions_api.py`) fetches **all sessions** for a fractal with full eager loading — no pagination, no response limit.
- The list endpoint (`get_fractal_sessions`) loads the full `serialize_session` payload per session — there's no "light" list serializer (unlike programs which have `serialize_program_day_session_light`).
- Session update calls `serialize_session(session)` **without re-loading** eager relationships, risking lazy-load N+1s on the response.

---

### 6. Goals — Grade: B−

**Recursive Serialization:**
- `serialize_goal` (L140-208) is **recursive** — `include_children=True` calls itself for every child in the tree. A goal tree of depth 6 with 200 nodes means 200 serialization calls.
- Each call computes `calculate_smart_status` (accesses `targets_rel`, `associated_activities`, `associated_activity_groups`), `get_canonical_goal_type`, and serializes all targets.

**N+1 Risk:**
- `serialize_goal` accesses `goal.targets_rel`, `goal.associated_activities`, `goal.associated_activity_groups`, `goal.children`, `goal.sessions`, and `goal.level` — **6 relationships**. If any of these aren't eagerly loaded, each triggers a lazy load.
- The root-level goal tree query (`GoalTreeService.get_session_goals_view_payload`) only eagerly loads `children`, `associated_activities`, and `associated_activity_groups` on the root — but `serialize_goal` recursively serializes children, and those children's `targets_rel`, `sessions`, and `level` are **not** eagerly loaded = **N+1 on every child**.
- `goal.sessions[0].id` (L181) can trigger a lazy load of the entire `sessions` relationship just to get one ID.

**Gaps:**
- No "light" goal serializer for list views — every goal response includes the full SMART status, all targets, all association IDs, and level characteristics.
- Goal tree payloads can be very large (200+ nodes × ~1KB each = 200KB+).
- `goalNodeModel.js` (4706 lines) does client-side tree traversals and normalization on every goal tree response — heavy computation on large trees.

---

### 7. Timers — Grade: C+

**Query Patterns:**
- The GET activity-instances endpoint (L119-138) queries **all sessions** for a fractal, extracts their IDs, then queries instances with `IN(session_ids)`. This is two queries where one join would suffice.
- Pause/resume endpoints query **all active/paused instances** for a session (`ActivityInstance` filter by `session_id` + `time_start != None` + `time_stop == None` + `is_paused`) — no index hints or limit.

**Gaps:**
- `start_activity_timer` and `complete_activity_instance` use `joinedload(ActivityInstance.definition)` but don't load `metric_values` — `serialize_activity_instance` will lazy-load them.
- `datetime.utcnow()` is called multiple times per request instead of capturing once.
- The pause/resume cascade modifies **every active instance** in a session — for a session with 20 activities, this is 20 ORM updates per pause/resume.

---

### 8. Analytics & Annotations — Grade: C

**Analytics — O(goals × sessions × instances):**
- `GoalAnalyticsService.get_goal_analytics` loads **all goals**, **all sessions** (with joinedload on goals), and **all activity instances** (with joinedload on definition) for a fractal — three full-table scans.
- For each goal, it iterates all sessions to sum durations, then iterates all instances to compute breakdowns. This is **O(G × S)** for goal-session mapping and **O(G × I)** for activity breakdowns.
- The `activity_durations_by_date` computation (L142-154) does a **linear scan** of `sessions_for_goal` for every instance to find the matching session — **O(I × S)** per goal, **O(G × I × S)** total.
- No pagination on the response — everything is returned at once.

**Analytics Cache:**
- `analytics_cache.py` is an in-memory dict with 60-second TTL.
- Cache invalidation subscribes to `"*"` (all events) — **any** domain event invalidates the analytics cache for that root. This means the cache is effectively useless during active sessions where events fire every few seconds.
- The cache is **process-local** — with multiple workers/processes, each maintains its own cache, and cache misses still trigger the full O(G × S × I) computation.

**Annotations:**
- `get_annotations` loads all annotations then **filters in Python** (L58-78) using JSON parsing and dict comparison. This should be a database-level query.
- No pagination on annotation responses.

---

### 9. Completion Handlers — Grade: C−

**This is the biggest performance concern in the backend.**

**New DB Session Per Event:**
- Every event handler (`handle_activity_instance_completed`, `handle_activity_instance_updated`, `handle_activity_instance_deleted`, `handle_session_completed`, `handle_activity_metrics_updated`) calls `_get_db_session()` which creates a **new SQLAlchemy session** (new engine → new session). This is **not** the same session as the request that triggered the event.
- This means completion cascades open **multiple concurrent DB connections** per request.

**Serialization in Hot Path:**
- `_run_evaluation_for_instance` (L533-573) calls `serialize_activity_instance(instance)` to convert the ORM instance to a dict for metric comparison. This serializer loads `metric_values`, walks the group tree, parses JSON data, etc. — all unnecessary when you just need the metric values.

**Cascading Event Chains:**
- When a session is completed, `handle_session_completed` fires → evaluates targets → may fire `GOAL_COMPLETED` → may trigger parent goal checks. Each step opens its own DB session.
- When metrics are updated on a completed instance, `handle_activity_metrics_updated` first **reverts** all achievements for that instance (queries `Target` table), then **re-evaluates** everything. This is a full recompute per metric update.
- `_revert_achievements_for_instance` queries all targets with `completed_instance_id == instance_id`, then for each reverted target, loads the goal and checks all other targets — potential N+1 on `goal.targets_rel`.

**Thread-Local Achievement Tracking:**
- `_achievement_context` uses `threading.local()` to track achievements during a request. This is fragile — if the event handler runs asynchronously (`emit_async`), the achievements won't be available to the original request thread.

---

## Cross-Cutting Performance Issues

### Backend

| Issue | Impact | Sections Affected |
|-------|--------|-------------------|
| **`token_required` opens a separate DB session** | 2 sessions per authenticated request | All |
| **`serialize_session` double-serializes instances** | O(2 × instances) per session | Sessions, Completion Handlers |
| **Recursive `serialize_goal`** | O(tree_size) with N+1 on unloaded relationships | Goals, Sessions, Templates, Analytics |
| **`session_goals_supports_source()` schema introspection** | Uncached reflection query per call in `GoalService` | Goals, Sessions |
| **Completion handlers open new DB sessions** | Multiple concurrent connections per completion event | Timers, Sessions |
| **Analytics cache invalidated on every event** | Cache is effectively empty during active sessions | Analytics |
| **No "light" list serializers** for sessions or goals | Full payloads returned even for list views | Sessions, Goals |

### Frontend

| Issue | Impact | Sections Affected |
|-------|--------|-------------------|
| **`useFlowTreeMetrics` O(S × I × A) aggregation** | Recomputes on every dependency change | Goals (FlowTree) |
| **`goalNodeModel.js` (4706 lines) tree traversals** | Full walks on tree data changes | Goals |
| **`useSessionDetailMutations.js` (23KB)** | Large hook with many `useCallback` dependencies — ref instability risk | Sessions |
| **No virtual scrolling on large lists** | All items rendered to DOM | Sessions list, Activities, Logs |
| **`queryKeys.js` (2.5KB) centralized but dense** | Every key factory is re-evaluated on component re-renders | All |

---

## Priority Recommendations

### High Impact

1. **Create a `serialize_session_list_item` light serializer** — Return only scalar fields + instance count for list views. Don't serialize instances, notes, goals, or session_data sections. Estimated 80-90% payload reduction for session lists.

2. **Eliminate double-serialization in `serialize_session`** — The section hydration loop re-serializes instances that were already serialized at L247. Pre-build a serialized instance map once and reuse it.

3. **Pass DB session through event handlers** — Instead of `_get_db_session()` per handler, pass the active DB session as part of the event context. This eliminates multiple concurrent DB connections per completion cascade.

4. **Replace full serialization in completion handlers** — `_run_evaluation_for_instance` shouldn't call `serialize_activity_instance()`. It only needs metric values — read them directly from the ORM.

5. **Fix analytics cache invalidation granularity** — Replace `"*"` wildcard subscription with targeted event types (e.g., only invalidate on `ACTIVITY_INSTANCE_COMPLETED`, `GOAL_COMPLETED`, `SESSION_COMPLETED`). Most events (UI updates, reordering, etc.) don't affect analytics.

### Medium Impact

6. **Add eager-loading for `targets_rel` and `level` in goal tree queries** — The root goal query eagerly loads `children`, `associated_activities`, and `associated_activity_groups`, but the recursive `serialize_goal` also accesses `targets_rel`, `sessions`, and `level`. Load these upfront with `selectinload`.

7. **Cache `session_goals_supports_source()` globally** — Schema introspection result shouldn't change within a process lifecycle. Cache it as a module-level variable.

8. **Optimize analytics service** — Replace the O(G × I × S) linear scan in `activity_durations_by_date` with a pre-built `session_id → session` map. Consider database-level aggregation for large fractals.

9. **Add pagination to GET activities and GET annotations** — Both endpoints return all records with no limit.

### Low Impact

10. **Consolidate `token_required` session management** — Share the DB session between `token_required` and downstream handlers instead of creating two separate sessions.

11. **Add a light `serialize_goal_list_item`** — For list contexts (session goal cards, program goal chips), return only `id`, `name`, `type`, `level_id`, `completed`. Skip `smart_status`, `targets`, `attributes`, `level_characteristics`.

12. **Consider `selectinload` over `joinedload` for session instances** — When loading 10 sessions with 5+ instances each and 3 metric values per instance, `selectinload` with `IN` batching may outperform repeated joins.
