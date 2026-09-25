# Performance Pass — September 2026

## Context

A performance audit on 2026-09-25 profiled every major read endpoint against a seeded
power-user account: 400 goals, 600 sessions with metric values, and a 12-week recurring
program. It found:

- **Three N+1 hotspots**, all on endpoints that have no query budget:
  - `/goals/selection`: 307 queries, 707 ms
  - `/sessions?limit=20`: 80 queries
  - `/sessions/analytics-summary`: 62 queries
- **Missing indexes** on hot reverse lookups:
  - `session_goals.goal_id`, `activity_goal_associations.goal_id`, `goals.parent_id`, and others
  - ten `(root_id, deleted_at)` filters with no compound index (item 1 of the May plan, which
    never landed)
- **A 1.4 MB goal tree.** A nested `attributes` object repeats 13 top-level fields (56% of the
  payload), and every goal carries its level's settings (19%), which the client already has.
- **Smaller costs:**
  - The goal-tree view's chunk bundles all of lodash through the unmaintained `dagre@0.8.5`.
  - `etag_json_response` serializes and hashes 20 endpoints' responses for an ETag that is never
    used for a 304, and `/api` responses are `no-store`.

**Outcome:** constant-query read paths guarded by budgets; indexes for every hot filter; a goal
payload about half the size, migrated without breaking any deployed client; and a lighter goals
page chunk.

**Base:** new branch `performance-pass`, created from `production-s-rank-hardening`, which is not
yet merged and already has the split service modules this plan edits.

## Grade of the existing codebase against this plan

| Area | Now | Why | Target |
|---|---|---|---|
| Query efficiency | B | Core pages are budgeted and constant, but three unbudgeted endpoints are N+1 | S |
| Indexing | B− | 37 foreign keys without a leading index; 10 soft-delete filters without a compound index | S |
| Payload design | C+ | 1.4 MB tree with about 50% duplication; goals embedded in sessions inherit the bloat | A+ |
| Frontend delivery | A | Lazy heavy chunks and sensible React Query defaults; lodash in the goals-page chunk | S |
| Regression protection | A− | 27 budgets, but none for selection, analytics summary, or goal metrics | S |
| **Overall** | **B+** | | **S+** |

(The polling item from the audit needs no change. TanStack Query's
`refetchIntervalInBackground` defaults to `false`, so the 10-second agent poll already stops
while the tab is hidden.)

---

## Phase 1 — Fix the N+1 hotspots (no change to response shape)

All fixes reuse `goal_serializer_load_options()` in
[services/goal_loading.py](services/goal_loading.py), which already eager-loads level, targets
with their conditions, associated activities, activity groups, and pause intervals.

1. **`/goals/selection`** ([services/_goal_fractals.py](services/_goal_fractals.py),
   `get_active_goals_for_selection`):
   - Replace `selectinload(Goal.children)` with
     `selectinload(Goal.children).options(*goal_serializer_load_options())`.
   - Also eager-load the short-term goals' level, because the filter joins `GoalLevel` without
     loading it.
2. **Sessions list and session detail** (`_session_read_options` in
   [services/session_service.py](services/session_service.py)):
   - Add `selectinload(Session.goals).selectinload(Goal.associated_activities)` and
     `.selectinload(Goal.associated_activity_groups)`.
   - These are what `calculate_smart_status` reads. The fix applies to every caller of these
     options.
3. **Analytics summary** (`_analytics_session_read_options` in
   [services/session_analytics_service.py](services/session_analytics_service.py)): add
   `Session.deleted_at` to `load_only(...)`. `ProgressService.compute_comparisons_for_instances`
   reads it for every preloaded instance.
4. **Sweep for the same pattern:**
   - Find every `serialize_goal(` call that isn't fed from `load_fractal_goals_for_serialization`
     or `goal_serializer_load_options`.
   - Confirm each call site eager-loads what the serializer reads, or fix it the same way.

## Phase 2 — Query budgets as regression guards

In [tests/performance/test_query_budgets.py](tests/performance/test_query_budgets.py):
- Add a `power_account_dataset` fixture, based on the audit's seed but scaled for CI speed: about
  150 goals, 150 sessions (each with 2 goal links, 3 instances and 2 metric values), and a
  4-block recurring program.
- Add budgets, using the existing `timed_get`/`assert_response_budget` helpers, for:
  - `/goals/selection`
  - `/sessions?limit=20` with goal links
  - `/sessions/analytics-summary`
  - `/goals/<id>/metrics` and `/goals/<id>/metrics/daily-durations`
  - `/goals/analytics`
  - the program day read model (range and detail)
  - `/sessions/<id>/goals-view`
- Each budget is set just above the post-fix count and must not grow with dataset size. Byte
  budgets record today's sizes, then tighten after Phase 5.

## Phase 3 — Indexes

One migration, `add_hot_path_indexes`, whose `down_revision` is the current head
(`a4c6e8f0b2d5`).

**Build them concurrently:**
- On Postgres, create them inside `op.get_context().autocommit_block()` with
  `postgresql_concurrently=True` and `if_not_exists=True`, so no writes are blocked.
- The downgrade drops them concurrently.
- Declare the same indexes in the models, so `alembic check` parity holds and the test schema
  built by `create_all` matches.

**Reverse lookups:**
- `session_goals(goal_id)`, `activity_goal_associations(goal_id)`, `program_goals(goal_id)`,
  `program_block_goals(goal_id)`, `program_day_goals(goal_id)`
- `goals(parent_id, deleted_at)`
- `metric_values(metric_definition_id)`
- `target_metric_conditions(metric_definition_id)`

**Cascade and join support:**
- `goals(completed_session_id)`
- `targets(completed_session_id)`, `targets(completed_instance_id)`
- `program_day_templates(session_template_id)`
- `activity_duration_stats(activity_definition_id)`

**Soft-delete scopes** as `(root_id, deleted_at)` on:
- `activity_definitions`, `metric_definitions`, `split_definitions`
- `activity_groups`, `activity_tag_definitions`, `activity_tags`, `activity_progress_views`
- `fractal_metric_definitions`, `goal_levels`, `calendar_periods`

**Agent tables:** left out. They are low-volume and feature-flagged; they're recorded as a
follow-up.

**Verification:**
- Upgrade, check, downgrade, upgrade and check on a scratch database.
- `EXPLAIN` on the power dataset to confirm the goal-scoped `session_goals` and
  `activity_goal_associations` queries use the new indexes.

## Phase 4 — Frontend and helper cleanups

- **Replace `dagre@0.8.5` with `@dagrejs/dagre@^3.1.1`.** Its only dependency is
  `@dagrejs/graphlib`, which has none.
  - Update the import in
    [client/src/components/flowTree/flowTreeGraphUtils.js](client/src/components/flowTree/flowTreeGraphUtils.js).
    The API it uses (`graphlib.Graph`, `layout`) is unchanged.
  - Confirm via a source-map composition check that lodash is gone from the `FlowTree` chunk, and
    that the flow-tree layout tests still pass.
- **Replace `etag_json_response`** ([blueprints/api_utils.py](blueprints/api_utils.py)) with plain
  `jsonify` at its 20 call sites, and delete the helper.
  - Its own docstring rules out 304 responses, and `/api` responses are `no-store`, so the extra
    serialization and SHA-256 buy nothing.
  - Check that no client or test depends on the `ETag` header first.

## Phase 5 — Staged, compatible goal-payload diet

Each stage deploys on its own. At every point, both the deployed client and the deployed server
are compatible with each other.

**Stage A — client stops depending on duplicates (client-only deploy).**
- Extend [client/src/utils/goalNodeModel.js](client/src/utils/goalNodeModel.js) with accessors
  that read the **top-level field first** and fall back to `attributes`:
  - `getGoalNodeCompleted`, `CompletedAt`, `Deadline`, `LevelId`, `IsSmart`, `SmartStatus`,
    `Paused`, `PausedAt`, `CompletionState`
  - flip the existing `getGoalNodeId`, `Type` and `Description` to top-level-first
- Migrate goal readers of the 13 duplicated fields to those accessors. There are about 48 files,
  for example `utils/smartHelpers.js`, `components/goals/GoalHeader.jsx`,
  `components/flowTree/flowTreeGraphUtils.js`, `hooks/useGoalDetailController.js` and
  `pages/FractalGoals.jsx`.
  - Session `attributes` (JSON session data) are a different object and stay untouched. Each file
    is checked by hand.
  - The landing snapshot has its own serializer (`_landing_public_tree.py`) and stays as it is.
- Replace per-goal `level_characteristics` readers:
  - `flowTreeGraphUtils` `sort_children_by` and the `goalTimelineViewModel` fallback look the
    level up by `level_id` in the existing `GoalLevelsContext` / goal-levels query.
  - The goal timeline endpoint keeps sending its own `level_characteristics`.
- Tests: accessor unit tests covering top-level only, attributes only, and both present, plus the
  existing component suites.

**Stage B — server drops duplicates (a separate deploy after Stage A is live).**
- In [services/_serialize_goals.py](services/_serialize_goals.py), remove the 13 duplicated keys
  from `attributes`, and remove `level_characteristics` from `serialize_goal`.
- `attributes` keeps only the fields that exist nowhere else: `parent_id`, `root_id`, `owner_id`,
  `created_at`/`updated_at`, `targets`, `relevance_statement`, the completion/activity flags,
  association ids, and `progress_settings`.
- Update the backend tests that read the removed keys (for example `tests/unit/test_models.py`,
  `tests/integration/test_goals_api.py` and `test_goals_expanded.py`) to the top-level fields.
- Check the agent context and data export for reads of the removed keys.
- Tighten the Phase 2 byte budgets to the new sizes. Goal-tree bytes are expected to drop by
  about 45–50%. The sessions list shrinks too, because 40% of it is embedded goals.

**Deploy order:** record it in the delivery notes. Stage A merges and deploys first; Stage B is
held for the next deploy.

## Verification

- `./run-tests.sh all` and `./run-tests.sh lint` (type checks and maintainability gates), plus
  `./run-tests.sh browser`.
  - The three browser failures that already exist on `main` are tracked separately and must not
    change.
- Re-run the audit's power-user profile. Target:
  - selection and sessions list: ≤ 15 queries each
  - analytics summary: ≤ 12 queries
  - goal tree: under about 750 KB
- The migration round trip on a scratch database, plus `EXPLAIN` evidence for the goal-scoped
  association queries.
- `npm run build` plus the source-map composition check: no lodash in the `FlowTree` chunk.
- Save this plan to `planning/performance-pass-2026-09.md`, append a delivery record with
  before/after numbers, and update the performance-audit reference in `index.md`.

## Out of scope

- A lighter sessions-list shape beyond the smaller embedded goals, and server-side aggregation
  for `goals/analytics`.
- Indexes on the agent tables.
- The three browser failures that already exist on `main`.
