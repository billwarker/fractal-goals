# Plan: Progress chart types, controls and remembered chart per template/program day

## Context

The Progress pane's chart is fixed: the in-scope goal condition, otherwise one synthesized series.
Pike Push Ups on the Floor shows why that isn't enough. It has two metrics (Hands Distance from
Feet, Reps), and the interesting picture is the two against each other, or either one over time.

You asked for:
- **Chart controls** in the space the compact chart leaves while it's expanded, next to Collapse.
- **A choice of chart:** Activity trend, Activity scatter, Metric trend.
- **Scatter by default** for activities with two metrics.
- **Activity trend** plots one series over time: either metric, or yield.
- **A set aggregation control:** top set or average.
- **Shared Analytics components** wherever possible.

Your decisions:
- **Chart types:**
  - **Activity trend:** one line over time (a metric, or yield).
  - **Activity scatter:** metric X against metric Y.
  - **Metric trend:** both metrics over time on two axes.
  - **Goal progress** stays as an option when an in-scope goal condition exists.
- **Remembered:** the choice is saved with the Progress view, per activity in each template/program day,
  on the server.
- **Yield aggregation** offers Top set, Average and Total. Metrics offer Top set and Average.

## Database grade for this plan: **B**

- **Strengths:**
  - `activity_progress_defaults` already keys per-activity choices by (template, program day), is
    versioned, and is applied by a trigger.
  - The progress-series endpoint already returns instances in the exact shape the Analytics charts
    take (`serialize_activity_instance_for_analytics(compact=True)`), plus full metric definitions.
- **Gaps:**
  - Chart configuration isn't modeled anywhere.
  - Set aggregation is implemented three times, and the implementations disagree:
    - `ScatterPlot` picks the top set by the highest X value, ignoring lower-is-better.
    - `MetricTrends.resolveMetricValue` respects `higher_is_better`.
    - `goalConditionSeries.bestRuleValue` goes by the rule operator.
  - Metric flags are duplicated between `metric_definitions` and `fractal_metric_definitions`. The
    stale-copy bug was just patched with `MetricDefinition.multiplies`, but the duplicate column remains.
  - Ad-hoc sessions (no template or program day) remember nothing.
- **Target S+:**
  - A typed, constrained table for chart settings. Metric references are real foreign keys that
    fall back safely when a metric is deleted.
  - One server-side resolver for availability and defaults.
  - One client aggregation utility used by every chart.
  - The Analytics charts reused as-is, extended with optional props, with no new chart engine.

## Design

### 1. Data model (one migration)

- **New table** `activity_progress_charts`:
  - **Key:**
    - `id`, `root_id`, `activity_definition_id` (FK CASCADE);
    - `session_template_id NULL` and `program_day_id NULL` (FK CASCADE). Both NULL is the
      activity-wide row, used by ad-hoc sessions and as the fallback.
  - **Settings:**
    - `kind`: `goal | activity_trend | scatter | metric_trend`, enforced by a CHECK.
    - `trend_series`: `metric | yield`, NULL unless the kind is `activity_trend`.
    - `metric_id`, `x_metric_id`, `y_metric_id`: FKs to `metric_definitions` with ON DELETE SET NULL.
    - `set_aggregation`: `top | average | total`, CHECK that `total` only applies when
      `trend_series = 'yield'`.
  - **Housekeeping:** `version`, `created_at`, `updated_at`.
  - **Unique** on `(activity_definition_id, coalesce(session_template_id,''), coalesce(program_day_id,''))`.
- **Why a separate table** rather than more columns on `activity_progress_defaults`: comparison defaults
  are copied onto instances by a trigger, and chart settings are not per instance. Keeping them apart
  keeps both clean, and ad-hoc sessions get the activity-wide row without disturbing the comparison
  trigger.
- **Model:** `ActivityProgressChart` in `models/activity.py`, exported from `models/__init__.py`.

### 2. Server: resolve and save

- **New `services/progress_chart_settings.py`:**
  - `available_kinds(activity, goal)`:
    - `goal` when `chart_spec` finds an in-scope goal condition;
    - `scatter` and `metric_trend` with two or more tracked metrics;
    - `activity_trend` with one or more;
    - yield only when `yield_metric_ids(activity)` is non-empty.
  - `default_settings(activity, goal)` picks the first that applies:
    1. Goal progress, if a goal condition is in scope.
    2. Scatter, for two or more tracked metrics: X and Y are the first two by sort order, with the
       best-set metric as Y if one is flagged.
    3. Activity trend: yield when available, else the best-set or first metric.

    Aggregation is `top`.
  - `resolve(activity, session, goal)`:
    - Lookup order: the exact (template, program day) row, then the activity-wide row, then
      `default_settings`.
    - Each saved field is validated against what's available. A deleted metric or vanished goal falls
      back field by field, never erroring.
    - Returns `{kind, trend_series, metric_id, x_metric_id, y_metric_id, set_aggregation, source: 'saved'|'default', available: {...}}`.
  - `save(instance, data, version)`: upserts the row for the instance's session template and program day
    (both NULL for ad-hoc sessions). It returns 409 on a version conflict and 422 when the kind or a
    metric isn't available.
- **`ProgressService.get_progress_series`** adds `chart_settings` (resolved) next to `chart`. The goal
  spec is still `chart_spec`, so `goal` keeps its threshold.
- **New route** in `blueprints/activities_api.py`: `PUT /<root>/activity-instances/<id>/progress-chart`.
  It uses a new `ProgressChartSchema` in `validators/activities.py`.
- **Events:** `ACTIVITY_PROGRESS_CHART_UPDATED`, logged like the comparison event.

### 3. One set-aggregation utility (client)

- **New `utils/setAggregation.js`:**
  - `aggregateMetric(instance, metric, mode, split)`: `top` respects `higher_is_better`; `average` is the
    mean across sets. Instances without sets use their direct values.
  - `aggregateYield(instance, yieldIds, mode)`: per-set products, then top (max), average (mean) or
    total (sum).
  - `topSet(sets, metric)`: the set chosen for a scatter point. It is ranked by the Y metric's
    direction, so a point is one real set.
- **Replaces:**
  - `MetricTrends.resolveMetricValue`;
  - the inline top/average logic in `ScatterPlot`, which fixes its direction bug in Analytics too;
  - the yield sum in `goalConditionSeries.instanceYield` becomes `aggregateYield(..., 'total')`, with
    identical results.

### 4. Shared Analytics charts, extended with optional props

- **`MetricTrendsChart`** (`components/analytics/visualizations/activities/MetricTrends.jsx`):
  - accepts the pseudo-metric `'yield'` (label "Yield", from `yield_metric_ids`). Analytics' Metric
    Trends gains a Yield chip in `ActivityMetricControls` when the activity has yield, so the deep
    link round-trips;
  - accepts `setsHandling: 'total'` for yield;
  - `highlightInstanceId` / `hoverInstanceId`: datasets carry `instanceIds`, so the current session is
    emphasised and a hovered past session becomes the active point.
- **`ScatterPlot`** (`components/analytics/ScatterPlot.jsx`):
  - points carry `instance_id`;
  - takes the same `highlightInstanceId` / `hoverInstanceId`;
  - gains a one-line caption when compact (like MetricTrends uses CompactChartFrame).
- **Shared active-point helper:** `useActiveChartPoint(chartRef, elements)` in
  `components/analytics/useActiveChartPoint.js`, moved out of `ConditionProgressChart`'s effect. All
  three charts use it.
- **Activity trend** is `MetricTrendsChart` with one series. **Metric trend** is the same chart with
  both metrics. **Goal progress** stays `ConditionProgressChart`.
- **Goal reference lines:** trend charts draw in-scope goal lines through the existing `goalLines` prop.
  They use `queryKeys.goalConditionLines` / `fractalApi.getActivityGoalConditions`, as `SavedViewChart` does.

### 5. Progress pane rendering

- **New `components/sessionDetail/ProgressChartView.jsx`** maps `chart_settings` to the right shared
  chart:
  - `activityInstances = { [activityId]: series.instances }` and `activities = [series.activity_definition]`;
  - wrapped in `ChartDensityContext` (`compact` in the pane, `expanded` when expanded);
  - shared by `ProgressChart` (compact card) and `ExpandedProgressChart`.
- **Cross-fade:** `useFadingProgressSeries` keys on the settings too, so changing chart type or metric
  fades just as a changed comparison does.
- **Hover:** the `useProgressHover` highlighting keeps working on every chart type.

### 6. Controls in the expanded chart's place

- **When expanded,** the pane card becomes **Chart controls + Collapse**. "Showing in place of the
  session." stays as a small note.
- **Factoring the Analytics controls:** `ActivityMetricControls` is split into exported field
  components, and Analytics composes them exactly as today:
  - `SetsHandlingField` (Top set / Average, plus Total when the series is yield);
  - `MetricSelectField` (a labelled metric select, optionally with Yield);
  - `MetricChipsField`.
- **New `ProgressChartControls.jsx`** composes the same fields:
  1. **Chart:** a segmented control of the available kinds (Goal progress, Activity trend, Scatter,
     Metric trend), styled like the comparison modes.
  2. **Per kind:**
     - Activity trend: Plot (each metric, Yield);
     - Scatter: X and Y;
     - Metric trend: the two metrics, as chips when there are three;
     - Goal progress: none.
  3. **Sets:** aggregation, for set-based activities. Goal progress has none.
- **Saving:** every change saves immediately through `useProgressChartMutation` in `hooks/useActivityTags.js`:
  - optimistic update of the series cache's `chart_settings`;
  - offline-queued through the outbox as `SESSION_OP.PROGRESS_CHART`, coalesced per instance, like
    `PROGRESS_COMPARISON`;
  - invalidated on ack.
- **Open in Analytics** maps the settings to the matching viz:
  - scatter → `scatterPlot` with X and Y;
  - trends → `metricTrends` with the metrics or yield;
  - always passes `setsHandling` plus the tag, template and program-day filters.

  This extends `buildAnalyticsLink`/`parseAnalyticsLink` with `metricX`, `metricY` and `sets`.

## Critical files

- **Backend:**
  - `models/activity.py`, `models/__init__.py`, new migration
  - new `services/progress_chart_settings.py`, `services/progress_service.py` (series payload)
  - `blueprints/activities_api.py`, `validators/activities.py`, `services/events` (event name)
- **Shared client:**
  - new `utils/setAggregation.js`, `utils/goalConditionSeries.js`
  - `components/analytics/ScatterPlot.jsx`, `.../visualizations/activities/MetricTrends.jsx`, `ActivityMetricControls.jsx`
  - new `components/analytics/useActiveChartPoint.js`
  - `components/goalDetail/ConditionProgressChart.jsx`
- **Progress pane:**
  - new `ProgressChartView.jsx` and `ProgressChartControls.jsx`
  - `ProgressChart.jsx`, `ExpandedProgressChart.jsx`
  - `hooks/useActivityTags.js`, `offline/opKinds.js`, `offline/sessionOps.js`, `offline/sessionOpHandlers.js`
  - `utils/analyticsDeepLink.js`, `components/analytics/useAnalyticsDeepLink.js`
- **Docs:**
  - `planning/ui-contracts-reference.md` (Progress pane and Analytics Metric Trends Yield)
  - `index.md`
  - this plan saved as `planning/progress-chart-types.md`

## Verification

- **Backend:**
  - `resolve`: exact row beats activity-wide beats default; a deleted metric falls back; a vanished
    goal falls back to the next default; two metrics default to scatter; a yield activity defaults to
    activity trend on yield.
  - `save`: upsert per template and program day, an ad-hoc session writes the activity-wide row, 409 on
    a version conflict, 422 on an unavailable kind or metric or on `total` without yield.
  - Migration upgrade, downgrade and upgrade on a scratch database.
  - Query budget for `progress-series`, which gains at most one query.
- **Client unit tests:**
  - `setAggregation`: top respects direction, average, yield top/average/total, and goal yield totals
    unchanged.
  - `ScatterPlot`'s top set now respects lower-is-better (Analytics test).
  - `MetricTrends` with yield.
  - `useActiveChartPoint`.
- **Progress pane:**
  - The controls render only the available kinds.
  - A change saves optimistically and through the outbox when cached.
  - Expanded mode shows controls with Collapse.
  - The Analytics link for each kind.
  - Hover highlighting works on scatter and trend.
- **Gates:**
  - `./run-tests.sh backend` and the frontend suites;
  - eslint, build and bundle budgets (the Session Detail chunk: lazy-load scatter and trend charts in
    the pane if needed);
  - maintainability and responsive audits;
  - basedpyright with no new errors.
- **Manual check against dev data** (Pike Push Ups):
  1. The chart defaults to a scatter of Distance against Reps.
  2. Expand it: controls replace the card.
  3. Switch to Activity trend on Reps, then average: it cross-fades.
  4. Start another session from the same template: the choice is remembered.
  5. An ad-hoc session uses the activity-wide choice.
  6. Open in Analytics shows the same chart.

## Implementation notes (2026-10-23)

- Migration `d1f3a5c7e9b2` (upgrade/downgrade/upgrade checked on the dev database).
- `MetricDefinition.multiplies` (the linked fractal metric's flag) backs every yield decision, so
  availability matches the activity editor.
- The progress ops' optimistic patch lives in `offline/progressChartOps.js`; the chart op shares the
  comparison's ack (the series refetches with the timelines).
- Analytics route budget raised to 325 KiB (+2.7 KiB for the shared aggregation, fields and hover).

