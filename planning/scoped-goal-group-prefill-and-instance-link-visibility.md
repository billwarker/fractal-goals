# Scoped-goal QoL: group prefill, one group per goal, one-off-linked activities, linked-goal icons

## Context

Session Detail lets you scope the activity picker to a goal (via its icon in the hierarchy) and link one activity instance to that goal (via the goal-icon button in the card header). This plan makes four changes:

1. **Group prefill.** When you create a new activity definition while a goal is scoped, the builder already fills in the goal association. It should also fill in the scoped goal's activity group.
2. **One group per goal.** Today a goal can link to any number of groups, so a prefill has no single right answer. A goal will be allowed only one active activity group. (Your local DB has 17 goals with group links, and none has more than one.)
3. **One-off-linked activities in the scoped picker.** The picker currently lists only definition/group/inherited associations (`resolve_effective_activity_entries`). It should also list definitions whose **instances** were linked to the scoped goal **or any of its descendants**, from any session.
4. **Linked-goal icons on the card.** An instance's one-off goal links show only while it is selected and scoped. Each linked goal's icon should always appear on the card's meta line.

Decisions you made: enforce one group; include all history plus child goals; icons on the meta line.

---

## Audit and grade of the current system (for this plan)

**Overall grade: B−.** The model is sound and the instance-link work (A+/S+ in `planning/scoped-goals-instance-associations-audit.md`) is high quality. The goal↔group link path is older and weaker:

| # | Finding | Evidence | Severity |
|---|---|---|---|
| A1 | No cardinality invariant: a goal may hold N groups, so "the goal's group" is undefined and no deterministic prefill is possible | `models/goal.py:74` composite PK only | High (blocks feature) |
| A2 | Four separate write paths for goal↔group links, each with its own rules: `link_goal_activity_group`, `set_goal_associations_batch` (`activity_association_service.py`), `set_activity_group_goals` (`activity_group_service.py:332`), goal duplication (`_goal_lifecycle.py:159`) | listed files | Medium |
| A3 | `link_goal_activity_group` does not filter `deleted_at` on goal, group or existing row. A soft-deleted link row reads as "already linked", and deleted goals/groups can be linked | `activity_association_service.py:309-324` | Medium |
| A4 | `Goal.associated_activity_groups` secondary has no `deleted_at` filters on the link or the group. The serializer (`associated_activity_group_ids`) and SMART "achievable" (`_serialize_common.py:42`) can count deleted groups | `models/goal.py:261`, `_serialize_goals.py:122` | Low–Medium |
| A5 | Changing definition/group links does not reconcile completion conditions. Instance links do (`activity_instance_goal_service.py:72`), so an activity-threshold goal can stay stale after a group link/unlink | association services | Medium (pre-existing) |
| A6 | Scoped picker ignores one-off links, so an activity you deliberately credited to a goal disappears from that goal's scoped picker next session | `useSessionDetailController.js:83-100` | Medium (UX) |
| A7 | One-off links are invisible unless the instance is selected *and* the goal scoped, so you can't see at a glance what a card credits | `SessionSection.jsx:352` | Low–Medium (UX) |
| A8 | `ActivityAssociator` new-group path calls `setActivityGroupGoals(root, newGroup, [goalId])` and then `onSave` with the full group list: two writes for one intent | `goalDetail/ActivityAssociator.jsx:327-345` | Low |

**What S+ requires:** one canonical write helper that enforces the invariant in the DB and in the service, with explicit conflict semantics. No silent data loss in the migration. Reads that respect soft deletes. Condition reconciliation on every evidence-changing write. A client that mirrors the invariant, so the UI never offers an impossible state. Offline-correct picker and icons. Boundary tests and index/contract docs updated.

---

## Plan

### 1. Backend: one active group per goal

**Migration** `migrations/versions/<new>_one_activity_group_per_goal.py` (down_revision `c9e1a3b5d7f2`, the current head):
- Preflight: `SELECT goal_id, count(*) … WHERE deleted_at IS NULL GROUP BY goal_id HAVING count(*) > 1`. If any rows come back, **abort** with a message listing the goal ids and pointing to the report script. Nothing is rewritten silently, per the "destructive schema work is explicit" invariant.
- Create the partial unique index `uq_goal_activity_group_associations_one_active` on `(goal_id) WHERE deleted_at IS NULL`. The downgrade drops it.
- Mirror the index in `models/goal.py` (`sa.Index(..., unique=True, postgresql_where=...)`) so the drift check passes.
- `scripts/report_multi_group_goals.py`: a read-only report (root, goal, groups, created_at) to run before deploy.

**Canonical helper** in new `services/goal_activity_group_links.py`, owning every goal↔group write:
- `set_goal_activity_group(db, root_id, goal_id, group_id | None, *, pending_events) -> AssociationDelta`
  - Locks the goal row (`with_for_update`).
  - Validates the live goal and live group in the root (fixes A3).
  - Reuses `reconcile_association_rows` with `{group_id}` or `set()`, so replacing a group is an atomic unlink plus link.
  - Appends `append_goal_association_event` for each change.
  - Calls `reconcile_activity_conditions` / `reconcile_goal` for the goal so conditions refresh in the same transaction (fixes A5 for groups).
  - Catches `IntegrityError` on the unique index from a concurrent writer and maps it to a 409.
- Callers rewritten onto the helper (fixes A2):
  - `link_goal_activity_group` (POST `…/goals/<g>/activity-groups/<grp>`): if the goal already has a *different* active group, return **409 `goal_activity_group_taken`** with `{current_group: {id, name}}`, unless the body/query has `replace: true`. Relinking the same group is idempotent (200).
  - `unlink_goal_activity_group`: via the helper (`None`).
  - `set_goal_associations_batch`: `group_ids` with more than one id → **422 `goal_activity_group_single`**. `GoalAssociationBatchSchema` gains `max_length=1` on `group_ids`, keeping the list shape for API compatibility.
  - `set_activity_group_goals` (group side, many goals): collect goals already holding another group. If any exist and `replace` is not true, return 409 `goal_activity_group_taken` with a `conflicts: [{goal_id, goal_name, current_group}]` list. With `replace`, move them.
  - `_goal_lifecycle.py` duplication: copy the single group through the helper.
- `ActivityGoalsSetSchema` / link route validators accept an optional `replace: bool`.

**Soft-delete-correct reads (A4).** Add `secondaryjoin` filters (link `deleted_at IS NULL`, `ActivityGroup.deleted_at IS NULL`) to `Goal.associated_activity_groups` and the back-populated `ActivityGroup.associated_goals`. Add the same link-row filter to `Goal.associated_activities` for parity. Check the query budgets in `tests/performance/test_power_account_budgets.py` stay flat. Serializer: add a canonical top-level `activity_group_id` (single id or null) and keep `attributes.associated_activity_group_ids` as a one-element list for compatibility. Per the "top-level is canonical" invariant, add `getGoalNodeActivityGroupId(goal)` in `client/src/utils/goalNodeModel.js`.

### 2. Backend: instance-linked definitions for a goal

New read `GET /api/<root>/goals/<goal_id>/instance-linked-activities` in `blueprints/activities_api.py`, served by `ActivityAssociationService.get_goal_instance_linked_activities`:
- One root-scoped SQL query. Reuse the recursive descendant CTE pattern from `services/instance_goal_evidence.py:load_instance_goal_ids` by extracting it as `goal_scope_cte(root_id, goal_ids)` and using it in both places.
- Join links → live instances (live session or sessionless) → live definitions. Group by definition and return `[{id, name, group_id, link_count, last_linked_at, linked_goal_ids}]`, ordered by `last_linked_at desc`.
- Bounded: definitions are a small catalog, but cap at 500 with `truncated: true` to honour the bounded-read invariant.
- Leave `GET …/goals/<id>/activities` unchanged. Per the index invariant, one-off links never join the reusable catalog, so the goal-detail associator never sees these.

### 3. Client: group prefill

- `hooks/useSessionDetailUiState.js` `handleOpenActivityBuilder`:
  - Add `builderInitialGroupId` state, set to `getGoalNodeActivityGroupId(scopedGoal)` when not editing, otherwise `''`.
  - Thread it through `useSessionDetailController` → `pages/SessionDetail.jsx` → `SessionDetailModals` → `ActivityBuilder` → `ActivityBuilderForm` as `initialGroupId`.
- `activityBuilder/activityBuilderUtils.js`:
  - `getBlankActivityBuilderState(initialSelectedGoalIds, initialGroupId)`.
  - For id-less seeds (copy/search drafts) use `editingActivity.group_id || initialGroupId`, so a copy keeps its own group, matching the existing "copies retain selections" contract.
  - Editing an existing definition never applies the prefill.
- `ActivityBuilderForm`: if `initialGroupId` is not in `activityGroups` (deleted, or groups not loaded yet), fall back to `''` once the groups load, so the Select never shows an invalid value. Show a small hint under the Select: "From <goal name>'s activity group". It disappears once the user changes the group.
- The Program Days `PlanItemPicker.jsx` builder already seeds the scoped goal, so seed its group the same way for consistency (same prop).

### 4. Client: single-group UI (mirror the invariant)

- `goalDetail/ActivityAssociator.jsx` / `ActivityGroupContainer.jsx`:
  - Group selection in the picker becomes single-select (`ActivitySearchWidget` `allowGroupSelection` with single mode).
  - If the goal already has a group, choosing another opens a confirm: "Replace <A> with <B>? Activities from <A> stop counting toward this goal." On confirm it sends `replace: true`.
  - Fix A8: the create-group path makes one write (create, then link via the helper) instead of two.
- Group-side goal editing (where `setActivityGroupGoals` is called): handle the 409 `conflicts` with a confirm listing the goals that will move, then retry with `replace: true`.
- Error copy maps `goal_activity_group_taken` / `goal_activity_group_single` to actionable messages through the existing notify path.

### 5. Client: one-off-linked activities in the scoped picker

- `utils/api/fractalActivitiesApi.js`: add `getGoalInstanceLinkedActivities`.
- `hooks/queryKeys.js`: add `goalInstanceLinkedActivities(rootId, goalId)` under a new root `goalInstanceLinksRoot(rootId)`.
- New hook `useGoalInstanceLinkedActivities(rootId, goalId)` in `hooks/useGoalQueries.js`.
- `useSessionDetailController.js` `activityGoalScope`:
  - `activityIds` becomes the union of the effective goal activities, the server instance-linked definitions, and **local** instances in `activityInstances` whose `associated_goal_ids` intersect the scoped goal plus its descendants. Descendants come from `flattenSessionGoalsViewGoals` / `findGoalNodeById`. The local part keeps the picker correct offline and before refetch.
  - Add `instanceLinkedIds: Set` so the picker can mark them.
  - Loading/error is combined across both queries. The instance-link query failing degrades to definition-only, not an empty picker.
- `utils/sessionActivityScope.js`: no change in filtering semantics (it already filters by `activityIds`). `filterCircuitsForGoalScope` picks up the union automatically.
- `ActivitySelectorPanel.jsx`: when `activityGoalScope.instanceLinkedIds` has an activity that is *not* otherwise associated, render a small "One-off link" chip through `renderActivityDetails`, with a tooltip: "Instances of this activity were linked to <goal> without linking the definition."
- `hooks/useActivityInstanceGoalAssociation.js` `invalidateInstanceGoalQueries`: add `goalInstanceLinksRoot(rootId)`. The outbox drain already invalidates the session queries, so also add this root to the INSTANCE_GOAL_LINK handler's post-sync invalidation in `offline/sessionOpHandlers.js`.

### 6. Client: linked-goal icons on the instance card

- New `components/sessionDetail/InstanceLinkedGoalIcons.jsx`:
  - Takes `goalIds` and resolves each via a `goalsById` map. Build the map once in the controller from the session goals view and fall back to the fractal tree (`useFractalTree`, already cached by the builder).
  - Renders a 12px `GoalIcon` per goal, using `getGoalIcon/getGoalColor/getGoalSecondaryColor` from `GoalLevelsContext` and the goal's `is_smart`.
  - Each icon is wrapped in the shared portalled `Tooltip`: "Linked to <goal> (this instance only)".
  - Not interactive. The group has `role="list"` and `aria-label="Linked goals"`, and each icon carries an accessible name.
  - Unknown or deleted goals are skipped.
- `SessionActivityItemView.jsx` meta line:
  - Append the icons after `groupLabel • Avg`, with the existing `activityMetaSeparator`.
  - The `activityMetaLine` render condition gains `|| linkedGoalIds.length`.
  - Always visible, independent of selection or scope.
  - The scoped header control (ring, toggle) is unchanged.
- `CircuitMemberHeader.jsx`: same component on circuit member meta lines.
- CSS in `SessionActivityItem.module.css`: an inline-flex group with a small gap. Icons don't shrink; past 4 goals show `+N`.

### 7. Docs

- `index.md` (Goals section and Session Detail one-off links paragraph): one active group per goal (index name, 409/422 codes, canonical helper), the instance-linked read and the picker union, and the always-visible meta-line icons.
- `planning/ui-contracts-reference.md#session-detail-one-off-goal-links`: picker chip, meta-line icons, group prefill.
- Save this plan as `planning/scoped-goal-group-prefill-and-instance-link-visibility.md` on approval.

---

## Critical files

Backend: `models/goal.py`, `models/activity.py`, new migration, new `services/goal_activity_group_links.py`, `services/activity_association_service.py`, `services/activity_group_service.py`, `services/_goal_lifecycle.py`, `services/instance_goal_evidence.py` (CTE extraction), `services/_serialize_goals.py`, `blueprints/activities_api.py`, `validators/goals.py`, `validators/activities.py`, `scripts/report_multi_group_goals.py`.

Client: `hooks/useSessionDetailUiState.js`, `hooks/useSessionDetailController.js`, `hooks/useGoalQueries.js`, `hooks/queryKeys.js`, `hooks/useActivityInstanceGoalAssociation.js`, `offline/sessionOpHandlers.js`, `utils/goalNodeModel.js`, `utils/api/fractalActivitiesApi.js`, `components/sessionDetail/{SessionDetailModals,SessionActivityItemView,InstanceLinkedGoalIcons}.jsx`, `components/circuits/CircuitMemberHeader.jsx`, `components/{ActivityBuilder,activityBuilder/ActivityBuilderForm,activityBuilder/activityBuilderUtils}`, `components/common/ActivitySelectorPanel.jsx`, `components/goalDetail/ActivityAssociator.jsx`, `components/programs/days/PlanItemPicker.jsx`.

## Verification

**Backend (PostgreSQL integration, `./run-tests.sh file …`)**
- Migration: upgrade/downgrade/re-upgrade and drift check. The preflight aborts on a seeded two-group goal and passes once it is fixed. The index rejects a second active row but allows a soft-deleted one.
- Helper boundary cases:
  - Link to a goal with no group, or the same group (idempotent).
  - A different group gives 409; with `replace` it moves atomically, with events for both.
  - Unlink, then unlink again gives 404.
  - Deleted goal or group gives 404.
  - A soft-deleted existing row is not "already linked".
  - Cross-root ids give 404.
  - Two concurrent links give one success and one 409.
- Batch: 0 or 1 group is OK; 2 groups give 422. Group-side set: the conflicts list without `replace`, and the move with it.
- Condition reconciliation: an activity-threshold goal completes or reverts when its group is linked, replaced or unlinked.
- Instance-linked read:
  - Direct link and descendant link are included. Ancestor-only and sibling links are excluded.
  - Soft-removed links, deleted instances, sessions and definitions are excluded.
  - Tenant isolation; `link_count`/`last_linked_at` are correct.
  - Constant query count as links grow. Add to `test_power_account_budgets.py`.
- Serializer: `activity_group_id` is set, and deleted groups are excluded from the SMART check.

**Frontend (Vitest)**
- `activityBuilderUtils`: blank create with a scoped group; a copy keeps its own group; editing ignores the prefill; an unknown group id falls back to blank.
- `useSessionDetailUiState`: the group is seeded only on create while scoped.
- Controller: the union covers effective, server instance-linked and local linked instances (child goal too). The instance-link query error degrades without emptying the picker.
- `ActivitySelectorPanel`: the one-off chip appears only for instance-only activities.
- `InstanceLinkedGoalIcons`: renders per goal, tooltip text, unknown ids skipped, `+N` overflow. The card shows the icons unselected and unscoped. Circuit members are covered.
- `ActivityAssociator`: single-select, replace confirm, 409 handling.
- Outbox: an offline link updates both the icons and the picker before sync.

**Gates:** `./run-tests.sh all`, `lint`, `typecheck`, `maintain`, the production build and `git diff --check`. Known pre-existing basedpyright/maintainability debt is reported as such, not as passing.

**Browser QA (desktop and mobile Playwright, plus a manual check with `/run`)**
1. Scope "Complete LoG's Guitar Extravaganza" → + Create New Activity Definition → the group shows "LoG's Guitar Extravaganza" with the hint, and the goal is pre-associated.
2. Link the "Intro – First Part of Main Melody" instance to Head Over Heels. The meta line shows the blue-square icon with or without selection. Start a new session, scope Head Over Heels, and the picker lists the activity with a "One-off link" chip. Scoping the parent goal also lists it.
3. In goal details, try to add a second group. The replace confirm appears, and after confirming, the old group's activities leave the scoped picker.
4. Check there is no horizontal overflow on mobile with 5 linked icons.

---

## Outcome — 2026-10-28

All four requests shipped on `feat/scoped-goal-group-prefill`, with audit findings A1–A8 addressed.

**Backend.** The migration `a7c9e1b3d5f7` adds the partial unique index and aborts with a goal list when any goal
holds several live groups. Nothing is rewritten silently. `scripts/report_multi_group_goals.py` is the read-only
preflight, and it exits 1 when conflicts exist. Local dev data: 17 goals have group links and none has more than one,
so the preflight passes there. The migration itself was exercised on disposable databases; `python app.py`
applies it to local dev on next start.

`services/goal_activity_group_links.py` is the single write path for link, unlink, batch, the group-side editor
(set, create and update) and goal copy. It locks the root and returns 409 `goal_activity_group_taken`, with
`current_group` or `conflicts`, unless `replace`. A batch naming two real groups returns 422
`goal_activity_group_single`; unknown ids are still ignored. A unique-index race maps to 409. Activity-threshold
goals and their ancestors reconcile in the same transaction (A5).

Relationships filter removed link rows and deleted groups (A4). Goal payloads add a top-level `activity_group_id`.
`GET …/goals/<id>/instance-linked-activities` uses one root-scoped query over the goal and its descendants
(the CTE is shared with `load_instance_goal_ids`). It is capped at 500 with `truncated`, and its query count stays
constant.

**Client.**
- Builder: the scoped goal's group is seeded through `ActivityGroupField` and `useActivityGroupChoice`, with the hint.
  This applies on Session Detail and Program Days.
- Picker: the scope is unioned with server and local one-off links, and one-off-only definitions carry the chip.
- Cards: `InstanceLinkedGoalIcons` shows the linked goals on the meta line of cards and circuit members.
- Goal detail: the group picker is single-select (`toggleGroupSelection`). Replacing a group asks first, and a
  declined replacement does not link the new group's activities.
- Group editor: a conflict opens a "move goals?" confirm, or saves only the free goals.
- `InstanceGoalLinkControl` no longer claims a definition link for one-off-only definitions.
- The offline link handler and the online mutation both invalidate `goalInstanceLinksRoot`.

**Deviations from the plan.**
- The goal↔group routes moved to `blueprints/goal_activity_groups_api.py`, a nested blueprint. This keeps
  `activities_api.py` under its maintainability cap, and `error_body` is now shared in `api_utils`.
- The batch schema has no `max_length`; the service's coded 422 replaces it, so invalid ids keep being ignored.
- Group create and update accept `replace_goal_groups`; the dedicated goals endpoint accepts `replace`.

## Verification

| Check | Result |
|---|---|
| New backend integration tests (`tests/integration/test_goal_activity_group_links.py`) | 18 passed |
| Migration round trip (upgrade, check, downgrade, upgrade, check) on a disposable database | Passed, no drift |
| Full backend suite | 1,846 passed, 5 failed |
| Full frontend suite | 414 files / 2,204 tests passed |
| Desktop and mobile Playwright (`e2e/scoped-goal-groups.spec.js` plus the existing instance-association spec) | 4 passed; screenshots reviewed |
| ESLint (zero warnings), frontend and backend maintainability, responsive audit, TypeScript, basedpyright ratchet, production build, bundle budgets, `git diff --check` | Passed |

The new tests cover:
- idempotency, conflict and replace, unlink;
- deleted, foreign and soft-deleted rows;
- batch 0, 1 and 2 groups;
- group-side conflicts and moves, and update payloads;
- copy and the serializer;
- the database index and a concurrent race;
- condition reconciliation;
- the instance-linked read: descendant, ancestor and sibling scope, exclusions, tenant isolation, the bound,
  constant queries;
- the migration preflight.

Of the five backend failures, three also fail on clean `main`, reproduced in a worktree:
- the offline serializer contract (note shape);
- the stale agent proposal schema artifact (the generated schema is byte-identical between `main` and this branch);
- the storage migration test (`goal_attachments` FK).

The other two are a history-scaling timing test, which passes when run alone, and the backend size cap on
`activities_api.py`, which the blueprint extraction then fixed.

## Grade

The feature is **S** for this scope. The invariant is enforced at the database, the service and the UI. Every write
path shares one helper. Migration and failure modes are explicit, and coverage spans unit, integration, browser and
performance tests. The repository is not S+ yet: the three pre-existing backend failures above need their own fixes.
