# Many activity groups per goal

## Context

Commit `97d820dd` (Oct 28) limited each goal to one live activity group. The only reason was the
new-activity group prefill: with several groups there was no single group to prefill. That limit
now works against the per-group Linked switches added to Goal detail → Activities: a switch should
link a group on its own, but today switching on a second group opens the "Replace Activity
Group?" modal, which you also dislike.

This plan makes goal↔group links many-to-many again. Switching a group on adds it; switching it
off removes it; nothing is ever replaced. The Replace modal and the group editor's "Move goals?"
prompt are deleted, so neither can appear again. Prefill: with **one** group, prefill it as today.
With **several**, prefill nothing, but list the goal's groups first in the Activity Group
dropdown under a "From ⟨goal⟩" heading.

## Grade of the current system (for this plan): **B**

| Area | Grade | Notes |
|---|---|---|
| Storage | A | `goal_activity_group_associations` is already a many-to-many table with a composite PK and soft deletes. Only the partial unique index `uq_goal_activity_group_associations_one_active` enforces "one". |
| Write path | A− | Every write goes through `set_goal_activity_group` (`services/goal_activity_group_links.py`), with root locking, events and condition reconciliation. That's good, but its whole contract is "the one group", so it has to be rewritten, not tweaked. |
| Reads / evidence | A | Effective activities (`services/effective_goal_activities.py:73`), condition evidence (`goal_condition_evidence.py:113`), analytics, notes and history all handle lists of groups already. |
| API contract | C+ | `replace` flags, 409 `goal_activity_group_taken`, 422 `goal_activity_group_single`, the top-level `activity_group_id` field (the payload takes `[0]`), and `replace_goal_groups` on the group editor all encode the limit. |
| Frontend | C | The rule is spread across `singleGroupSelection` in the picker, `toggleGroupSelection({ single })`, the Replace modal and `applyGroupSelection` in `ActivityAssociator`, the `pendingMove` flow in `GroupBuilderModal`, `goalActivityGroupErrors.js`, the 409 handling in `ActivitiesContext`, and `getGoalNodeActivityGroupId` (prefill). |
| UX | C | A goal-detail switch behaves like replace, and a blocking modal interrupts a simple link. |

**What S+ means here:** many-to-many as an explicit, documented invariant that is enforced in one
place. No leftover single-group code paths or error codes. Every link is idempotent and
order-independent. The UI never confirms a link. A reversible migration that follows
`MIGRATION_POLICY.md`. Tests at every layer prove that several groups work end to end.

## Plan

### 1. Database: drop the one-group index (new Alembic revision)

- New revision `…_many_activity_groups_per_goal.py`, its `down_revision` the current head
  (`alembic heads`). Type: **relaxing / non-destructive**. `upgrade()` drops
  `uq_goal_activity_group_associations_one_active`. The composite PK `(goal_id,
  activity_group_id)` still covers lookups by goal.
- `downgrade()` recreates the index, using the same pre-check as `a7c9e1b3d5f7`: abort with a
  listing if any goal holds several live groups. Keep `scripts/report_multi_group_goals.py`, but
  update its docstring so it describes downgrade gating.
- Update the comment at `models/goal.py:82`.

### 2. Backend services: link, unlink and set, with no replace

`services/goal_activity_group_links.py` (rename the module docstring to "a goal's activity groups"):
- Replace `set_goal_activity_group` with three set-based primitives, all built on
  `reconcile_association_rows` and `append_goal_association_event`, as now:
  - `link_goal_activity_groups(db, root_id, goal, groups) -> set[changed group ids]` adds the
    groups and is idempotent.
  - `unlink_goal_activity_group(db, root_id, goal, group_id) -> bool` removes one group.
  - `set_goal_activity_groups(db, root_id, goal, groups)` sets the goal's exact group list (for
    the batch editor and goal copy).
- `current_group_ids` returns `{goal_id: set[group_id]}`.
- Delete `GROUP_TAKEN`, `GROUP_SINGLE`, `taken_error`, `GroupLinkChange.previous_group_id` and
  `flush_group_links`'s index mapping (use a plain flush). Keep `lock_root`, `live_group`,
  `goals_using_group`, `group_names` and `reconcile_group_link_conditions` unchanged.

Callers:
- `services/activity_association_service.py`:
  - **Batch:** accept every real group ID (drop the 422), then call `set_goal_activity_groups`.
  - **Link:** add the group, idempotently. 201 when linked, 200 "Group already linked". Drop
    `replace` and `previous_group_id`.
  - **Unlink:** 404 only when that group isn't linked.
- `services/activity_group_service.py` `_replace_group_goal_associations`: drop the conflict and
  replace logic. The group editor's goal list is now exactly "the goals linked to this group";
  other groups on those goals are untouched. Remove the `replace_goal_groups` handling (lines
  ~231, 259, 283, 361).
- `services/_goal_lifecycle.py:160`: copying a goal copies **all** its live groups through
  `set_goal_activity_groups`.
- `blueprints/goal_activity_groups_api.py`: remove `replace` parsing and the one-group docstrings.
  Requests that still send `replace` are ignored, which keeps cached older bundles working.
- `services/_serialize_goals.py:120`: remove the top-level `activity_group_id`.
  `associated_activity_group_ids` is the contract.

**Overlapping groups** (a parent group and its subgroup both linked) are allowed and each stays
independent. Effective activities already dedupe through `seen_group_ids`.

### 3. Frontend

- **`ActivityAssociator.jsx`:**
  - Delete `pendingGroupReplacement`, the Replace modal and `handleConfirmGroupReplacement`.
  - `applyGroupSelection` becomes `linkGroups(groups)`, which adds groups to
    `associatedActivityGroups` without removing any.
  - `handleConfirmActivitySelection` adds every picked group.
  - `handleLinkGroup` (the switch) calls `linkGroups([group])`.
  - Drop `singleGroupSelection` from the picker.
  - `handleUnlinkGroup` keeps using `withoutGroupLinkedActivities`, which already works per group.
- **Activity picker:** remove the `singleGroupSelection` prop from `ActivityPicker.jsx` and the
  `single` option from `toggleGroupSelection` in `activityPicker/activityPickerUtils.js`. Only
  ActivityAssociator passes it.
- **`GroupBuilderModal.jsx`:** delete `pendingMove`, `resolvingMoveRef`, the "Move goals to this
  group?" `ConfirmationModal`, and the conflict branch in `saveGoals`.
- **`ActivitiesContext.jsx`:** drop the `isGoalGroupTaken` special case, so errors use the
  normal toast. Delete `utils/goalActivityGroupErrors.js` and its tests.
- **`utils/api/fractalGoalsApi.js`:** `linkGoalActivityGroup(rootId, goalId, groupId)` with no
  `replace`. Update the comment.
- **Prefill** (your choice: the goal's groups first):
  - `utils/goalNodeModel.js`: `getGoalNodeActivityGroupId` becomes
    `getGoalNodeActivityGroupIds(goal) -> string[]`, read from `associated_activity_group_ids`.
  - `hooks/useSessionDetailUiState.js:51` and `prescriptions/PlanItemPicker.jsx:50` pass
    `initialGroup = { ids, goalName }` (null when `ids` is empty).
  - `activityBuilder/ActivityGroupField.jsx`:
    - `useActivityGroupChoice` prefills only when exactly one known ID exists, keeping the
      "From ⟨goal⟩'s activity group" note.
    - `ActivityGroupField` takes `scopeGroupIds` and `scopeGoalName`. With two or more, it renders
      `<optgroup label="From ⟨goal⟩">` with those groups (breadcrumb labels), then
      `<optgroup label="All groups">` with the rest. Only known groups are listed, and a deleted
      one is skipped as now.
  - `ActivityBuilderForm.jsx` and `activityBuilderUtils.js` take `initialGroup.ids` instead of `.id`.
- `goalDetail/ActivityGroupContainer.jsx`: no changes. The switch already adds and removes one
  group, and it is still hidden on subgroups of a linked group.

### 4. Docs

- `planning/ui-contracts-reference.md:358`: rewrite the one-group paragraph to say a goal links
  any number of groups, switches add or remove one group, and there are no confirmations. Also
  describe the prefill rule.
- After you approve this plan, save it as `planning/many-activity-groups-per-goal.md`.

## Tests

- **Backend** (`tests/integration/test_goal_activity_group_links.py`): rewrite the one-group
  tests as many-to-many tests:
  - Linking a second group adds it (201), and linking it again returns 200.
  - Unlinking one leaves the others in place.
  - The batch accepts several groups and sets exactly that list.
  - The group-side set never touches a goal's other groups.
  - Goal copy copies every group.
  - The serializer lists every live group and skips deleted ones.
  - The database now allows two live rows.
  - Concurrent links to different groups keep both.
  - Condition reconciliation still fires on each change.
  - The migration test: upgrade drops the index; downgrade aborts while a goal has several groups
    and succeeds after cleanup.
- **Frontend unit:**
  - `ActivityAssociator.test.jsx`: replace the "one activity group per goal" block. The switch on
    a second group saves `[A, B]` with no modal, switching off removes only that group, and the
    picker can hold several groups.
  - `activityPickerUtils` tests: drop the `single` case.
  - `GroupBuilderModal`: saving goals that have other groups needs no confirmation.
  - `ActivityBuilderGroupScope.test.jsx`: one group prefills; two show the "From ⟨goal⟩" optgroup
    with no prefill; zero leaves the field empty.
- **e2e** (`client/e2e/scoped-goal-groups.spec.js`):
  - A second link returns 201 and the goal has both groups.
  - With one group the builder still prefills.
  - Add a case where two groups show the optgroup.
  - Rebuild the client before running, because the e2e tests serve the built bundle.

## Verification

1. `alembic upgrade head`, `alembic check`, then a one-revision downgrade and re-upgrade (on a
   database with no goal holding several groups).
2. `pytest tests/integration/test_goal_activity_group_links.py` plus the full backend suite.
3. `cd client && npx vitest run && npm run lint`.
4. `npm run build`, then `npx playwright test e2e/scoped-goal-groups.spec.js`.
5. Manual check: in Goal detail → Activities, switch on two groups with no modal, then switch one
   off. Create an activity while scoped to that goal and confirm the "From ⟨goal⟩" optgroup. In
   the group editor, add a goal that already has another group and confirm there's no prompt.
