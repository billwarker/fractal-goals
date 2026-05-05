# Performance Optimizations — Zero Regression Plan

> **Constraint:** No changes to data shape between backend/frontend. No visual or functional regressions. Pure performance work.
>
> **Date:** 2026-05-05
> **Database grade (current state):** A−. Schema is well-modeled, soft-delete is consistent, connection pooling is correct (`models/base.py:47-56`), JSONB used appropriately. Gap to S+ is missing compound indexes on hot soft-delete query patterns (#1) and the cascade N+1 (#2).

---

## TIER 1 — High Impact (User-perceptible wins)

### 1. Add compound database indexes on hot soft-delete query patterns
The codebase consistently filters on `(root_id, deleted_at, ...)` and `(goal_id, deleted_at)` but several core models are missing matching compound indexes.

- `models/activity.py:83-119` — `ActivityDefinition`, `MetricDefinition`, `SplitDefinition` lack `(root_id, deleted_at)` indexes
- `models/common.py:16-18` — `Note` lacks `(session_id, deleted_at, pinned_at, created_at)` for pinned-then-recent ordering
- `models/session.py:39-47` — `Session` is well-indexed but missing `(user_id, deleted_at)` for user-scoped queries
- `models/goal.py:223-226` — `Target` could benefit from a wider compound index covering common filter+sort patterns

**Why safe:** Indexes only affect query plans, never returned data.

**Implementation:** Single Alembic migration adding all indexes concurrently.

---

### 2. Eliminate N+1 in fractal soft-delete cascade
`services/goal_service.py:407-414` loops over 9 model types and mutates rows individually. Replace with bulk `UPDATE ... SET deleted_at = :ts WHERE root_id = :rid` per table.

**Why safe:** Same final DB state; same response payload (route returns success).

---

### 3. Trim aggressive cross-query invalidation on goal mutations
`client/src/contexts/GoalsContext.jsx:46-57` — deleting a goal invalidates `session`, `session-activities`, `session-notes`, and `session-goals-view` for the entire root. Most active sessions don't reference the deleted goal. Narrow to `fractalTree` plus the specific session's goals view if a session is active.

**Why safe:** TanStack Query still refetches when components actually need fresh data; we're removing speculative invalidations.

---

### 4. Memoize the HeaderContext provider value
`client/src/contexts/HeaderContext.jsx:12` creates a fresh `{ headerActions, setHeaderActions }` object every render, forcing every `useHeader()` consumer to re-render on any parent update.

**Fix:**
```jsx
const value = useMemo(() => ({ headerActions, setHeaderActions }), [headerActions]);
```

**Why safe:** Identical reference semantics to consumers; just stable.

---

### 5. Add `React.memo` to `NoteCard`
`client/src/components/notes/NoteCard.jsx:422` is rendered N times across timelines (Notes page, goal detail, session detail) with no memoization. With timelines of 50–200 notes, every parent re-render reconciles every card.

**Fix:**
```jsx
export default React.memo(NoteCard);
```

**Why safe:** Same render output; just skips reconciliation when props are referentially equal.

---

### 6. Ensure eager-loading of `Goal.targets_rel` and activity group hierarchy in serializers
`services/serializers.py:265` accesses `goal.targets_rel` and `services/serializers.py:126-133` walks `group.parent` chains. Without `selectinload`, each serialized goal/instance triggers lazy loads.

**Audit:** Ensure `selectinload(Goal.targets_rel)` and `selectinload(ActivityDefinition.group).selectinload(ActivityGroup.parent)` are applied at all call sites.

**Why safe:** Data returned is identical; only fetch strategy changes.

---

## TIER 2 — Medium Impact

### 7. Fix list-comprehension N+1 inside note loops
`services/note_service.py:154-157` — for each of 5 previous sessions, we filter the full notes list in Python. Build a `defaultdict(list)` keyed by `session_id` once, then look up — O(N) instead of O(N×M).

---

### 8. Combine the activity-group preload into the activity query
`services/session_service.py:182-188` loads all groups for a root, then dictionary-merges them with activities. A single query with `selectinload(ActivityDefinition.group).selectinload(ActivityGroup.associated_goals)` produces the same shape with one round trip.

---

### 9. Memoize inline style objects on FractalGoals layout
`client/src/pages/FractalGoals.jsx:255-330` recreates several large inline `style={{...}}` objects every render. The expensive child (`FlowTree`) ends up reconciling props on every keystroke elsewhere on the page. Hoist into `useMemo` or move to CSS modules.

---

### 10. Memoize `iconProps` and wrap `GoalIcon`/`AnimatedGoalIcon` with `React.memo`
In `FlowTree`'s `CustomNode`, the `iconProps` object is recreated per render. Combined with non-memoized icon components, every tree pan/zoom triggers reconciliation across hundreds of nodes.

**Fix:**
1. Memoize `iconProps` in `CustomNode` with `useMemo`
2. Wrap both `GoalIcon` and `AnimatedGoalIcon` exports with `React.memo`

---

### 11. Replace `cacheTime` with `gcTime` and tune `staleTime` per query family
`client/src/main.jsx:42` — TanStack Query v5 deprecated `cacheTime`. Rename to `gcTime`. While there, raise `staleTime` for stable read-mostly queries (goal tree, activity definitions) to 5–10 min to reduce refetch churn.

---

### 12. Replace CSS transitions on `width`/`height` with `transform`/`opacity`
Hits at:
- `client/src/App.css:816, 1014, 1230`
- `client/src/components/TargetCard.module.css:129`
- `client/src/components/analytics/StreakTimeline.module.css:126`

`width`/`height` transitions trigger layout on every animation frame; `transform: scaleX()` is composited on the GPU. Visual result is indistinguishable for these specific animations.

---

### 13. Memoize `NavigationHeader` nav items
`client/src/AppRouter.jsx:95-102` — `primaryNavItems` array literal rebuilds every render and breaks memo on the header. Wrap in `useMemo([rootId])`.

---

## TIER 3 — Lower Impact / Maintenance

### 14. Increase `event_logger` ThreadPoolExecutor size
`services/event_logger.py:8` caps at `max_workers=2`. Under bursty mutation load, the queue serializes commits. Raise to 5–8.

---

### 15. Bound or document `MetricValue` queries
`services/session_service.py:1355-1357` calls `.all()` on metric values per instance. Typically tiny but unbounded — add a sanity `LIMIT` or assertion.

---

### 16. Lazy-load heavy modal bundles
Heavy modals (`ProgramBuilder`, `GoalDetailModal`, `SettingsModal`, `ActivityBuilder`, `LogsModal`) ship with the initial bundle. `React.lazy()` + `Suspense` cuts first-paint JS without changing UX (the suspense fallback can match the modal's own loading state — invisible).

---

### 17. Virtualize the Notes timeline above a threshold
`client/src/components/notes/NoteTimeline.jsx` renders every note unconditionally. Add `react-window` or `@tanstack/react-virtual` only when `notes.length > 50`. Sub-50 stays as-is so the visual feel doesn't change for typical lists.

---

## Suggested PR Grouping

### PR 1 — DB migration + serializer eager-loading
**Items:** #1, #6, #14, #15
**Risk:** Low. One Alembic revision + serializer audit.
**Validation:** Confirm `EXPLAIN ANALYZE` plans use new indexes; existing tests pass unchanged.

### PR 2 — Backend N+1 cleanup
**Items:** #2, #7, #8
**Risk:** Low-medium. Internal refactor; behavior unchanged.
**Validation:** Existing service-layer tests; add query-count assertions in critical paths.

### PR 3 — Frontend render optimization
**Items:** #3, #4, #5, #9, #10, #11, #12, #13, #16, #17
**Risk:** Low. All changes are referentially-equivalent or visually-equivalent.
**Validation:** Existing Vitest suite; React DevTools Profiler before/after on hot paths (FractalGoals, Notes, SessionDetail).

---

## Path to S+ Database Grade

The data layer reaches **S+** when:
1. ✅ All compound indexes present for soft-delete query patterns (#1)
2. ✅ No N+1 in cascade operations (#2)
3. ✅ All hot serialization paths use eager loading (#6)
4. ✅ Bulk operations replace per-row mutations across services
5. ✅ Connection pool config remains tuned (already correct)

After PRs 1 and 2, the database/query layer should grade at **S** (excellent for the workload). After PR 3, the full stack reaches **S+** for engineering quality, with measurable user-perceptible perf gains and zero regression surface.
