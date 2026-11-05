# Save the chart to a goal created from it

## Context
A goal created from an analytics chart opens on an empty "No contributing sessions yet" chart, even though you just made it from a chart full of data. The chart should come with the goal: saved as a view named after the goal, attached to it, and shown first.

Decisions already made:
1. Saved views come first on **every** goal, ahead of "Progress toward…".
2. Saving is **automatic**, with no checkbox.
3. Deleting the goal **keeps** the saved view.

## Grade of what exists today

| Area | Grade | Why |
|---|---|---|
| Database | **A** | `analytics_dashboards` and `goal_analytics_views` (with `position`) already model this, and attaching to a new goal gives position 0. Not S because view names are unique only by a check in the service, so two simultaneous saves could in theory share a name. Harmless here, and not worth a migration. |
| Saving and attaching | **A** | `POST /roots/<root>/dashboards` and `POST /<root>/goals/<goal>/charts` already do both jobs. `createAnalyticsViewPayload` already builds a view from one chart window. |
| Name clashes | **C** | `create_dashboard` returns 409 on a clash, and quietly revives a deleted view of the same name. Only `duplicate_dashboard` knows how to find a free name. |
| Chart order | **C** | `buildGoalChartItems` hardcodes "Progress toward…" first. |
| Chart surface's knowledge of its view | **D** | `ChartGoalSurface` doesn't know whether its chart is an unedited saved view. |

## Target (S+)
No schema change and no new endpoint. The goal is never blocked by the chart, the Analytics page doesn't change state, and repeat goals from one saved view don't pile up copies.

## Behaviour

**After Create on the goal form:**
1. The goal is created, as now.
2. The chart is attached (see the table below).
3. The new goal's detail opens, showing the saved chart first.
4. The Analytics page stays on the same view, with no **Save** prompt and Set goal mode unchanged.

| Chart being used | What happens |
|---|---|
| A saved single-chart view with no unsaved edits | That view is attached and keeps its name. No copy is made. |
| A saved view with unsaved edits, or an unsaved chart | A new view named after the goal is saved and attached. The edits on the page stay unsaved. |
| A panel on a multi-chart dashboard | Just that panel is saved as a new view. The dashboard is untouched. |

**Name clash:** a suffix, so "Bench 225 (2)". Deleted views' names count as taken, so an old view is never revived.

**If the chart step fails:** the goal stays and opens anyway, with "Goal created, but its chart couldn't be saved".

**Left alone:**
- **Update goal** attaches nothing.
- Renaming a goal doesn't rename its view.
- Deleting a goal keeps the view, which then reads "Not on any goal".
- Someone who already chose a chart on a goal stays on it, because the last-shown chart is remembered by key.

**Side effect:** a reused view is a live link, so later edits to it change this goal's chart too. That's how attached views already work.

## Implementation

1. **`services/dashboard_service.py`: find a free name.**
   - Extract the name search from `duplicate_dashboard` into `_free_name(root_id, user_id, base, suffix_for)`, which also counts deleted views as taken.
   - `create_dashboard` takes `suffix_name_on_conflict` from the request. When it's set, the view gets a free name instead of a 409.
   - Add the field to the create schema in `validators/`.

2. **`client/src/components/analytics/annotate/saveChartToGoal.js` (new): the chart step.**
   - `saveChartToGoal({ rootId, goalId, goalName, reusableViewId, windowState, globalFilters })`.
   - Attaches `reusableViewId` if there is one. Otherwise calls `createAnalyticsView` with `createAnalyticsViewPayload` and `suffix_name_on_conflict`, then `attachGoalChart`.
   - Lives outside `ChartGoalSurface`, which is at 397 of 450 lines.

3. **`ChartGoalSurface.jsx`: `createGoal`.**
   - After `applyCreatedGoal`, run `saveChartToGoal` in its own try, showing the warning above on failure.
   - Invalidate `queryKeys.goalCharts(rootId, goalId)` and `queryKeys.analyticsViews(rootId)`, then `setOpenGoalId(newGoal.id)`.
   - New props: `chartToSave: { windowState, globalFilters, reusableViewId }`.

4. **`ProfileWindow.jsx` and `pages/Analytics.jsx`: pass that down.**
   - Analytics computes `reusableViewId`: `selectedViewId` when the open item is a `view` and `!hasUnsavedChanges`, otherwise null. It passes this through `renderWindow`, including its dependency list.
   - `Analytics.jsx` is at 555 of its 560-line limit, so this has to stay under 5 lines.

5. **`components/goalCharts/goalChartItems.js`: chart order.**
   - `buildGoalChartItems` puts saved views first and "Progress toward…" last.
   - Update its doc comment and the module docstring in `services/goal_chart_service.py`.

**Reused as they are:** `attachGoalChart`, `createAnalyticsViewPayload`, `useGoalChartCursor`, `GoalDetailModal`, `SavedViewChart` (it already reads goal lines, so the marker should appear; the e2e below confirms it).

## Risks to check while building
- **The goal form keeps working after `onCreate`:** it saves pending activity associations after `onCreate` returns, and `setDraftGoal(null)` unmounts it first. That's existing behaviour, but opening the goal right after must not race it. If a freshly opened goal shows stale associations, invalidate once more when they finish.
- **Goal not yet in the tree:** `openGoal` reads the tree. `applyCreatedGoal` should have added it, but confirm the detail opens without a flash of nothing.
- **Marker on the compact chart:** confirm it shows on the goal detail, not only on the Analytics page.

## Verification
- **API (`tests/integration/test_saved_analytics_api.py`):** a clash gets a suffix with the flag and still gets 409 without it; a deleted view's name is skipped and not revived; deleting the goal keeps the view with no goals on it.
- **Unit:**
  - `saveChartToGoal`: reuses the view, or saves then attaches; a failure rejects without undoing the goal.
  - `ChartGoalSurface`: the goal survives a chart failure, with the warning, and its detail opens.
  - `buildGoalChartItems`: the new order; update the `GoalChartsCarousel` test.
- **e2e:**
  - `analytics-goals.spec.js`, desktop and mobile: create a goal from an unsaved chart; the goal opens on a chart named after it, with its marker; "Progress toward…" comes second; **Save** isn't offered by this, and the page's title is unchanged.
  - Create one from an open saved view: Saved Analytics has no new item.
  - Update `goal-charts.spec.js` (it expects the threshold chart first) and the existing goal-creation steps, which now need to close the opened goal.
- **Gates:** `npx eslint src e2e`, `node scripts/maintainability-audit.mjs`, `npm run typecheck`, `npx vitest run src/components/analytics src/components/goalCharts src/pages`, the backend test file above, and rebuild before the analytics and goal-chart e2e specs.

## After approval
1. Commit the current uncommitted work on its own first (number fields, parent goal picker, mobile level selector, activity association checkbox), so this stays a separate commit. Remove this step if you'd rather hold that commit.
2. Save this plan to `planning/analytics-goal-chart-on-create.md`, per CLAUDE.md.
3. Build it. I won't commit this work until you ask.
