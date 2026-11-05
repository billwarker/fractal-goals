# Plan: Progress chart and ▲/▼ hints update together on save

## Context

On Session Detail, you want the Progress pane's chart to reflect the values entered on an activity instance, with its top set, average, yield or goal value recalculated and plotted.

You also want the chart aligned with the server-calculated ▲/▼ hints. **Decision: both update together when a value is saved** (on blur, Enter, or adding or removing a set), not per keystroke.

## What happens today

With offline sync on, each surface gets its data differently, so they can't stay in step:

| | Hints | Chart |
|---|---|---|
| **Source** | `exercise.progress_comparison`, else `useProgressComparison` | `progress-series`, under the `activity-progress-timeline` key |
| **Outbox save of an in-progress instance** | The ack has no comparison, so it clears the value; hints refetch when the queue drains | **Never refreshed.** `invalidateSessionAfterSync` doesn't cover this key, which is why the chart looks stuck |
| **Direct save (offline sync off)** | Invalidated and refetched | Invalidated and refetched separately |

Two server details cause the gap: `PUT /activity-instances/<id>` only includes `progress_comparison` when the instance is completed, and `PUT …/metrics` gets it from `get_live_progress`, which is only set for completed instances.

## Approach: one save response drives both

Each save response carries the server's comparison and the instance's saved values. The client writes both into the query cache in the same step, so hints and chart change at the same moment, with no extra requests.

The chart already calculates top set, average, yield and goal series in the browser from the instance's raw values, so giving it the saved values is enough.

## Database grade for this plan: **S**

- **Strengths:**
  - `metric_values` and `activity_sets` are the single source of truth.
  - Progress is derived, never stored.
  - `ProgressService.get_progress_for_instance` already calculates the comparison from saved data.
- **Gaps:** none for this feature.
- **Plan:** no schema change or migration.

## Changes

### 1. Backend: every instance save returns its comparison

- Add one best-effort helper beside `get_live_progress` in `services/completion_handlers.py`:
  - It returns `get_live_progress(id)`, or else `ProgressService.get_progress_for_instance(id)`.
  - It logs and returns null if calculating fails, because the save has already committed (same approach as `record_live_progress`).
- Use it in all three write routes:
  - `blueprints/timers_api.py`, `update_activity_instance`: drop the `completed` condition. This is the outbox's route for sets.
  - `blueprints/sessions_api.py`, `update_activity_metrics`: the outbox's route for single metrics.
  - `blueprints/sessions_api.py`, `update_activity_instance_in_session`.
- **Cost:** one comparison per save. `_payloads` resolves predecessors in one statement.

### 2. Chart cache patch: `client/src/offline/progressChartOps.js`

Add `patchProgressSeriesInstance(queryClient, { rootId, instance })`, next to `patchProgressChartSettings`:
- Updates every cached series scope for that instance, using `activityProgressTimeline(rootId, instance.activity_definition_id, instance.id)`.
- Replaces `sets`, `metrics`, `completed`, `time_start`, `time_stop`, `duration_seconds` and `progress_comparison` on the matching row.
- Keeps `session_date`, which the session cache's instances don't have.

### 3. Apply it on ack

- **Outbox:** call it in `replaceInstance` in `sessionOpHandlers.js`, straight after writing the instance. Both then follow the existing `hasPendingEntity` check, so during quick edits both wait for the last ack.
- **Direct saves:** call it in `updateInstanceMutation.onSuccess` in `useSessionDetailMutations.js`, next to its `setQueryData`.
- The chart isn't touched by optimistic updates, so like the hints it only ever shows server-confirmed values. A rejected write leaves both unchanged.

`useFadeSwap` shows same-key updates at once, so the point moves in place without a cross-fade. The expanded chart shares `useFadingProgressSeries`, so it updates too.

### 4. Backstop refresh: `invalidateSessionAfterSync`

Add the `activity-progress-timeline` prefix for the root (active queries only). This reconciles writes that don't return an instance, such as circuit changes, and overrides any series fetch that was in flight during an ack. The refetch returns the same values, so nothing visibly changes.

### 5. Chart follows the activity being edited: `SessionActivityItem.jsx`

Clicking a set row selects its activity, but single-metric inputs and tabbing don't. So a save could update hints on one activity while the chart shows another.

When a metric input in an unselected card gets focus, call `onFocus(exercise, selectedSetIndex)`. This is the existing selection path.

## What you'll notice

- Nothing moves while typing. Hints and chart change together shortly after you leave the field, once the server responds.
- Offline, both hold their last confirmed values and catch up together on sync. The typed values themselves stay safe in the outbox.

## Decision needed: hints and chart can still point different ways

This plan aligns **when** they update and **what data** they use, but not **how they calculate**:

- **Hints** use an automatic aggregation per metric (`_progress_aggregation.py`, `resolveAutoAggregationMode`): the best set by the anchor metric, a sum for additive metrics, or the last set for multiplicative ones.
- **The chart** uses its own `set_aggregation` setting: each metric's top value or average, on its own.

For example, with weight as the best-set metric, the hint compares reps from your heaviest set, while a "top set" reps chart plots your highest reps from any set. Your reps hint can show ▼ while the chart goes up.

**My recommendation:** ship this first, then make it a separate follow-up. Fully aligning them changes what either the hints or the charts mean (including in Analytics), so it deserves its own plan. If you consider it part of "aligned", say so here and I'll add it to this plan.

## Not in this change

- **Circuit member saves** get the step 4 refresh on queue drain, not the same-moment update.
- **Past sessions list:** it excludes the current session, so it isn't affected.

## Existing issues I found (not fixing unless you want them included)

1. **Skipped sets on trend charts:** `metricValues` includes skipped sets, while `evidenceSets` and the server evaluator exclude them. It's a one-line filter, but it also changes Analytics.
2. **Blank sessions on metric-total goal charts:** `instanceMetricTotal` returns 0 rather than null, so clearing a value drops the point to 0 instead of removing it.

## Tests

- **Backend (`tests/integration/test_progress_comparison_api.py`):**
  - Sets and metrics saves on an in-progress instance return a comparison reflecting the new values.
  - A comparison failure still returns the saved instance.
  - A query-count check for the added comparison.
- **`sessionOpHandlers.test.js`:**
  - An ack updates the instance's comparison and the series row together, and keeps `session_date`.
  - Other rows and other instances stay untouched.
  - With a newer op pending, neither changes.
  - A rejected op leaves the series alone.
  - Drain invalidates the timeline prefix.
- **`progressChartOps`:** patches every comparison scope and ignores timeline-list entries.
- **`useSessionDetailMutations`:** a direct save patches the series.
- **`SessionActivityItem`:** focusing a metric input in an unselected card selects it; a selected card doesn't re-fire.
- **Chart calculations:** a patched series gives the expected top set, average, yield and goal values.

## Verification

1. Run the Vitest suites above, the related pytest file, and the pre-commit checks.
2. In the running app, with the Progress pane open on an in-progress session:
   - **Set-based activity:** enter a new best and tab out. The point and the hint should change together.
   - **Network tab:** the save shouldn't trigger a separate fetch before the point moves.
   - **Sets:** adding or removing a set updates both.
   - **Other charts:** Average mode, a goal chart, scatter, and the expanded chart.
   - **Single-metric activity:** tabbing into its input switches the chart to that activity.
   - **After refresh:** the point and hint stay the same.
   - **Offline:** with the network off, both hold; after reconnecting, both update together.
3. After you confirm this plan, save it to `planning/progress-chart-and-hints-aligned-on-save.md`.

## Follow-up decisions (after implementation)

- **In-progress hints move too.** A saved value shows its ▲/▼ change before completion, and a metric with nothing entered keeps "(last X)". A delta from a comparison spanning several sets appears only on the set driving it.
- **Calculations stay separate.** Hints keep their automatic aggregation, and charts keep their top/average setting.
- **Both existing issues fixed.** Skipped sets no longer count on trend or scatter charts (including Analytics), and a blank session is a gap on metric-total goal charts, while an entered 0 still plots.
