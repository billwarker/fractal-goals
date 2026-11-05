# Align matching axes across dashboard panels

## Context
Yes, this is possible. On your dashboard, the Metric Trends and Metric Progress panels have the same width and both run through the same sessions over time, yet nothing lines up vertically, so comparing a point with the bar for the same session takes guesswork.

Three separate things stop them lining up, and all three need fixing:

1. **Different slots.** Trends draws every session. Progress drops any session with nothing to compare, so it starts on Jan 6 where Trends starts on Dec 27, and the two have different numbers of slots.
2. **Different plot edges.** Each chart sizes its own axis labels, so the plots start and end at different pixels. Trends also has a right-hand gap that Progress doesn't.
3. **Line vs bar spacing.** Bar charts centre each value in a slot, while line charts put points on slot edges, so even equal slots would be off by half a slot.

Dates can't be the matching key, because labels repeat when two sessions share a day (your chart has "Apr 27" twice). Each session needs a real identity, not its label.

## Grade of what exists today

| Area | Grade | Why |
|---|---|---|
| Database | **S** | Nothing to store. Alignment is worked out from the layout and the charts each time, so saved views, Save and goal charts aren't affected. No migration. |
| Panel layout | **A** | Grid panels already hold `x, y, w, h`, so finding stacked and side-by-side panels is a small pure function. |
| Plot positioning | **A-** | `pageGridSnap` already re-lays out a chart through its padding, which is the same mechanism alignment needs. It only knows about one chart at a time. |
| Knowing what an axis means | **D** | Charts pass plain date strings, so nothing can tell whether two axes are the same. Each chart has to declare this. |
| Charts sharing information | **F** | Panels know nothing about each other. |

## Target (S+)
Alignment happens automatically and only when it's true: same panel edges, and axes that really mean the same thing. A chart outside a dashboard behaves exactly as it does now, and nothing is saved.

## Behaviour

**Which panels align:**
- **Stacked:** same left edge and width, with no panel between them. X axes can align.
- **Side by side:** same top edge and height, with no panel between them. Y axes can align.
- Chains work too, so three stacked panels can all align. Phones are excluded, since their panels don't have this layout.

**Which axes count as the same:**

| Axis | Same when | Examples |
|---|---|---|
| X, sessions | Both plot the same activity's sessions | Metric Trends, Metric Progress |
| X, time buckets | Same grain (day, week, month) | Session Trends, Activity Trends, Time Spent Per Goal |
| Y, metric | Same metric, and the same setting for how sets are read | Metric Trends for Weight in two panels |

Anything else, such as Activity Totals rows or a scatter plot, stays independent. Two different activities also stay independent in this version, because their sessions mostly don't overlap and the slots would be sparse.

**What you see when an X axis aligns:**
- Both charts use all the sessions or buckets from either one, in order. A chart with no value for a slot leaves a gap, so Progress's first slot is empty and every bar sits under its own Trends point.
- Plot edges match, and points sit at slot centres on both.
- Tick labels match, because both charts have the same slots and width.

**What you see when a Y axis aligns:** the same range on both, with the plots' tops and bottoms level.

**No toggle or indicator:** it's automatic, as you described, and undone as soon as a panel moves, resizes or changes chart. Hovering stays per chart; a shared crosshair could come later.

**Set goal mode:** a panel in this mode keeps its X alignment, but its extended Y range affects only that panel and isn't shared.

## Implementation
Built in stages, so you can look at the result after the first one before the rest goes in.

### Stage 1: X axes for Metric Trends and Metric Progress

1. **`components/analytics/alignedAxes/panelGroups.js` (new, pure):** from the grid's panels, return stacked and side-by-side groups.

2. **`alignedAxes/AlignedAxesContext.jsx` (new):** a provider holding each panel's declared axes, its group and the shared result.
   - `useAlignedAxis({ windowId, axis, identity, points })` declares an axis and returns the shared slots, or the chart's own when it has no match or no provider.
   - `SavedViewChart` and goal details have no provider, so they don't change.
   - Mounted inside `ProfileWindowLayout`, because `pages/Analytics.jsx` is 1 line under its limit.

3. **`MetricTrends.jsx` and `MetricProgress.jsx`:**
   - Declare `{ identity: 'sessions:<activityId>', points: [{ key: instanceId, at, label }] }`.
   - Build labels and data from the returned slots, with `null` for gaps.
   - Use `buildMetricProgressRows` keyed by instance id, not by label.
   - When aligned, turn on category `offset` for the line chart, so points sit at slot centres.

4. **Plot edges in `pageGridSnap.js`:**
   - After each panel lays out, it reports its unadjusted plot edges to the provider. The group's target is the largest left edge and smallest right edge, and each chart then gets an inset.
   - Include the inset in `pageGridSnap`'s own space calculation, not in a second plugin, so the two can't fight over padding. With equal inputs, both charts snap to the same grid lines.
   - `MAX_PASSES` limits the re-layouts. Stop reporting once the edges settle, so one chart's change can't set off an endless loop with another's.

### Stage 2: Time-bucket charts
Apply the same declaration in `BucketBarChart.jsx` and `GoalTimeDistribution.jsx`: identity `buckets:<grain>`, with the bucket start date as the key. Empty buckets fill as zeros or gaps, following what each chart does today. If a chart picks its grain automatically, panels with different date ranges may land on different grains and correctly stay independent.

### Stage 3: Y axes
- Declare `metric:<metricId>:<setsHandling>` on Metric Trends' axes.
- Share the range through `afterDataLimits`, the same hook `axisExtension.js` uses, and share top and bottom insets as in Stage 1.
- A dual-axis Trends panel shares each axis only when that metric matches.

## Risks to check while building
- **Goal markers:** `GoalMarkerLayer` measures when React re-renders, and a plugin-driven re-layout doesn't re-render. Use the `afterLayout` callback that `axisExtension` already has, or markers will drift off their points.
- **Sparse labels:** the merged list can be long. Tick skipping should hide this, but check it.
- **Panel resize:** recalculate when a drag ends, not on every frame.
- **Saved dashboards:** check that a dashboard's first load settles without visibly jumping. `isDashboardSettling` already hides the first layout.
- **Set goal on an aligned chart:** clicks read slots by index, so check `chartGoalTargets.js` still reads the right value once slots include gaps.

## Verification
- **Unit:**
  - `panelGroups`: stacked, side by side, unequal sizes, a panel in between, chains.
  - Slot merging: overlap, gaps, repeated dates, order, different identities staying apart.
  - Hook: no provider and no match both return the chart's own slots.
- **e2e, desktop only:** seed a stacked Trends and Progress dashboard for one activity, then read each chart's `chartArea` and slot pixels through the page. Expect equal plot edges, and each session's bar at the same x as its point. Move a panel so widths differ and confirm they separate. Confirm **Save** doesn't appear because of alignment.
- **Screenshots:** your dashboard layout, in light and dark, with one and two metrics on Trends.
- **Gates:** `npx eslint src e2e`, `npm run typecheck`, `node scripts/maintainability-audit.mjs`, `npx vitest run src/components/analytics src/pages`, the analytics and goal-chart e2e specs. No backend change.

## After approval
1. Save this plan to `planning/analytics-aligned-axes.md`, per CLAUDE.md.
2. Build Stage 1 and show you the result before starting Stages 2 and 3.
3. I won't commit until you ask.
