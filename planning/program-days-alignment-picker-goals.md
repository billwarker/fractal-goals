# Program Days page: row alignment, full activity picker, Details | Goals sidebar

## Context

Three gaps on the Programs → **Days** view:

1. **Compare mode misaligns rows.** `useAlignedColumns` lines up the two columns only down to card, section and item level (`planAlignmentKeys` in `utils/programDaysView.js`). Set rows and circuit rounds don't carry `data-align-key`, so they drift. The editable column has taller rows (↑ ↓ × item controls, round × buttons, selected-round styling), and that drift adds up down a circuit, as the screenshot shows. Read-only columns already use spacer hacks (`rowActionSpacer`) to try to match heights, but these break as soon as anything else differs.
2. **The "+ Add activity" picker is cut down.** `SessionPlanCard` renders `ActivitySelectorPanel` with only `showTypeToggle` and `closeOnSelect`. Search works, but creating or copying an activity or circuit is turned off. That also turns off ActivityPicker's "create from search" (type a name, press Enter, create it). Session Detail already has the full flow (`SessionSection.jsx` → `ActivityBuilder` + `CircuitBuilderModal`).
3. **The Days sidebar has no Goals view.** `ProgramSidePane` explicitly hides the Details | Goals toggle when `daysNavigator` is set (`showSubViews = … && !daysNavigator`). On the Days tab, users can't see the goal hierarchy they're programming toward.

## Grade of the existing code against this plan

| Area | Grade | Why |
|---|---|---|
| Column alignment infrastructure | **B+** | `useAlignedColumns` and `pairAlignmentKeys` are generic, order-preserving, and re-measure through ResizeObserver and MutationObserver. They're just not used below item level, and the read-only "spacer" approach to equal heights is fragile. |
| Plan activity picker | **C** | It uses the shared `ActivityPicker` (search, groups, circuits toggle), but create and copy aren't wired. Session Detail's circuit-builder hook (`useSessionCircuitDefinitionBuilder`) is tied to creating a *circuit run*, so plans can't reuse it as it stands. |
| Days sidebar / goal scoping | **C+** | The Details/Goals toggle exists but is explicitly excluded on Days. Session Detail's scoped hierarchy (`SessionGoalHierarchyPanel` + `useSessionGoalsViewModel` + `activityGoalScope`) is well factored on the model side, but it's bound to `ActiveSessionContext` and a backend `sessionGoalsView`. Plans have no equivalent view and no notion of an "active" card. |
| **Overall** | **B-** | The building blocks are strong and reusable. What's missing is an active-plan concept, a plan-shaped goals view, and a picker that isn't stripped down. |

## S+ design

### 1. Row-level alignment in compare mode

- **Key scheme** (`utils/programDaysView.js`): add `planRowAlignKey(itemAlignKey, kind, index)`. It returns `${itemAlignKey}|${kind}#${index}`, where kind is one of `sets-header`, `set`, `flat`, `round`, `round-slot:<slotId>`. Keys stay in document order, so `pairAlignmentKeys`' greedy common subsequence still never crosses pairs. No change to the hook itself.
- **Editors take an optional `alignKey` prop** and stamp `data-align-key` on their rows:
  - `components/prescriptions/PrescriptionEditor.jsx`: the set header row, each `setBlock`, and the flat row.
  - `components/prescriptions/CircuitPrescriptionEditor.jsx`: each `round`, and each `roundSlot` inside it (keyed by slot id for plans, or by the activity definition id for logged runs, so a logged run lines up with a planned circuit even though run slot ids differ from definition slot ids).
- **Callers pass the item's key**:
  - `SessionPlanCard.jsx` passes `alignKeys.items[s][i]`.
  - `CompletedSessionCard.jsx` passes its `alignKeys?.items[s][i]` (only the first session per template has keys, as today).
- Because rows now align explicitly, the read-only spacer elements can stay as harmless visual parity. I'll leave them in so single-column layouts look the same.
- Stacked (mobile) layouts are still skipped by the hook's existing column-position check.

### 2. Full-featured plan activity picker

- **New `components/programs/days/PlanItemPicker.jsx`.** It owns the picker for one section and its builders. This also keeps `SessionPlanCard` (352 lines) from growing.
  - It renders `ActivitySelectorPanel` with `allowCreate`, `allowCopy`, `showTypeToggle`, `closeOnSelect`, and `initialBrowseGroupId={section.default_activity_group_id}`, the same as Session Detail.
  - **Create or copy an activity** opens the lazy `ActivityBuilder` with `prepareActivityDefinitionDraft(seed)` or `prepareActivityDefinitionCopy(activity)` (`utils/activityBuilder`). `initialSelectedGoalIds` is the **scoped goal** if one is set (§3). Otherwise it's the **program day's `goal_ids`**. Either way it's editable in the builder. `onSave(newActivity)` calls `onAdd(newActivity)`.
  - **Create or copy a circuit** opens `CircuitBuilderModal` with `prepareCircuitDefinitionDraft` or `prepareCircuitDefinitionCopy` (`utils/circuitDefinition`). On save it calls `useCircuitDefinitionMutations(rootId).createMutation`, then `onAdd({ circuit_definition_id, name })`. It keeps a `createdDefinitionId` so a retry never creates a duplicate definition, the same guard `useSessionCircuitDefinitionBuilder` uses. Builder errors show inline through the modal's `errorMessage`.
- **What gets added.** The new item goes into the card's **unsaved draft** through the existing `addPlanItem`, exactly like picking an existing item. The user still presses Save, which keeps the plan's row-version and conflict model intact.
- **No flash of "This activity was deleted".** On create, `setQueryData` appends the new definition to `queryKeys.activities(rootId)` before the existing invalidation refetch. That way `activityById` resolves it on the same render. I'll do this inside `useCreateActivity`'s `onSuccess`, which also benefits every other caller.
- **Wiring.** `SessionPlanCard` replaces its inline picker block with `<PlanItemPicker … onAdd={(selection) => edit((c) => addPlanItem(c, sectionIndex, selection))} />`. `PlanDateColumn` and `ProgramDaysView` thread `dayGoalIds` (from `found.day.goal_ids`) down.
- **Goal scoping.** `PlanItemPicker` accepts `activityGoalScope` (§3) and filters through `useScopedSessionActivityOptions`, exactly like `SessionSectionActivitySelector`.

### 3. Details | Goals sidebar with Session Detail's scoped goal hierarchy

The Goals view behaves like Session Detail's goals pane, applied to the **active plan card**: one template on one date.

- **Active plan card** (state in `useProgramDaysTab`): `{ date, templateId, itemKey }`.
  - **What sets it.** Clicking or focusing a `SessionPlanCard` or `CompletedSessionCard` sets it. A card that has a scoped item also reports that `itemKey`.
  - **Default.** The first loaded template in the planning (right) column.
  - **Compare mode.** Clicking a card in either column switches the hierarchy to that template on that date.
  - **Visual cue.** The active card gets a quiet outline (the existing `--color-border-selected` token), and the Goals header names it: "*Upper A* · Tue 14 Oct".
  - **Reporting.** The card reports its *current* (draft-inclusive) activity definition ids through `onActivePlanChange`. The report is guarded by a joined-id comparison, so it can't loop. That keeps the hierarchy live while the user adds or removes activities before saving.
- **Plan goals view model.** New pure `utils/planGoalsView.js`, `buildPlanGoalsView({ goalTree, scopeGoalIds, activities, activityGroups, circuits, planSections })`. It returns the **same shape as the backend `sessionGoalsView`**:
  - `goal_tree` is the fractal tree (`treeData` from `useProgramData`), pruned to scope plus evidence plus their ancestors.
  - `manual_goal_ids` is the day's `goal_ids`, or the program's `goal_ids` when the day has none. This matches how sessions started from the day are scoped.
  - `automatic_goal_ids` / `activity_goal_ids_by_activity` come from each plan activity's `associated_goal_ids`, plus its activity group's `associated_goal_ids`. Circuit members count as plan activities.
  - `session_activity_ids` lists the plan's activity definition ids.

  This lets the existing **`useSessionGoalsViewModel` run unchanged**, which gives the hierarchy, selected-item target and ancestor highlights, and solid/dashed evidence connectors. Pass `activityInstances: null` so it reads `session_activity_ids`. For a logged session card, the plan sections come from that session's items.
- **Shared rendering.** Extract the highlight and connector callbacks and the scope-icon wiring from `SessionGoalHierarchyPanel.jsx` into `hooks/useGoalHierarchyHighlights.js`. Session Detail and the new `components/programs/days/PlanGoalHierarchyPanel.jsx` both use it, so the two panes can't drift.
  - `PlanGoalHierarchyPanel` renders `HierarchySection` with the same `onGoalIconClick` / `isGoalIconSelected` / labels ("Scope activities to …"), the halo, and lineage connectors.
  - Goal-name click opens the goal modal (`openGoalModal`). Sub-goal creation and "Adjust scope" are omitted, because plan scope comes from the day's goals and is edited in the day editor. An "Edit day goals" link opens `onEditDay`.
- **Goal scope → activity selector.** Scope state is `{ goal }` in `useProgramDaysTab`. `useGoalActivities(rootId, goal.id)` builds the same `activityGoalScope` object Session Detail builds (`useSessionDetailController.js:80`).
  - It's passed to the **active card's** `PlanItemPicker`, which filters through the existing `useScopedSessionActivityOptions`. `ActivitySelectorPanel` already renders the scope banner with **Clear scope**, and the flat list, and the scope-aware empty states.
  - A new activity created while scoped preselects the scoped goal (Session Detail parity). Otherwise it preselects the day's goals, as in §2.
  - Scope is cleared when the day changes or when the user leaves the Days view.
  - Scope survives switching the active card only while the scoped goal is still in the new card's hierarchy. Otherwise it clears, with a polite live announcement.
  - When the active card is read-only (a past date or a logged session), the scope icons are disabled with a hint, "Past plans can't add activities".
- **`ProgramSidePane.jsx`.** In the `daysNavigator` branch, render `subViewToggle` beneath the header.
  - **Details**: the existing navigator, with Compare and the New program day footer.
  - **Goals**: `PlanGoalHierarchyPanel`.
  - The view state reuses the page's `sidePaneView`, so the choice carries between Calendar and Days.
  - On mobile, the sheet shows the same toggle (44px tabs). Scoping a goal doesn't close the sheet, so the user can see the hierarchy change, the same as Session Detail on mobile.

## Critical files

- `client/src/utils/programDaysView.js`: `planRowAlignKey`
- `client/src/components/prescriptions/PrescriptionEditor.jsx`, `CircuitPrescriptionEditor.jsx`: `alignKey` prop
- `client/src/components/programs/days/SessionPlanCard.jsx`, `CompletedSessionCard.jsx`, `PlanDateColumn.jsx`, `ProgramDaysView.jsx`
- `client/src/components/programs/days/PlanItemPicker.jsx` (new)
- `client/src/hooks/useActivityQueries.js`: cache seeding on create
- `client/src/utils/planGoalsView.js` (new), `client/src/hooks/useGoalHierarchyHighlights.js` (new, extracted)
- `client/src/components/programs/days/PlanGoalHierarchyPanel.jsx` (new), `client/src/components/sessionDetail/SessionGoalHierarchyPanel.jsx` (now uses the extracted hook)
- `client/src/components/programs/ProgramSidePane.jsx`
- `client/src/hooks/useProgramDaysTab.jsx` (active plan card and goal scope), `client/src/pages/ProgramCalendarPage.jsx`
- `index.md` (Programs → Days paragraph) and `planning/program-days-alignment-picker-goals.md`

## Tests

- `utils` unit: `planRowAlignKey` and the order of the composed keys; `pairAlignmentKeys` with nested row keys and with differing round counts (3 vs 2 rounds pair the first 2 only).
- `SessionPlanCard.test.jsx` / new `PlanItemPicker.test.jsx`:
  - The create entries are visible.
  - Create from search opens the builder seeded with the name and the day's goal ids.
  - Saving adds the item to the draft (Save becomes enabled) without saving the plan.
  - A circuit retry after a failed add doesn't create a second definition.
- `planGoalsView` unit tests:
  - Day goals take precedence over program goals.
  - Activity, group, and circuit-member evidence is counted.
  - Ancestors are kept.
  - Paused goals are dropped.
  - Empty plan.
  - A plan-added draft activity's goals appear.
- `useGoalHierarchyHighlights`: Session Detail's existing hierarchy tests still pass unchanged (they guard the extraction).
- `ProgramSidePane.viewSwitcher.test.jsx`:
  - The Days tab shows Details | Goals.
  - Details still shows Compare and New program day.
- `PlanGoalHierarchyPanel` / `ProgramDaysView`:
  - Clicking a card in the other column switches the header and the hierarchy.
  - Scoping a goal filters the active card's picker, and the banner Clear works.
  - Scope clears when the new active card lacks the goal.
  - Scope icons are disabled on a read-only card.
- `PrescriptionEditor` / `CircuitPrescriptionEditor`: rows carry `data-align-key` only when `alignKey` is given.

## Verification

1. `./run-tests.sh frontend` and `./run-tests.sh lint` (zero warnings, maintainability budgets).
2. `/run` the app and go to Programs → Days → turn on Compare. Pick a completed date on the left and an upcoming date on the right, using a day with a circuit (as in the screenshot). Confirm Round 1/2/3 and each member row line up. Select a round, add a round, and add a set, and confirm alignment re-settles. On mobile width, columns stack with no added margins.
3. In "+ Add activity": search for a missing name and press Enter. The builder opens with the day's goals preselected. Save it, and the activity appears in the draft immediately. Repeat with "Create New Activity Circuit". Then Save the plan.
4. In the sidebar, switch to Goals on the Days tab:
   - The hierarchy shows for the default (right-column) card.
   - Select an activity, and its goals and ancestors are highlighted.
   - Scope to a goal, open "+ Add activity", and the list shows only that goal's activities, with the banner.
   - With Compare on, click a card in the left column, and the header and hierarchy switch.
   - Switch days, and the scope clears.

## Delivery notes (2026-10-12)

Implemented as planned, with these adjustments:

- **Past plans keep evidence highlighting** (requested during review).
  - Past and logged cards are selectable for highlighting only. Clicking an activity highlights its goals and ancestors, while the editors stay read-only and scoping stays off.
  - A logged session card makes the Goals pane use that session's real goals view (`useSessionGoalsView`, the session page's cache key) and its instances (completion and one-off goal links). Completed evidence therefore renders exactly as on the session page.
- **Activities cache seeding wasn't needed.** `ActivitiesContext.createActivity` already writes the new definition into `queryKeys.activities`.
- **Circuits do now seed their cache.** `useCircuitDefinitionMutations` writes the new definition into `queryKeys.circuits` before invalidating, so a created circuit renders in the plan at once.
- **No circuit retry guard.** Adding to a plan is a local draft edit and can't fail after the definition exists, so the `createdDefinitionId` guard has nothing to protect. A failed create leaves nothing behind and is safe to retry.
- **Bug found while testing.** A blank "Create" passes a `null` draft. The builder's open state is tracked separately (`{ draft }`), matching Session Detail.
- **Two layout fixes surfaced by browser verification:**
  - Circuit rounds gained a trailing `minmax(0, 1fr)` track, so headers, dividers and notes span the round. Fields stay within the field tracks (`2 / -2`).
  - The scoped picker header wraps, so the scope banner no longer runs under the Close button in narrow pickers.
- **Client-side approximation.** The plan goals view approximates the server's effective activity goals (direct plus group associations) on the client, without contribution-goal resolution. That's acceptable for unexecuted plans; logged sessions use the server view.

### Verification

- **Tests and checks.** Vitest passes in full, the client typecheck is clean, and eslint is clean except one existing `ProgramCalendarPage` warning (also on HEAD). The maintainability audit's failures all exist on HEAD; this change adds lines only to files that were already over budget.
- **Browser check.** A throwaway Playwright run against the disposable browser-test server (desktop):
  - Created a circuit from the plan picker and added it to both compared cards.
  - Gave the left Round 1 a note. Rounds 2 and 3, and each member row, stayed within 1px across columns.
  - In Goals, scoping to the root goal showed the banner in the active card's picker, and Clear scope reset it.

## Follow-up: circuit members and deselecting (2026-10-12)

- **Selectable circuit members.**
  - Each round's activities can be selected (item → round → member), mirroring the session page's run → round → member model.
  - The member is part of the card's scope (`slotId`), and the Goals pane highlights the member's activity goals.
  - Clicking the selected member again goes back to its round. Clicking its value fields keeps it selected.
  - Past plans, logged sessions, and read-only circuits without planned rounds (their member list) are selectable for highlighting only.
  - Plans have no per-member notes, so the round's note composer stays in place.
- **Deselecting.** Clicking a card's empty space (not an item, the activity picker, or a control) clears the selection. Clicks from portalled builder dialogs never count (`isCardBackgroundClick`).
- **Styling.** A selected member gets a tint that extends past the row through a box-shadow spread, with no layout change, so the round's shared columns stay aligned.
