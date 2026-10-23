# Goal Charts — Saved Analytics Views on Goals (S+ Plan)

## Context

The previous plan (`planning/goal-conditions-hierarchy-creation-sequencing.md`) is complete and
committed (`1686b6db`). Completion conditions replaced targets, but nothing replaced the target
manager's per-goal progress view. The threshold chart exists, but it sits behind "View evidence".

Analytics can save views, but they live only on the Analytics page. This plan makes charts part of a
goal:

- Users attach saved analytics views to goals, from Analytics or from goal details.
- Goal details show one chart at a time and can cycle through them. In small spaces (the desktop
  side panel, mobile) the charts render in a simplified form, so they don't overcrowd.
- On the Goals page, a chart can expand inline: it takes over the flow tree's panel, aligned to the
  app's background grid, until it's closed.
- Every activity-threshold goal gets a progress-toward-threshold chart by default.

Decisions already taken:

- **Which views can attach:** activity, goal and session views (session views were added after the
  first build; they read the same full session history as Analytics). Query views stay on the Analytics page.
- **Linking:** goals point to the saved view, so edits flow through, and deleting a view warns and
  lists its goals.
- **Expanding:** the chart shows inline in the Goals page's grid; on mobile, the goal details step
  aside so the chart can show inline.
- **Where to attach:** from both the Analytics page and goal details.

Saved as `planning/goal-analytics-charts.md`.

---

## Already in place (committed)

**From the previous plan (all six phases, plus follow-ups):**

- **Completion conditions:** `goal_completion_conditions` with metric rules. The pure evaluator runs over canonical evidence, and there are no stored ledgers.
- **Goal-scoped evidence read:** `GoalConditionReadService.get_evidence` (`services/goal_condition_reads.py`; `GET /goals/<id>/condition/evidence?since=active|all&activity_id=`). It returns the activity definition, instances serialized by `serialize_activity_instance_for_analytics`, and progress.
- **Threshold chart:** `ConditionEvidenceModal.jsx` draws the threshold-annotated line chart with Active period / All history. It's reached from `CompletionConditionSummary.jsx` (progress bar, "View evidence", "Mark complete") on the Details tab.
- **Goals from analytics:**
  - `ChartGoalSurface.jsx` wraps `ProfileWindow`'s chart: right-click or long-press for "Set goal here…", read by `chartGoalTargets.js` and mapped by `utils/chartGoalPrefill.js`.
  - Existing goals draw as reference lines (`utils/goalConditionLines.js`) from `GET /goals/conditions?activity_id=`.
- **Reviews:**
  - SMART's R is Reviewed.
  - The Details tab shows the description, the review schedule, SMART, the condition summary and programs.
  - Goal Details tabs: **Details · Timeline · Activities · Notes**. The Timeline tab (`820d4c3c`) holds the activity heatmap.

**Analytics today:**

- Saved views are `analytics_dashboards` rows with `kind='view'` and `layout = {type:'analytics_view', profile: <window state>, global_filters}` (`dashboardState.createAnalyticsViewPayload`; `services/dashboard_service.py`; `/api/roots/<root>/dashboards`).
- They're saved from `AnalyticsTopBar` "Save view" and listed in `AnalyticsViewsModal` (`useAnalyticsViews`).
- The Analytics page loads the whole fractal's evidence, page by page (`useAnalyticsPageData` → `/sessions/analytics-summary`, which has no activity filter).
- `ProfileWindow.jsx` (686 lines, cap 702) builds each chart's `context` inline: resolved filters, scoped activities and instances, effective activity and goal, filtered goal analytics.

**The grid and surfaces:**

- Every page draws a 20px background grid (`App.css` `.content-container`; 16px on mobile).
- The Goals page lays its tree and widgets on `PageSurface` (`components/surface/PageSurface.jsx`), on the shared grid-cell engine (`gridLayout/GridLayout.jsx`, `GRID_UNIT = 20`), so panels line up with the background grid. The tree renders inside its panel through `renderTree`.
- `AnalyticsWidget.jsx` already renders a saved view's chart inside a surface panel. But it builds its own, thinner chart context: it never sets the view's selected activity or goal, so activity views that need one (Metric Trends, Progress, Scatter) show "Select an activity" there.

**Reusable UI:**

- `GoalHierarchySelector` (`selectionMode='multiple'`, `selectedGoalIds`).
- The `Modal` and `DropdownMenu` atoms.

---

## Grade of the current system: **C−**

| Area | Grade | Evidence |
|---|---|---|
| Saved analytics views | A− | Views save, list, rename and soft-delete, with kind inference and normalization. |
| Views ↔ goals | F | No link; views render only in Analytics. |
| Progress chart in goal details | C+ | The threshold chart exists but sits one click away in a modal; the Details tab shows only the progress bar. |
| Goals-page chart space | D | The grid-aligned surface and an analytics panel exist, but nothing ties a chart to the selected goal or swaps it in for the tree. |
| Scoped chart data | C+ | Goal-scoped evidence exists for the condition's activity; the Analytics page and `AnalyticsWidget` still page the whole fractal, and there's no activity-scoped read. |
| Reusable rendering | C− | The context is built twice (`ProfileWindow` inline, `AnalyticsWidget` partially), and the copies already disagree: the widget drops the selected activity. |
| Small-space charts | D | Charts render at full detail at any size; no density handling. |

**What S+ means here:**

- **One source of truth.** Goals point to the saved view, so an edit in Analytics shows up everywhere.
- **One rendering path.** A shared hook feeds the same `context` to `ProfileWindow`, `AnalyticsWidget` and goal charts, which fixes the widget's missing activity.
- **Right detail for the space.** Charts simplify themselves when their container is small.
- **One grid.** The expanded chart sits in the tree panel's grid frame, aligned with the background grid like every other surface panel.
- **Bounded data.** Charts in the modal load only their activity's evidence or the cached goal analytics.
- **No stored chart state.** The default threshold chart is computed from the condition.
- **Safe deletes.** Deleting a view warns, names its goals and cleans up its links.
- **Every device.** Arrows and keys cycle charts. Expanding shows the chart inline in the tree panel on every device; on mobile the goal details step aside.
- **Tested.** Neighbouring boundary tests, plus browser tests on desktop and mobile.

---

## Data model — Migration E (additive, after `c6d7e8f9a0b1`)

New table **`goal_analytics_views`**:

- `id`; `root_id` (FK goals, cascade); `goal_id` (FK goals, cascade); `dashboard_id` (FK analytics_dashboards, cascade); `position` (int); `created_at`.
- A unique pair (`goal_id`, `dashboard_id`), and an index on (`goal_id`, `position`).
- Link rows are hard-deleted, since they aren't user content.
- Soft-deleted views are hidden on read, and deleting a view removes its links in the same transaction.

The default threshold chart isn't stored; it's derived from `completion_condition == 'activity_threshold'`.

## Backend

New `services/goal_chart_service.py`, plus routes in a new `blueprints/goal_charts_api.py` registered on the goals blueprint (like the sequence and review routes):

- `GET /<root>/goals/<goal_id>/charts`: the attached views in order (`{dashboard_id, name, layout, position}`) and `default_chart: 'condition_progress' | null`.
- `POST /<root>/goals/<goal_id>/charts {dashboard_id}`:
  - Validates the same fractal and owner, `kind='view'`, and a profile category of `activities` or `goals`.
  - Rejects a duplicate (409) and caps a goal at 12 charts.
  - Adds the view at the end.
- `PUT /<root>/goals/<goal_id>/charts/order {dashboard_ids}`: reorders in a single transaction.
- `DELETE /<root>/goals/<goal_id>/charts/<dashboard_id>`: detaches a view.
- `GET` / `PUT /api/roots/<root>/dashboards/<id>/goals {goal_ids}`: a view's goals, for Analytics' "Add to goal…" and the delete warning. The `PUT` uses the same validation.
- **Delete:** `dashboard_service` removes a view's links when it's deleted.
- **Scoped evidence:** `GET /<root>/activities/<activity_id>/analytics-evidence?since=<iso>&limit=500` returns the activity's most recent instances.
  - Its payload matches the condition evidence `instances` (`serialize_activity_instance_for_analytics`, with session name and date).
  - It reuses `GoalConditionReadService._activity` / `_activity_payload` and keeps a constant number of queries.
- **Agent/MCP:** no new operations; attaching charts stays in the app.

## Frontend

**One rendering path**
- Extract `components/analytics/useVisualizationContext.js` from `ProfileWindow.jsx` (≈ lines 100–330).
- `ProfileWindow` and `AnalyticsWidget` both consume it.
  - `ProfileWindow` shrinks, and a parity test pins its output.
  - The widget gains the view's selected activity and goal, so activity views render there.
- New `SavedViewChart.jsx` renders a saved view's `visualization.Chart` (from `visualizations/registry.js`) read-only, with no controls or query console. Goal details, the expanded chart and `AnalyticsWidget` all use it.
- Embedded activity charts keep the existing goal reference lines (`goalConditionLines`), with this goal's own line emphasised.

**Simplified charts in small spaces**
- `useChartDensity(containerRef)` (a `ResizeObserver`) returns `'compact'` below 480px wide or 260px tall, else `'full'`. It reaches the charts as `context.density`.
- **`applyChartDensity(options, density)`** in `ChartJSWrapper.jsx`, applied by each attachable chart. In compact mode it:
  - hides the title, the legend and the axis titles;
  - caps ticks at 4 on x and 3 on y;
  - shrinks points;
  - shows reference lines without labels;
  - keeps tooltips.
- **Per-chart reductions in compact mode:**
  - Metric Trends plots only the first selected metric, with "+N more" in the caption.
  - Activity Totals shows the top 5 rows.
  - Scatter drops the density halo.
  - The condition chart keeps only the threshold line and the series.
- Each compact chart gets a one-line caption under it (for example "Weight · last 20 sessions") in place of the legend and title.
- Goal details always render compact. The expanded chart and the Analytics page render full; `AnalyticsWidget` follows its panel size.

**Scoped data**
- `useGoalChartData(rootId, view)`:
  - Activity views read `analytics-evidence` for the view's activity. Activities come from the cached activities query.
  - Goal views use the cached `goalAnalytics` query.
  - Session or empty views show a short explanation.

**Default chart**
- Extract `ConditionProgressChart.jsx` from `ConditionEvidenceModal.jsx` (the line, `thresholdAnnotations`, Active period / All history; fed by `useGoalConditionEvidence`).
- The evidence modal keeps using it.
- In goal details it's the first chart for activity-threshold goals, titled "Progress toward <condition>".

**Goal details — `GoalChartsCarousel.jsx`** on the Details tab, in `GoalViewMode` directly above `CompletionConditionSummary` (which keeps its progress bar, "View evidence" and "Mark complete"):
- **Header:** the chart name and "2 of 4", with ‹ › buttons. Arrow keys cycle when the carousel is focused, and an `aria-live` region announces the current chart.
- **Actions:**
  - **Expand.**
  - **Add chart** (`DropdownMenu`): saved views that can attach. It hides ones already attached; query views appear disabled with the reason.
  - **Remove from goal**, on attached views only; the default chart can't be removed.
- **Memory:** the last chart viewed for each goal is remembered per viewer in `localStorage`, with try/catch.
- **Empty state:** goals with no charts show an "Add chart" prompt.
- **Size:** `GoalDetailModalRenderSurface.jsx` (847 cap) and `GoalViewMode` changes stay small; the logic lives in the new files.

**Expand inline (Goals page)**
- `FractalGoals` holds `expandedChart {goalId, chartKey}`. While it's set, the surface's tree panel renders `ExpandedGoalChart.jsx` instead of `FractalView`.
  - The chart keeps the panel's grid-aligned frame, so it sits on the background grid, inline with the page, like any surface panel.
  - It renders at full detail, with the carousel controls and "Back to tree".
  - The tree stays mounted but hidden, so its viewport survives.
  - Escape, closing the goal, or selecting another goal returns to the tree.
- **Mobile:** expanding collapses the goal details sheet; the goal stays selected. The chart then fills the tree panel inline, with "Back to goal" reopening the details.
- **Other pages** (Programs, Session Detail): goal details show the carousel without Expand, since expanding is a Goals-page feature.

**Analytics page**
- With a saved view open, `AnalyticsTopBar` gains "Add to goal…". It opens `GoalHierarchySelector` (`selectionMode='multiple'`) in a modal, with current goals pre-checked, and saves through `PUT dashboards/<id>/goals`.
- It's disabled for query views, with the reason.
- Deleting a view in `AnalyticsViewsModal` shows a confirmation that lists its goals.

**Cache**
- A new `goalCharts` query-key root.
- Attaching, detaching or reordering refreshes that goal's charts and the view's goal list.
- Saving or updating a view refreshes every goal chart.

## Critical files

- **Backend:**
  - `models/common.py` (`GoalAnalyticsView`) and a new migration.
  - New `services/goal_chart_service.py` and `blueprints/goal_charts_api.py`.
  - `services/dashboard_service.py`, `blueprints/dashboards_api.py`, `blueprints/activities_api.py`.
  - Reused: `services/goal_condition_reads.py`, `services/_serialize_activities.py`.
- **Frontend:**
  - `components/analytics/ProfileWindow.jsx`, `ChartJSWrapper.jsx` (`applyChartDensity`) and the attachable visualizations, plus the new `useVisualizationContext.js`, `useChartDensity.js`, `SavedViewChart.jsx` and `ExpandedGoalChart.jsx`.
  - `components/surface/widgets/AnalyticsWidget.jsx`, now on the shared context.
  - `components/goalDetail/ConditionEvidenceModal.jsx`, plus the new `ConditionProgressChart.jsx` and `GoalChartsCarousel.jsx`.
  - `components/goals/GoalViewMode.jsx`, `pages/FractalGoals.jsx` and `components/surface/PageSurface.jsx` (the tree panel's content swap).
  - `pages/Analytics.jsx`, `components/analytics/AnalyticsTopBar.jsx` and `AnalyticsViewsModal.jsx`.
  - `hooks/queryKeys.js`, plus the new `hooks/useGoalCharts.js`.
  - `utils/api/fractalGoalsApi.js`.
- **Docs:** `index.md` and `planning/ui-contracts-reference.md` (a "Goal charts" section).

## Verification

- **Backend:**
  - Attaching:
    - Only views, only activity and goal categories, same fractal only.
    - Another user's view returns 404; a duplicate returns 409; the cap of 12 holds.
    - Order round-trips.
  - Cleanup and listing:
    - Links cascade when a goal is deleted and disappear when a view is deleted.
    - A view's goal list is accurate.
    - The chart list and the scoped evidence read run in constant queries as rows grow.
- **Frontend (Vitest):**
  - A `useVisualizationContext` parity test against current `ProfileWindow` output; `AnalyticsWidget` now renders Metric Trends for a saved activity view.
  - Density: compact under 480px wide or 260px tall, and full otherwise; compact options hide the title, legend and axis titles and cap ticks; the per-chart reductions apply (one metric plus "+N more", top 5 rows).
  - The carousel: cycling by buttons and keys, "n of m", the remembered chart, the default chart first and not removable.
  - Add chart: filtering and the disabled query views.
  - Expand: the tree panel shows the chart in the same grid frame and back; on mobile, details collapse and "Back to goal" reopens them.
  - `SavedViewChart` for each supported category.
- **Browser (desktop and mobile):**
  - Save a Metric Trends view in Analytics, use "Add to goal…", then open the goal: the carousel shows "Progress toward…" and the view, and the arrows cycle between them.
  - The chart in goal details renders compact: no legend or title, a caption instead.
  - Expand replaces the flow tree inline: the chart's panel edges sit on the 20px grid, at full detail. On mobile it shows inline and "Back to goal" works.
  - Deleting the view warns, lists the goal, and leaves only the default chart.
- **Gates:** `./run-tests.sh lint` and `maintain` (`ProfileWindow` gets shorter), `alembic check`, and a one-revision downgrade and re-upgrade.
