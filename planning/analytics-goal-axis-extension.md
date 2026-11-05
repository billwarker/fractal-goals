# Extend chart axes while setting a goal

## Context
In Set goal mode a goal can only be placed inside the plot, and the plot stops at the current data. A goal beyond your best so far, usually the point of setting one, can't be clicked. We agreed on two things together:

- **A. Automatic headroom:** entering Set goal mode widens the axes by about 25%.
- **B. Extend buttons:** a small "+" at each extendable axis end adds 50% of the current range per click.

## Grade of what exists today

| Area | Grade | Why |
|---|---|---|
| Database | **S** | Nothing to store. Extensions are temporary, and goals already save the thresholds they need. No migration. |
| Value reading | **A** | Goal values come from `scale.getValueForPixel`, so crosshair, snapping and goal values follow a wider scale with no changes. |
| Keeping goals visible | **A** | The invisible lines from `goalLineAnnotations` already stretch axes to reach a threshold, so a far-off goal stays on the chart after exit. |
| Axis control | **D** | Nothing can widen an axis. Each chart builds its scales separately, so a per-chart approach would touch five charts. |

## Target (S+)
One small mechanism, no per-chart scale edits, nothing saved, and no effect on Save or on charts outside Set goal mode.

## Behaviour

**Entering Set goal mode:** every extendable axis gains 25% on each end that has room.

**Clicking "+":** that end grows by 50% of the axis's current range.

**Leaving (Done, Esc or the `A` key):** axes return to normal. Decision taken by default, since the reset question wasn't answered: **reset on exit**. Say so here if you'd rather they stayed until reload.

**Which ends can extend:**

| Chart | Extendable | Notes |
|---|---|---|
| Metric Scatter Plot | X and Y, both ends | |
| Metric Trends | Y, both ends, every metric axis together | X is past sessions |
| Metric Progress | Y, both ends | Percent change can be negative, so no zero floor |
| Activity Totals | X, upper end | Starts at zero |
| Activity Trends (running total) | Y upper end, and X into the future | X adds date buckets, see step 5 |

**Zero floor:** an axis whose data starts at zero or above never goes below zero, and its lower "+" is hidden once it reaches zero. This is what makes lower-is-better metrics (a faster time) work without treating them specially.

**Button placement:** inside the plot corners, so they never overflow a panel that fills its grid cell. Y upper is top-left, X upper is bottom-right, Y lower is bottom-left, and X lower sits just right of Y lower. They use the chart's secondary text colour on the card background, at 28px so they work on touch.

**Hidden while a pin popover is open**, because rescaling would move the pinned point away from its popover.

## Implementation

1. **`client/src/components/analytics/axisExtension.js` (new): pure logic and the Chart.js plugin.**
   - `extendedLimits({ min, max }, { low, high })`: returns the widened range and applies the zero floor. A zero-width range (one data point) uses `Math.abs(max) || 1` as its span.
   - `headroomExtension()` for the 25% start, and `growEnd(extension, axis, end)` for a click. `growEnd` adds 50% of the current range, expressed as a fraction of the base range.
   - Plugin `axisExtension`:
     - `afterDataLimits(chart, { scale })` widens linear scales when `chart.$axisExtension` is set, the same per-instance convention `pageGridSnap` uses. Category scales are skipped, which gives the per-chart table above without per-chart code.
     - `afterLayout` calls `chart.$axisExtension?.onLayout?.()`, so the buttons reposition after `pageGridSnap`'s delayed re-layout and after a resize.
     - It records each scale's base limits, so the lower "+" can tell whether there's room.
   - Registered next to `pageGridSnap` in `ProfileWindow.jsx`. It does nothing unless the marker is set.

2. **`annotate/useAxisExtension.js` (new): state hook used by `ChartGoalSurface`.**
   - Takes `chartRef` and `annotating`. Holds the extension state, starting from `headroomExtension()` on entry and cleared on exit.
   - An effect compares `chart.$axisExtension` with the current state and, when they differ, assigns it and calls `chart.update('none')`. Comparing on each render also covers a chart instance recreated while in the mode. Exit deletes the marker and updates the same way.
   - Returns `{ ends, area, extend(axis, end), futureBuckets }`, with `ends` read from the chart's scales.

3. **`annotate/AxisExtendButtons.jsx` (new) and styles in `annotate/Annotation.module.css`.**
   - Renders one `IconButton` per available end, positioned from `area` and the surface offset the way `AnnotationCrosshair` is.
   - Aria labels such as "Extend vertical axis up". Tabbable.
   - Carries `data-chart-goal-menu`, which `annotateHandlers.onClick` already ignores, so clicking "+" never pins a goal.

4. **`ChartGoalSurface.jsx`:** call the hook, render the buttons when `annotating && !pin`, clear `hover` after an extend, and add `futureBuckets` to `chartContext`.

5. **Running total future dates:**
   - `runningTotalRows(result, range, today, futureBuckets = 0)` adds that many buckets past its existing tail.
   - `ActivityTrendsChart` takes a `futureBuckets` prop, added to its `useMemo` deps, and `visualizations/activities/index.jsx` passes `context.futureBuckets`.
   - In the hook, X extension on a chart with a `runningTotal` dataset adds `ceil(labels × 0.25)` on entry and `ceil(labels × 0.5)` per click, in place of scale widening. Rows are empty past today, and `readRunningTotal` already reads `bucketKeys`, so goal deadlines work there unchanged.

**Reused as they are:** `readChartGoalTarget`, `goalLineAnnotations`, `AnnotationCrosshair`, `IconButton`, `GoalMarkerLayer` (it re-measures whenever the surface re-renders).

**Saved views and Save:** extension state stays out of `windowState`, so `savedStateSignature` never sees it and Save doesn't appear.

## Risks to check while building
- **Activity Totals `stepSize: 1`:** a heavily extended count axis could produce too many ticks. If it does, cap total extension at 20× the base range.
- **Grid snap:** tick counts change on extend. `pageGridSnap` re-lays out over a few frames, so the `onLayout` callback must keep buttons and goal markers aligned afterwards.
- **Plugin order with `chartjs-plugin-annotation`,** which also adjusts limits in `afterDataLimits`. Base limits should be read after it, so a goal already past the data doesn't get double headroom. Verify the order and adjust registration if needed.

## Verification
- **Unit:** `axisExtension` (headroom, growth, zero floor, negative ranges, one data point, category skipped); `runningTotalRows` with `futureBuckets`; `ChartGoalSurface` (buttons only in the mode, hidden with a pin, clicking "+" doesn't pin, exit clears the marker).
- **Real chart in jsdom or e2e:** a new e2e in `client/e2e/analytics-goals.spec.js` on desktop and mobile. It opens a scatter view, enters Set goal, clicks "+", places a goal beyond the old axis, creates it, exits, and checks the axis resets but still reaches the goal, and that Save never appeared.
- **Screenshots:** rebuilt app on desktop and phone, in light and dark, for Scatter, Metric Trends, Metric Progress, Activity Totals and running total.
- **Gates:** `npx eslint src e2e`, `node scripts/maintainability-audit.mjs`, `npx vitest run src/components/analytics src/pages src/utils`, the analytics e2e specs. No backend change, so no backend tests.
- **Known unrelated failure:** the audit currently fails on `src/offline/sessionOpHandlers.js` (452 of 450 lines, from `d108d157`). It isn't part of this work and will stay failing unless you want it handled separately.

## After approval
Save this plan to `planning/analytics-goal-axis-extension.md`, per CLAUDE.md, before starting.

## What changed while building
- **Running total:** the time axis uses `extension.x.high` as a share of its buckets, passed to the chart as `axisFutureShare`, rather than the hook counting labels. There's one source of truth and no state set from an effect.
- **Small plots:** when the plot is under 360×240 (phones, where touch buttons are 44px), the controls sit in a row at the top right of the chart area, over the chart's title, instead of in the plot corners, where they hid data.
- **Button labels:** "Y↑", "Y↓", "X←", "X→", named by axis and direction.
- **Pulling back:** an extended end also gets a dashed button with its arrow pointing inward. Each click undoes one extension (`shrinkEnd`), stopping at the 25% headroom.
- **Chart timing:** the hook watches for the chart frame by frame while in the mode, because it can mount late or be replaced with nothing re-rendering the surface.
- **20× cap dropped:** eight clicks on Activity Totals stayed readable with no console warnings.
- **Metric Progress zero floor:** applies when all of its data is at or above zero, so "no zero floor" only holds when the data is already negative.
- **Test data:** `scripts/browser_test_server.py` seeds a `browser-axis-room-root-*` fractal for the e2e, because the test account is at its fractal quota and sessions can't be created on a root with one in progress.
