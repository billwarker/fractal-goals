# Analytics Experience Overhaul — Readable charts, group-by, annotation goals, goal-aware saved views

## Context

Analytics has solid foundations (a visualization registry, governed query engine, saved views that attach to goals, and a hidden right-click "Set goal here…" on 4 charts). But the user-facing experience has outgrown them:

- **Messy charts.** "Time Spent Per Goal" draws one stacked series per goal (~50 legend entries), colours every goal of a level the same, and uses N-day epoch buckets (120 slivers over a year). Stale Goals is an inline-styled list with a duplicated title.
- **No group-by.** No chart can split by tag, activity, template, program day or goal level.
- **Annotation is hidden and lossy.** Right-click only. It ignores metric precision (always rounds to 2 dp), drops the active tag filter, and can't target an existing goal or a deadline.
- **Filter pane is long.** Every filter always renders. Relevance is guessed from the chart category, and the selected chart's own controls sit at the bottom.
- **Saved Analytics modal ignores goals.** It doesn't show which goals a view is attached to, has no search by goal, no preview, and no rename, duplicate or pin.

**Decisions from the Q&A**
- Many series: **roll up by hierarchy level + drill-down**, with **auto calendar-aligned bucket size**.
- Colours: a **categorical colour per series**; the level appears in legend grouping.
- Hardening covers **series discipline, consistent formatting, and states & density**. No new chart types.
- Group-by dimensions: **tag / tag family, activity / activity group, template / program day, goal / goal level**.
- Annotation: an **explicit mode with an x/y crosshair and axis readouts that respect metric type and precision**. It can create a new goal or update an existing one, and covers **metric trend → single-session**, **cumulative → by a date**, and **frequency → consistency**. **No duration conditions for now.**
- Filters: **chart-declared filters + "Add filter"**, with active chips, **saved with the view**.
- Saved × goals: **show goal links in the modal, attach from Analytics, richer cards**.
- Delivery: **phased, foundations first**. Each phase ships on its own.

---

## Grade of the current implementation (relative to this plan)

| Area | Grade | Evidence |
|---|---|---|
| Architecture & testability | **A-** | `visualizations/registry.js`, pure `chartGoalPrefill.js`, checkJs utils, mirrored-fixture culture, ADR 0003 |
| Series discipline (many-series charts) | **D** | `GoalTimeDistribution.jsx`: one dataset per goal, colour by level (`getGoalColor`), default Chart.js legend; the `descendants` inheritance mode **double counts in a stacked chart** (adds time to every ancestor, then stacks them) |
| Formatting consistency | **C-** | 3+ duration formatters (`GoalTimeDistribution.formatDuration`, `sessionActivityMetrics.formatDuration`, `formatters.formatDurationSeconds`); `chartGoalPrefill.roundValue` ignores `getMetricPrecision`/integer/predefined values; `hexToRgba` assumes hex |
| Time bucketing | **C** | `goal_analytics_service.py:78-108` uses `floor(epoch/width)` N-day buckets, not calendar or timezone aligned; `SessionTrends` has its own client grain logic |
| States & density | **C** | Per-chart inline empty/headers; compact density hides the legend entirely (`applyChartDensity`) |
| Filter pane | **C** | `AnalyticsFiltersSidebar.jsx` renders every filter; `scopeFilterRelevance` infers relevance from category; no per-chart declaration |
| Group-by | **F** | None (activity "Split" means metric splits, not series) |
| Chart → goal annotation | **B-** | Works on 4 charts with reference lines (`ChartGoalSurface.jsx`), but hidden (right-click/long-press), no crosshair or precision, tag filter dropped (`tag_ids: []`), new goals only, no cumulative/deadline |
| Saved views × goals | **C+** | Backend is solid (`goal_chart_service.py`, 12 cap, links); modal shows goals only in the delete warning, **whose Confirm can fire before the goal list loads**; no client cap pre-check |
| **Overall** | **C+** | Strong bones, weak surface |

---

## S+ target plan

### Phase 1 — Chart foundations (series, formatting, grain, states)

**1.1 Chart capability manifest (single source of truth).** Extend each registry entry in `analytics/visualizations/{goals,sessions,activities}/index.jsx` with:
```js
capabilities: {
  filters: { core: ['timeRange','activities'], optional: ['tags','templates','programDays','goals'] },
  groupBy: ['tag','activity','activityGroup','template','programDay'],   // Phase 3
  annotate: { kinds: ['singleSession','cumulative','consistency'] },     // Phase 4
  grain: true,                                                           // supports day/week/month
}
```
Add `getCapabilities(category, id)` to `registry.js`. Retire `scopeFilterRelevance` and replace its call sites with the manifest. A registry test asserts every entry declares capabilities.

**1.2 One formatting module** — new `client/src/utils/chartFormat.js` (`// @ts-check`):
- `formatDuration(seconds, {style:'short'|'clock'})`. Replaces the three duplicates.
- `formatMetric(metricDef, value, {withUnit})` and `snapMetricValue(metricDef, raw)`. These build on `getMetricPrecision`, `normalizeMetricValueForStorage`, `clampMetricValue` and `getAllowedMetricValues` in `utils/sessionActivityMetrics.js`. Integers round, numbers use the metric's precision, durations format as mm:ss at their precision, and predefined values snap to the nearest allowed value.
- `formatBucketLabel(date, grain)` and `formatBucketRange(date, grain)` for axis ticks and tooltip titles.
- `axisTickFormatter(kind, metricDef?)` for Chart.js tick callbacks.

Fix `chartGoalPrefill.js` to use `snapMetricValue` instead of `roundValue`.

**1.3 Calendar-aligned grain (`auto | day | week | month`)**
- **Server:** add a `grain` param to `GET /<root>/goals/analytics` (`goal_analytics_service.py`, `blueprints/goals_api.py`). Bucket with `date_trunc(grain, start AT TIME ZONE :tz)`, using the user's IANA timezone and ISO weeks starting Monday. Keep the point budget as a hard cap: if a grain exceeds it, step up to the next grain. Validate in `validators/`.
- **Auto rule:** a span of 45 days or less → day; 400 days or less → week; otherwise month. It lives in `services/chart_grain.py` and `client/src/utils/chartGrain.js`, both checked against `tests/fixtures/chart_grain_cases.json`, following the repo's mirrored-rule pattern.
- **Client:** `SessionTrends` switches to `chartGrain.js`. Every chart with `grain: true` gets a grain control (Auto, Day, Week, Month) in its panel controls, and its subtitle shows "Weekly · Jan 1 – Oct 31".

**1.4 Series discipline** — new `client/src/components/analytics/series/`:
- `buildSeries.js` (pure, checkJs): takes `{ rows, keyOf, labelOf, measureOf, buckets }` and returns `{ series[], totals }`. Series are sorted by total within the range. Colours are assigned **stably by key**: the palette index is persisted per key in the panel state, falling back to a deterministic hash, so a series keeps its colour when filters change.
- **Palette (as built):** the dataviz reference categorical palette has **8 slots**, validated with its script against the app surfaces: dark `#151d26` passes every check; light `#ffffff` passes, with a contrast WARN that the legend values and tooltips cover. It is exposed as `--chart-series-1..8` and `--chart-series-other` in `design-tokens.css`, and read by `useChartThemeDefaults().seriesColors`. Beyond 8 series, the 7 largest are kept and the rest fold into "Other (n)", which the legend can expand. Hues are never cycled, and with 8 or fewer candidates each entity keeps its slot across filters.
- `ChartLegendPanel.jsx`: a side legend on wide panels and a bottom sheet on compact ones. Each entry shows a swatch, name, total in range and share. **Hover** dims the other series. **Click** toggles a series and **Alt/⌥-click** isolates it. Entries can be grouped under headers (for example, by goal level). The Chart.js legend is replaced on every multi-series chart.

**1.5 "Time Spent Per Goal" rebuild** (`GoalTimeDistribution.jsx` + controls in `visualizations/goals/index.jsx`):
- Replace `inheritanceMode` with `rollupLevel`. The default is the highest level that yields 2 or more series.
- **Implementation finding (checked against dev data):** a goal's analytics time is *neither* direct nor inclusive. Sessions are linked by hand to whichever goals were chosen, usually deep ones (151 sessions on Short Term goals vs 28 on Long Term). Only explicit instance links roll up to ancestors. "Intermediate Level Guitarist" reports 13.9h while its sub-goals report 49h and 40h. Per-goal totals can't be rolled up correctly in the client: the old chart double counted, and a client-side roll-up loses time.
- **So the roll-up is server-side** (`services/goal_time_rollup.py`, `GET …/goals/analytics?charts=true&rollup=true&rollup_rank=&focus_goal_id=&duration_mode=`, returned as `time_rollup`):
  - Each goal maps to one series: the topmost goal at or below the chosen level on its branch (or, when drilled in, the child of the focus it sits under). A goal above the level maps to "‹name› · other".
  - The evidence (sessions, or activity instances in activity mode) is counted **once per series** per calendar bucket. An item already shown in a sub-goal series is left out of every "· other" series.
  - The response carries `unique_totals` per bucket (each item once overall); the tooltip shows these as "Total", plus "Stacked" when siblings share sessions.
  - The response also carries `first_bucket`/`last_bucket`, so the axis spans the selected range (or all evidence) rather than only the dates the shown goals have time on.
  - Levels are keyed by `goal_levels.rank`, so custom level names work.
  - On dev data the all-time stack is 152.8h against 135.4h of unique time, and the unique total is the same at every level.
  - *ADR 0003 note:* this adds a goal-analytics data contract. That is deliberate, because correct attribution needs the evidence rows that `goal_analytics_queries` owns.
- **Automatic level:** the highest level that splits the time between 2 or more goals; else the highest level below the top with any time; else the top.
- **Bucket caption:** the chart states the size it used ("Weekly · Dec 22 – Nov 1, 2026"), and says so when the requested size was too fine for the range.
- Sibling goals that share a session still each count it, and the chart footnote says so.
- **Drill-down:** clicking a segment focuses that goal. Its series become its children, plus "(direct)". A breadcrumb ("All › Become a Great Guitar Player › Intermediate…") steps back up. The focus goal is saved in the panel state.
- Old saved state migrates in `visualizations/state.js`: `root` → Ultimate level, `descendants`/`direct` → the default level.
- The tooltip shows the bucket range, each series' value and the bucket total.
- Remove the duplicated inner `<h3>`; the panel title is canonical.

**1.6 Shared `ChartFrame` (states & density)** — `analytics/ChartFrame.jsx` holds the subtitle (range · grain · group-by), a loading skeleton, partial-history progress (reusing the continuation status from `useVisualizationContext`), empty, error with retry, and "filtered to nothing" with a "Clear filters" action. Every registered chart renders through it.
- In compact density the legend collapses to a "n series" chip that opens `ChartLegendPanel`, instead of disappearing.
- Stale Goals moves to CSS-module rows that use the frame and open the goal on click. This is normalisation only, not a feature expansion.

**Phase 1 completion (as built):**
- **Shared states:** `ChartStates.jsx` (`ChartLoading`, `ChartError`, `ChartEmpty`, `ChartScopeProvider`) is used by `ProfileWindow`, `SavedViewChart` and `AnalyticsWidget`. On the Analytics page, an empty chart says when filters may be the reason and offers "Clear filters", which resets the global filters and the time range.
- **No dual axes:**
  - Session Trends and Activity Trends showed two measures on two y-axes. Each now shows one measure ("Sessions | Time" and "Times done | Time").
  - Saved views keep their first `metrics` entry; there is deliberately no default `measure`, so the old list still decides.
  - Both charts share `utils/chartGrain.bucketRows` and `visualizations/shared/BucketBarChart.jsx`, with calendar grain (Auto/Day/Week/Month, "Year" saved views read as Auto), gaps for empty periods, hours on the axis, and tooltips giving the bucket range.
  - **Deferred to Phase 4:** Metric Trends still plots two metrics on two axes. The annotation code reads those per-metric axes, so it should move to small multiples alongside annotation mode.
- **Series and colour:**
  - Section Time and Activities by Group use `series/SeriesDoughnut.jsx`: the validated palette in stable name order, 8 slices plus "Other", and the legend panel.
  - Every single-series bar uses `--chart-series-1`, with no legend and no in-canvas title (the panel names the chart).
  - Metric Trends and Goal Detail take their colours from the theme tokens.
- **Formatting:**
  - The local duration formatters are gone; `analytics/formatDuration.js` delegates to `utils/chartFormat.js`, so "1h 0m" now reads "1h".
  - Goal Momentum and Activity Totals show time in hours.
  - Completion Rate shows % with "n of m" and orders levels by rank.
- **Stale Goals:** rows are links to `/:rootId/goals?goal=<id>` (new `hooks/useGoalDeepLink.js`), which opens the goal's real details panel on the Goals page. A row shows the level colour, the level, the last activity date and the days since.
- **Analytics page:** the global range and filter state moved into `useAnalyticsGlobalScope.js`, which also keeps the page under its size budget.

### Phase 2 — Filter pane that fits the chart

Restructure `AnalyticsFiltersSidebar.jsx` from top to bottom:
1. **Header:** "Filters · N active", Reset, Collapse (unchanged).
2. **Active chips row:** every active filter as a chip (✕ removes it, clicking opens its editor). A chip for a filter the selected chart ignores is **muted, with a tooltip saying "Not applied to ‹chart›"**, so the scope is always honest.
3. **Chart section** (moved to the top, since the chart type is chosen first): the selected panel's `Controls`, then **Group by** (Phase 3) and **Grain**.
4. **Filters section:** Time range always shows, then the chart's `core` filters, then any optional filters the user added or that are active.
5. **"+ Add filter"** menu: the chart's remaining `optional` filters. Filters that don't apply to this chart are not offered.

**Persistence:** each window state stores `shownFilters: string[]` (the optional filters the user added). `dashboardState.js` sanitizes it, the view layout version becomes v2, and the v1 → v2 migration happens in `sanitizeDashboardLayoutPayload`. Unsaved panels start from the manifest defaults. With several panels open, the Filters section shows the union of their core filters, and each chip names the panels it applies to.

Mobile keeps `ResponsiveSidePane`. The chips row stays sticky at the top of the sheet.

**As built (Phase 2):**
- `visualizations/capabilities.js` declares each chart's filters. Category defaults follow what each filter actually reaches in `analyticsGlobalFilters.js`: goals and activities reach every chart, tags only activity charts, and template and program day reach session and activity charts. Goal charts take the range, goals and activities only. A registry entry can override with `capabilities.filters`. `scopeFilterRelevance` is retired.
- `useAnalyticsFilterPane.js` decides which sections show (`filterSections`), which filters the selected chart ignores, toggling optional filters, and clearing a filter from its chip.
- Chips (`AnalyticsActiveFilterChips.jsx`) use the `Badge` atom. A chip for a filter the chart ignores is dashed and dimmed, and its accessible name says "not applied to ‹chart›".
- **Only the time range shows by default** (decided after review). Goals, Activities, Tags, Session template and Program day sit behind an always-present **+ Add filters** button: "+ Add filters for ‹chart›" with a chart selected, offering only the filters that chart uses; plain "+ Add filters" with none selected, offering what the open charts use, or everything on an empty page.
- With no chart selected, added filters are kept for the visit (local pane state); with a chart selected, they are saved with that chart.
- The button opens an inline list of toggles rather than a portalled menu, since the pane already scrolls. A filter that's set stays shown, so it can always be edited.
- `shownFilters` lives in the chart's own `visualizationState`, so it is saved per chart with the view. No layout version bump was needed: older views lack the key and get the chart's defaults.

### Phase 3 — Group by

**3.1 Pure dimension module** — `client/src/utils/analyticsGroupBy.js` (checkJs, unit tested):
- `groupKeys(instance, session, set?, spec, lookups) → string[]`.
- Dimensions:
  - `tag`, either a chosen family (one series per tag in it, plus "Untagged") or chosen tags (one series each, plus "Other").
  - `activity` and `activityGroup`.
  - `template` and `programDay` (each with "None").
  - `goal` and `goalLevel` (goal charts).
- **Tag semantics** match the condition evaluator (`services/goal_condition_evaluator.py:231-236`): set-based measures use the set's effective tags (set ∪ instance); instance measures use instance tags.
- **Multi-membership honesty:** if a dimension lets one item land in several series (a multi-select tag family, or chosen tags), stacked charts switch to grouped or overlaid rendering and the frame subtitle says "Items with several tags count once per tag". Single-select families (`ActivityTagFamily.single_select`) stay stacked.

**3.2 Chart × dimension matrix** (declared in the manifest from 1.1):

| Chart | Group-by dimensions | Rendering |
|---|---|---|
| activityTrends | activity, activityGroup, tag, template, programDay | stacked bars / lines |
| activityTotals | activityGroup, tag, template | stacked horizontal bars |
| metricTrends | tag (effective), template, programDay | one line per group (with a single metric) |
| scatterPlot | tag, template, programDay | colour per group |
| sessionTrends, durationHistogram, startDistribution | template, programDay | stacked |
| timeDistribution, completionTimeline | goal, goalLevel (rollup from 1.5) | stacked |
| stats, streaks, sectionPie, groupMix, staleGoals | — | — |

Activity and session charts group **client-side** over data `useVisualizationContext` already loads in full (the session analytics summary includes tags, template and program day), so no new endpoints are needed. The group-by spec is saved in `visualizationState.groupBy` and every series goes through `buildSeries`.

**3.3 Catalog parity (ADR 0003).** Add `activity_instance_tags`, `activity_set_tags`, `activity_tag_definitions` and `activity_tag_families` to the semantic catalog (`services/_analytics_datasets.py`, `CATALOG_RELATIONS`) with root-scoped tenant policies, so query views and the SQL explorer can group by tag too. Add tests for tenant isolation and soft-delete or archive filtering.

**Not in scope:** grouping the goal time chart by tag or activity. Its server evidence (`goal_analytics_queries.analytics_evidence`) doesn't carry tags. Time-by-tag is answered by activityTrends/activityTotals (duration measure) grouped by tag.

**Phase 3 as built:**
- **Grouping module:** `utils/analyticsGroupBy.js` (checkJs, unit tested) groups by activity, activity group, tag (optionally one family; "Untagged" for none), template and program day.
  - Sets use their effective tags (set ∪ instance), the same as the condition evaluator.
  - `groupsOverlap` reports when an item can land in several series: any tag grouping except a single-select family.
- **Bucketing:** `chartGrain.groupedBucketRows` counts an item once in each of its groups, while each bucket's total counts it once.
- **Shared pieces:** `visualizations/shared/GroupByControl.jsx` and `useGroupLookups.js`. The latter supplies the lookups and loads tag families only for a tag grouping.
- **Charts:**
  - Activity Trends: activity, group, tag, template, program day.
  - Session Trends: template, program day (always stacked).
  - Activity Totals: each activity's bar split by group, tag, template or program day.
  - Scatter: points coloured by tag (set-effective), template or program day. It keeps one dataset because hover and the goal surface read `datasets[0]`; a point with several tags shows as "Several tags".
- **Overlapping groups** are drawn side by side instead of stacked, with a footnote. Tooltips always show the true total.
- **Deferred:**
  - Metric Trends group-by moves to Phase 4, together with replacing its two-axis layout with small multiples.
  - Start/End Times and the Duration Histogram aren't grouped yet.
  - The goal charts' goal/level grouping is the roll-up from Phase 1.
- **Catalog:** `activity_tag_families`, `activity_tag_definitions`, `activity_instance_tags` and `activity_set_tags` are now in the analytics catalog, each limited to the user's own fractals.
  - Links on deleted instances are hidden; archived tags stay readable.
  - The catalog snapshot is regenerated (reviewed: no credentials or another user's data).
  - **Deploy note:** re-run `scripts/analytics_sql_role_grants.py` so the least-privilege SQL role can read the four new tables.

### Phase 4 — Annotation mode

**4.1 Interaction**
- An **"Annotate" toggle** appears in the `ProfileWindow` toolbar on charts whose manifest declares `annotate`. Shortcut `A` toggles it while the panel is focused. Right-click and long-press stay as shortcuts.
- **Crosshair plugin** (`analytics/annotate/crosshairPlugin.js`, a local Chart.js plugin) draws vertical and horizontal guide lines inside `chartArea`, with **axis badges** on the x and y axes:
  - Y values are snapped and formatted with `snapMetricValue`/`formatMetric`, so they follow the metric's type: integer, precision, mm:ss duration, predefined values, and min/max clamping.
  - X values are formatted per grain.
  - Hold **Shift** to snap to the nearest data point instead.
- A floating **readout card** shows the live condition sentence (via `goalConditionText.js`) and, for cumulative and frequency modes, how much is still needed: "+340 bpm·reps by Dec 31".
- **Click** drops a pin: a dashed threshold line (and a deadline line in by-date modes). The pin can be dragged to adjust, and a popover opens.
- **Keyboard:** arrow keys step the crosshair across ticks or data points (Shift for fine steps), Enter drops a pin, Esc cancels.
- **Touch:** in annotate mode, dragging moves the crosshair and lifting drops the pin.

**4.2 Mappings** (pure functions extending `utils/chartGoalPrefill.js`, all through `snapMetricValue`):
- **metricTrends / scatter / metricProgress → single-session** (existing mappings, now precision-correct).
- **Cumulative → by a date.** Add a **"Cumulative" display toggle** to metricTrends (metric total or yield) and activityTrends (instance count). This is a mode of an existing chart, not a new one. Clicking (x, y) gives `deadline = x`. The target is `y − current running total at today`, because the evaluator only counts evidence inside the goal's active period from `started_at`. The result is a `cumulative` condition (metric or yield). A past x is disabled with "Pick a future date".
- **Frequency → consistency.** On activityTrends/activityTotals in count mode: per-period mode gives `required_count = y`; cumulative mode gives `required_count = y − current` and `deadline = x`.
- **Scope carry-over (fixes the dropped-tag gap):**
  - An active tag filter becomes `tag_ids` (`all` → `contains`, `exact` → `exact`).
  - A tag series under the cursor in a tag group-by adds that tag.
  - Template and program-day scope can't be expressed in a condition, so the readout says "Template filter isn't part of the goal condition".
- **Duration measures** stay disabled with the existing "Time totals can't become a goal condition yet".

**4.3 Pin popover** (`analytics/annotate/AnnotationPopover.jsx`):
- **Create goal:** pick the parent (defaulting to the goal linked to the activity at the nearest level, otherwise the scoped goal, otherwise the root). The name is pre-filled from the condition sentence, and the deadline from x where there is one. It uses `POST /<root>/goals` with the condition in one request (`_apply_completion_fields`), then `applyCreatedGoal` and invalidates `goalConditionRoot`.
- **Apply to existing goal ▾:** goals with an activity threshold on this activity are listed first. Selecting one shows a live **`condition/preview`** ("Would currently be 62% complete") before `PUT …/goals/<id>/condition`. Picking a goal whose completion is `children` or `manual` warns that its completion mode will change.
- **"Also attach this chart to the goal"** is checked by default. If the view is unsaved, it offers "Save view & attach". This ties into Phase 5.
- **Drag existing goal lines:** in annotate mode the reference lines from `goalConditionLines` get handles. Dragging one opens the popover pre-set to "Update ‹goal›".

**4.4 Ownership:** `ChartGoalSurface.jsx` becomes a thin host. State lives in `useChartAnnotation.js` (mode, pin, drag), and chart reading in `chartGoalTargets.js`, extended per manifest kind.

### Phase 5 — Saved Analytics × goals

**5.1 Backend**
- `dashboard_service.list_dashboards` returns for each view: `goals: [{id, name, type}]`, loaded in **one batched query** over `GoalAnalyticsView` (no N+1); `visualization: {category, id}`, derived from the layout; plus `pinned` and `last_opened_at`.
- An additive migration adds `analytics_dashboards.pinned BOOLEAN NOT NULL DEFAULT false` and `last_opened_at TIMESTAMPTZ NULL`.
- New routes: `POST …/dashboards/<id>/opened` (touches `last_opened_at`, best effort), `POST …/dashboards/<id>/duplicate` (handles name conflicts with "(copy)"), and PUT for rename and pin (extending `update_dashboard`).
- The serializer (`_serialize_notes_misc.serialize_analytics_dashboard`) is updated.
- A query-count budget is added to `tests/performance/`.

**5.2 Modal redesign** (`AnalyticsViewsModal.jsx` → two-pane):
- **Left list:**
  - Search matches the name, chart type and **attached goal names**.
  - Segmented filter: All · Views · Dashboards · On goals · Pinned.
  - Sort order: pinned, then last opened.
  - **Rich card:** chart-type icon, name, "Activities · Metric Trends", goal chips (up to 2, then "+n") and relative time.
  - Actions in a "···" menu: Open, Rename, Duplicate, Pin, Attach to goal…, Delete.
- **Right preview** (wide screens; on mobile it stacks): a **live compact preview of the selected card only** via `SavedViewChart` (`useVisualizationContext`, compact density), so only one chart renders at a time. Below it: a list of attached goals that open the goal, plus "Attach to goal…" which shows "n/12" capacity per goal.
- "Empty Analytics View" becomes a small "+ New view" button instead of a card that looks like data.
- **Delete fix:** Confirm stays disabled until `useViewGoals` resolves.

**5.3 In-page goal awareness:** when the open view is attached, `AnalyticsTopBar` shows a badge, "On 3 goals", whose popover lists them. Saving changes to an attached view shows "Updates the chart on 3 goals". `AddViewToGoalsModal` pre-checks the 12-per-goal cap client-side (full goals are disabled with a reason), mirroring `goal_chart_service.MAX_CHARTS_PER_GOAL`.

---

## Critical files

- **Registry & state:** `client/src/components/analytics/visualizations/{registry.js,state.js,goals/index.jsx,sessions/index.jsx,activities/index.jsx}`
- **Charts:** `analytics/GoalTimeDistribution.jsx`, `analytics/AnalyticsExtraCharts.jsx`, `analytics/SessionTrends.jsx`, `analytics/ChartJSWrapper.jsx`, `analytics/visualizations/activities/*`
- **New (charts):** `analytics/series/{buildSeries.js,chartPalette.js,ChartLegendPanel.jsx}`, `analytics/ChartFrame.jsx`, `analytics/annotate/*`
- **New (utils):** `utils/{chartFormat.js,chartGrain.js,analyticsGroupBy.js}`
- **Filters & saving:** `analytics/AnalyticsFiltersSidebar.jsx`, `analytics/analyticsGlobalFilters.js`, `analytics/dashboardState.js`
- **Annotation:** `analytics/ChartGoalSurface.jsx`, `analytics/chartGoalTargets.js`, `utils/chartGoalPrefill.js`
- **Saved views:** `analytics/AnalyticsViewsModal.jsx`, `analytics/AnalyticsTopBar.jsx`, `analytics/AddViewToGoalsModal.jsx`, `hooks/useDashboardQueries.js`, `hooks/useGoalCharts.js`
- **Backend:** `services/goal_analytics_service.py`, new `services/chart_grain.py`, `services/dashboard_service.py`, `services/_serialize_notes_misc.py`, `services/_analytics_datasets.py`, `blueprints/{goals_api.py,dashboards_api.py}`, `models/common.py`, one new Alembic migration

**Reused rather than rebuilt:** `getMetricPrecision`/`normalizeMetricValueForStorage`/`clampMetricValue` (`utils/sessionActivityMetrics.js`), `goalConditions.js` (`createConditionDraft`, `buildConditionPayload`, `inferOperator`), `goalConditionText.js`, `applyCreatedGoal`, `useVisualizationContext`, `SavedViewChart`, `applyChartDensity`, `ResponsiveSidePane`, `TagChipPicker` and `tagPickerOptions.js`, the `condition/preview` endpoint.

## Verification

- **Unit (Vitest):**
  - `chartFormat` covers integer, precision, duration and predefined-value snapping, and clamping.
  - `chartGrain` reads the shared fixture.
  - `buildSeries` covers stable colours, totals and Other folding.
  - `analyticsGroupBy` covers effective set tags, multi-membership and "Untagged".
  - Roll-up: stacks sum to the total of direct time (regression test for the double count).
  - Every mapping in `chartGoalPrefill`, including cumulative "remaining" and past-date rejection.
  - The `dashboardState` v1 → v2 migration and the `state.js` inheritance → rollup migration.
- **Backend (pytest):**
  - Grain buckets across timezone and DST boundaries, with the point-budget step-up, checked against the fixture.
  - `list_dashboards` returns goals in a bounded query count.
  - pin, opened and duplicate.
  - Tag catalog datasets respect tenant scoping.
  - The migration upgrades and downgrades.
- **Browser (Playwright, desktop and mobile):**
  - Annotate a Metric Trends point, check that the badge shows a precision-correct value, create the goal, see the new reference line, and attach the chart.
  - Drag an existing goal line to update the goal.
  - Group activityTrends by tag family.
  - Add and remove optional filters, save the view, reload, and see the filters persist.
  - Search the Saved modal by goal name.
- **Manual QA** on the power-user account: the screenshot's Time Spent Per Goal over All time should show at most about 8 legend entries at the default roll-up and weekly or monthly buckets, and drill-down should work.
- `./run-tests.sh all`, `lint` and `typecheck` pass. Bundle budgets hold (the annotate code is lazy-loaded with the panel).
- After approval, save this plan as `planning/analytics-experience-overhaul.md` and add a link in the `index.md` "Notes and analytics" section once Phase 1 ships.

---

## Further suggestions (not in scope; for later)

1. **Click-through to evidence.** Clicking a bar or point opens a side list of the sessions and instances behind it, using existing session cards.
2. **Cross-filtering between panels.** Selecting a series in one panel filters the others, kept ephemeral in line with the existing decision.
3. **Context overlays.** Program block shading, goal deadline and completion markers, and calendar-event bands on time axes.
4. **Chart notes.** Pin a note to a date on a chart ("switched teachers"), stored as a regular note with chart context.
5. **Accessible data table.** A "View as table" toggle on every chart, plus CSV/PNG export.
6. **Shareable URL state.** Unsaved panel config in the URL, like Notes filters.
7. **Duration goal conditions** (deferred by decision). They would unlock annotation on time charts.
