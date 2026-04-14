# Progress Engine + Remove Nano/Micro Goals

## Context

The app currently has a 7-level goal hierarchy ending in MicroGoal → NanoGoal. These execution-tier levels are over-coupled to session and note flows, and the codebase carries complexity for tracking them (nano_goal_id on notes, micro goal queries on sessions, MicroGoalModal, etc.). The goal is to:

1. **Remove MicroGoal and NanoGoal entirely** — strip them from backend, frontend, goal tree, sessions, notes, and tests.
2. **Build a Progress Engine** — a generic, persisted activity-to-activity improvement/regression system based on metric comparisons across sessions.

The goal tree becomes 5 levels deep: Ultimate → LongTerm → MidTerm → ShortTerm → Immediate.

---

## Database Grade: C+

**Strengths:** Clean normalized schema, soft-delete conventions, good index patterns, event bus already exists, two-level metric system (FractalMetricDefinition → MetricDefinition) provides a solid foundation for per-metric progress semantics.

**Gaps:** No progress comparison storage exists. `higher_is_better` and `is_multiplicative`/`is_additive` fields exist on FractalMetricDefinition but are not surfaced in the Activity Builder UI and are not used for any comparison logic. Nano/micro goal coupling is spread across notes (`nano_goal_id` FK), session_goals, goal_domain_rules, validators, serializers, and tests.

**Target: S+** — generic metric comparison persistence that fully leverages per-metric semantics (`higher_is_better`, `is_multiplicative`, yield computation), an in-activity-builder UX for configuring progress tracking, clean removal of all nano/micro coupling, and strict idempotency on progress writes.

---

## Phase 1: Remove Nano/Micro Goals (Backend)

### 1A. Remove NanoGoal and MicroGoal from GoalLevel seeds/data
- **File:** `migrations/versions/6cd6d0e3f98b_seed_system_default_goal_levels.py`
- Write new migration: soft-delete GoalLevel rows where `name IN ('Nano Goal', 'Micro Goal')` and reassign any orphaned goals' `level_id` up to ImmediateGoal.

### 1B. Remove nano_goal_id from Note model and all note flows
- **Files:** `models/common.py`, `services/note_service.py`, `blueprints/notes_api.py`, `validators.py`, `services/serializers.py`, `services/payload_normalizers.py`
- Drop `nano_goal_id` FK column from notes (migration)
- Remove `create_nano_goal_note()` method from `note_service.py`
- Remove `/notes/nano-goal` endpoint from `blueprints/notes_api.py`
- Remove nano_goal validator schema from `validators.py`
- Remove nano_goal serialization fields from `services/serializers.py`

### 1C. Remove nano/micro references from goal services
- **Files:** `services/goal_domain_rules.py`, `services/goal_type_utils.py`, `services/goal_service.py`, `services/goal_tree_service.py`, `services/completion_handlers.py`
- Remove `is_nano_goal()`, `is_micro_goal()` functions and all call sites
- Remove `should_inherit_parent_activities()` (only relevant to nano goals)
- Remove `get_session_micro_goals()` from `goal_service.py`
- Remove micro goal session query from `session_service.py` (~line 1063)
- Remove nano/micro special-casing in `completion_handlers.py`

### 1D. Remove micro goal child-type rules and goal hierarchy
- **Files:** `services/goal_type_utils.py`, `validators.py`
- Remove MicroGoal → NanoGoal parent/child type rules
- Cap the valid child types at ImmediateGoal (no children allowed at that level, or allow up to an ImmediateGoal child if the tree supports it)

### 1E. Migration
- New Alembic migration: drop `nano_goal_id` column from `notes`, retire Nano/Micro GoalLevel rows

---

## Phase 2: Remove Nano/Micro Goals (Frontend)

### 2A. Remove MicroGoalModal and all usage
- **Files:** `client/src/components/MicroGoalModal.jsx`, `client/src/components/__tests__/MicroGoalModal.test.jsx`
- Delete `MicroGoalModal.jsx` and its test
- Remove all imports and usage across session detail and goal pages

### 2B. Remove micro/nano from goalHelpers and goalNodeModel
- **Files:** `client/src/utils/goalHelpers.js`, `client/src/utils/goalNodeModel.js`, `client/src/utils/__tests__/goalHelpers.test.js`, `client/src/utils/__tests__/goalNodeModel.test.js`
- Remove `MicroGoal` and `NanoGoal` from `EXECUTION_TYPES`, `GOAL_TYPE_HIERARCHY`, child-type rules
- Remove `isExecutionGoalType()` usages that reference micro/nano
- Update tests

### 2C. Remove micro/nano from FlowTree filtering
- **Files:** `client/src/components/flowTree/flowTreeGraphUtils.js`, `client/src/pages/FractalGoals.jsx`, `client/src/FlowTree.jsx`
- Remove `showMicroNanoGoals` view setting and its filter logic
- Remove italic rendering for NanoGoal type (FlowTree.jsx ~line 147)
- Remove the toggle checkbox from FractalGoals.jsx

### 2D. Remove micro goal queries and hooks
- **Files:** `client/src/hooks/useSessionNotes.js`, `client/src/hooks/useSessionDetailNotes.js`, `client/src/hooks/queryKeys.js`, `client/src/utils/api/fractalSessionsApi.js`, `client/src/utils/api/fractalNotesApi.js`
- Remove micro goal session fetch calls
- Remove nano-goal note creation API calls
- Remove micro/nano query keys

### 2E. Clean up remaining component references
- **Files:** `client/src/components/sessionDetail/NoteQuickAdd.jsx`, `client/src/components/sessionDetail/NoteTimeline.jsx`, `client/src/components/sessionDetail/NoteItem.jsx`, `client/src/components/notes/NoteCard.jsx`, `client/src/components/sessionDetail/GoalsPanel.jsx`, `client/src/components/goals/GoalOptionsView.jsx`, `client/src/components/GoalCharacteristicsSettings.jsx`, `client/src/contexts/GoalsContext.jsx`, `client/src/contexts/GoalLevelsContext.jsx`
- Remove all nano_goal_id/nano-goal references from note rendering
- Remove micro goal type labels and badges
- Remove micro/nano from GoalCharacteristicsSettings (no more Nano Goal icon/color config)
- Update GoalLevelsContext to exclude nano/micro levels

### 2F. Analytics cleanup
- **Files:** `client/src/components/analytics/GoalCompletionTimeline.jsx`, `client/src/components/analytics/GoalTimeDistribution.jsx`
- Remove micro/nano goal type breakdowns from charts

### 2G. Rename Goals → Macro Goals (optional/stretch)
- Navigation label and page title only if desired

---

## Phase 3: Progress Engine (Backend)

### 3A. Extend MetricDefinition with progress config fields
**File:** `models/activity.py`

Add to `MetricDefinition`:
- `track_progress` (Boolean, default True) — opt-out per metric
- `progress_aggregation` (String, nullable) — `'last'` | `'sum'` | `'max'` | `'yield'`
  - `last` = compare the last recorded value (default for flat metrics)
  - `sum` = sum all set values for this metric before comparing (total volume)
  - `max` = take the max set value before comparing (top set)
  - `yield` = multiply two `is_multiplicative` metrics together (e.g. reps × weight = volume)

Add to `FractalMetricDefinition` (shared library):
- `default_progress_aggregation` (String, nullable) — inherited by MetricDefinition if not overridden

`higher_is_better` already exists on `FractalMetricDefinition` and will be inherited at comparison time.

**Migration:** add `track_progress` and `progress_aggregation` columns to `metric_definitions`; add `default_progress_aggregation` to `fractal_metric_definitions`.

### 3B. New Model: `ProgressRecord`
**File:** `models/activity.py`

```python
class ProgressRecord(Base):
    __tablename__ = 'progress_records'
    id, root_id, activity_definition_id, activity_instance_id (unique),
    session_id, previous_instance_id, is_first_instance,
    has_change, has_improvement, has_regression,
    comparison_type,  # 'flat_metrics' | 'set_metrics' | 'yield' | 'first_instance'
    metric_comparisons,  # JSON array (see below)
    derived_summary,  # JSON (single-metric / volume / top-set / yield / first-time)
    created_at
```

`metric_comparisons` per entry:
- `metric_definition_id`, `metric_name`, `unit`
- `higher_is_better` (resolved from FractalMetricDefinition or MetricDefinition)
- `aggregation` (the resolved `progress_aggregation` used)
- `current_value`, `previous_value`, `delta`, `percent_delta`
- `improved`, `regressed`

Indexes: `(root_id, activity_definition_id, created_at DESC)`, `(session_id)`, unique `(activity_instance_id)`

### 3C. New Service: `services/progress_service.py`

Methods:
- `get_previous_instance(activity_definition_id, root_id, exclude_session_id)` — most recent completed instance in a different session
- `_resolve_metric_value(instance, metric_def)` — applies `progress_aggregation` to extract the comparable value from the instance (handles `last`, `sum`, `max`, and `yield`)
- `_resolve_yield(instance, metric_defs)` — multiplies **all** `is_multiplicative` metrics together (generalizes to 2, 3, or more)
- `compute_live_comparison(activity_instance_id)` — returns comparison dict, no DB write
- `compute_final_progress(activity_instance_id)` — computes and persists ProgressRecord
- `compute_progress_for_session(session_id)` — calls compute_final_progress for all completed instances
- `get_progress_history(activity_definition_id, root_id, limit, offset)` — paginated ProgressRecords
- `get_progress_summary_for_session(session_id)` — all ProgressRecords for a session

Logic rules:
- Resolve `higher_is_better` from `MetricDefinition.fractal_metric.higher_is_better` (fallback: treat higher as better)
- Resolve `progress_aggregation` from `MetricDefinition.progress_aggregation` → fallback to `FractalMetricDefinition.default_progress_aggregation` → fallback to `'last'`
- For `yield`: find metric pair where both have `is_multiplicative=true`, compute `value_a × value_b`, compare as a single derived value
- Use `activity_instance.data.sets` for set-backed activities
- Skip metrics where `track_progress=false`
- `is_first_instance=true` when no previous instance found
- Do not write records during live edits

### 3D. Wire into event bus
**File:** `services/completion_handlers.py` (or new `services/progress_handlers.py`)

- Subscribe to `ACTIVITY_METRICS_UPDATED`: call `compute_live_comparison`, attach to response via a new `get_live_progress()` thread-local helper
- Subscribe to `SESSION_COMPLETED`: call `compute_progress_for_session(session_id)` — persists all final records

### 3E. API endpoints
**File:** `blueprints/sessions_api.py` and `blueprints/activities_api.py`

Add:
- `GET /<root_id>/activity-instances/<instance_id>/progress` — fetch persisted ProgressRecord
- `GET /<root_id>/activities/<activity_def_id>/progress-history` — paginated history
- `GET /<root_id>/sessions/<session_id>/progress-summary` — all records for session

Change:
- `PUT /<root_id>/sessions/<session_id>/activities/<instance_id>/metrics`
  - response includes `progress_comparison` key with live comparison (not persisted)

### 3F. Migration
- New Alembic migration: add `track_progress`, `progress_aggregation` to `metric_definitions`; add `default_progress_aggregation` to `fractal_metric_definitions`; create `progress_records` table

---

## Phase 4: Progress Engine (Frontend)

### 4A. Activity Builder — Progress Config Section
**Files:** `client/src/components/activityBuilder/ActivityMetricsSection.jsx`, `client/src/utils/activityBuilder.js`

Add a **Progress Tracking** section per metric within `ActivityMetricsSection`. When a metric is added:
- **Track progress toggle** (on by default) — maps to `track_progress`
- **Aggregation method dropdown** — options:
  - `Last value` (default for flat metrics)
  - `Sum across sets` (total volume)
  - `Best set` (top set / max)
  - `Yield` (only available when ≥2 `is_multiplicative` metrics exist on the activity — multiplies **all** `is_multiplicative` metrics together, e.g. reps × weight × distance)
- **Higher is better toggle** — editable here if not inherited from a FractalMetricDefinition, or shown as a read-only badge if inherited

Show a small preview line: e.g. "Progress will compare: total volume (reps × weight) — higher is better"

Update `buildActivityPayload()` in `client/src/utils/activityBuilder.js` to include `track_progress` and `progress_aggregation` in the metric payload.

Also expose `higher_is_better` editing on `FractalMetricDefinition` from the fractal metrics manager (already accessible via settings — just wire the field if not present).

### 4B. New hooks
**Files:** `client/src/hooks/useProgressComparison.js`, `client/src/hooks/useProgressHistory.js`, `client/src/hooks/useSessionProgressSummary.js`

- `useProgressComparison(instanceId)` — queries `/activity-instances/<id>/progress`
- `useProgressHistory(activityDefId)` — queries `/activities/<id>/progress-history`
- `useSessionProgressSummary(sessionId)` — queries `/sessions/<id>/progress-summary`

Add query keys to `client/src/hooks/queryKeys.js`.

### 4C. Progress display in activity cards
**File:** `client/src/components/sessionDetail/SessionActivityItem.jsx`

**During session (live, activity instance incomplete):**
- Load the previous activity instance's progress data via `useProgressComparison(instanceId)` (live endpoint)
- Display previous session's metric values subtly alongside the current input fields — e.g. as a muted label "Last: 8 reps @ 60kg"
- This gives the user a reference point while they are working through the current instance

**On activity instance completion:**
- Backend computes final comparison and returns it in the completion response
- Per-metric result replaces the "Last:" reference: show green ▲ (improvement) or red ▼ (regression) with `delta` and `percent_delta`
- Show derived summary line using `derived_summary` (e.g. "Yield up 12%", "New top set", "First time!")
- Subtle green/red background tint on the card based on `has_improvement` / `has_regression`
- First instance shows "First time!" badge with no delta indicators

### 4D. Invalidation
**Files:** mutation hooks that update metrics and complete sessions
- Invalidate `progressComparison` key on metric update
- Invalidate `sessionProgressSummary` on session completion

---

## Phase 5: Migrations Summary

1. Retire Nano Goal and Micro Goal GoalLevel rows (soft-delete); migrate orphaned goals up to ImmediateGoal
2. Drop `nano_goal_id` column from `notes`
3. Add `track_progress` (Boolean, default True), `progress_aggregation` (String, nullable) to `metric_definitions`
4. Add `default_progress_aggregation` (String, nullable) to `fractal_metric_definitions`
5. Create `progress_records` table with indexes

---

## Implementation Order

1. Phase 1 (backend nano/micro removal) — cleanest starting point, unblocks everything
2. Phase 2 (frontend nano/micro removal) — removes dead code before adding new
3. Phase 3 (progress engine backend) — new model, service, wire into session completion
4. Phase 4 (progress engine frontend) — hooks + activity card UI

---

## Verification

1. No endpoint or UI creates or reads NanoGoal/MicroGoal after removal
2. Notes have no `nano_goal_id` field in requests or responses
3. FlowTree renders 5-level hierarchy cleanly with no micro/nano toggle
4. Goal creation UI does not offer MicroGoal or NanoGoal levels
5. Activity Builder shows progress config (track_progress, aggregation, higher_is_better) per metric
6. Saving a metric with `progress_aggregation='yield'` computes yield correctly at comparison time
7. Session completion persists ProgressRecord for every completed activity instance exactly once
8. While an activity instance is incomplete, the card shows the previous session's metric values as a subtle reference ("Last: X reps @ Ykg")
9. Marking an activity instance complete triggers the final comparison and highlights each metric green/red inline
9. `higher_is_better=false` metrics treat decrease as improvement
10. `progress_aggregation='sum'` sums all set values; `'max'` takes the max set value
11. `progress_aggregation='yield'` multiplies the two `is_multiplicative` metrics and compares the product
12. First-time activities set `is_first_instance=true` with no comparison values
13. Progress history is paginated and sorted by `created_at DESC`
14. Full test suite passes (`./run-tests.sh`)

## Critical Files

**Backend removal:**
- `models/common.py` — nano_goal_id FK on notes
- `services/note_service.py`, `blueprints/notes_api.py` — nano goal note endpoint
- `services/goal_domain_rules.py` — is_nano_goal, is_micro_goal
- `services/goal_type_utils.py` — type hierarchy
- `services/goal_service.py` — get_session_micro_goals
- `services/session_service.py` — micro goal session query
- `services/completion_handlers.py` — nano/micro special cases
- `validators.py` — nano goal schema

**Backend new:**
- `models/activity.py` — ProgressRecord model
- `services/progress_service.py` — new service (create)
- `services/completion_handlers.py` — subscribe to SESSION_COMPLETED for final progress

**Frontend removal:**
- `client/src/utils/goalHelpers.js`, `goalNodeModel.js`
- `client/src/components/MicroGoalModal.jsx` (delete)
- `client/src/components/flowTree/flowTreeGraphUtils.js`
- `client/src/pages/FractalGoals.jsx`

**Frontend new:**
- `client/src/hooks/useProgressComparison.js` (create)
- `client/src/hooks/useProgressHistory.js` (create)
- `client/src/hooks/useSessionProgressSummary.js` (create)
- `client/src/components/sessionDetail/SessionActivityItem.jsx` — progress display
