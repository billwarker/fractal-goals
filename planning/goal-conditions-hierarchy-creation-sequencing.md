# Goal Conditions, Hierarchy Creation, Sequencing & Level Reviews — S+ Plan

## Context

Goal creation is scattered and completion is split between two ideas, goals and targets, that users see as the same thing. This plan:

1. Makes **the goal itself the target**: a goal has exactly one completion condition, and manual completion is always available.
2. Lets you **create goals from the hierarchy** in the Program calendar, Days and Session Detail sidebars. The hierarchies and the goal flow tree update immediately.
3. Puts **due dates on the Program calendar page**: due chips in its Goals pane, "Due:" badges in cells, and drag from the sidebar to a cell on desktop.
4. Turns **analytics charts into a goal-setting surface**.
5. Adds **ordered sequences of sibling goals**, built on the existing pause and resume, so progress reads as a journey.
6. Gives **levels real character** through time horizons, a success vision, and periodic reviews held in Notes.


---

## Grade of the current system: **C−**

| Area | Grade | Evidence |
|---|---|---|
| Hierarchy goal creation | C | Session Detail has a "+" per row (`client/src/components/goals/GoalHierarchyList.jsx:290`), but Immediate goals reroute it to *add target*. The Program calendar and Days panes render `ProgramSidebar` read-only (`client/src/components/programs/ProgramSidePane.jsx:187`). There's no single scope-then-add interaction. |
| Due dates / calendar | D | No due indicator in the Program calendar Goals pane, no drag to cells, no due badges in the calendar feed. |
| Completion model | C+ | A capable engine, but there are three overlapping completion switches (`services/goal_domain_rules.py:19,42,47`) on goal *and* level. Goals have N `Target` rows (`models/goal.py:256`) with their own windows and a stored ledger, which duplicates goal semantics. `TargetMetricCondition.target_value` is an **Integer**, so fractional thresholds are truncated. A legacy `goals.targets` JSON column lingers. |
| Analytics → goals | F | Not present. Charts only have drag-rectangle annotation (`client/src/components/analytics/AnnotationLayer.jsx`). |
| Level characteristics | C− | `GoalLevel` has deadline ranges, a default offset and similar, but they barely shape the UX. There's no review concept. The relevance statement applies regardless of level. "Convert Level" exists (`services/goal_workflow_service.py` `convert_goal_level`) but isn't reflected in level-specific fields. |
| Sequencing | F | Only `goals.sort_order` exists. Pause and resume (`toggle_pause`, `GoalPauseInterval`) already exclude evidence and block completion, which is the right foundation, but nothing uses it for progression. |
| Notes integration | C | `note_kind` only accepts `goal_completion` (`validators/notes.py:25`), and it's an implicit flag, not a first-class note type in the Notes UI. |
| Foundations | A− | Service-owned mutations, the canonical evidence projection (`services/instance_goal_evidence.py`), pause-interval exclusion, `row_version`, query-key roots, and the agent proposal pipeline are all reusable as-is. |

**What S+ means here:** one completion concept; reuse existing primitives (pause intervals, Convert Level, Move, note kinds) instead of adding parallel ones; derived state wherever possible (no stored ledgers); every write goes through services, the agent and offline replay; numeric precision is correct; the migration is previewed, rehearsed against a backup, and the destructive step is separate; the same interaction works on desktop and mobile; every behaviour has neighbouring boundary tests; and every new behaviour fits the Goal Detail modal's existing settings.

---

## Decisions captured from you

**Hierarchy and creation**
- One unified interaction on desktop and mobile: **scope to a goal by clicking its icon → a "+" appears after the goal name → it opens the full `GoalDetailModal` to create a child.**
  - No hover affordance, no inline create, no ghost rows, no action bars.
- Children only. A sibling is added by its parent adding another child.
- The new goal may be any lower level (skipping levels is allowed). Completed and paused goals can't get new children.
- Completed goals are hidden by default.
- The Program calendar pane shows program scope only, and goals created there join program focus.
- In Session Detail with an activity instance selected, the modal opens pre-scoped to an activity-threshold condition on that activity, pre-filled from the instance.
- After creating, **every visible hierarchy and the goal flow tree update automatically**. The new goal is highlighted and the current scope is kept.

**Due dates (Program calendar page only)**
- An adaptive due chip on the **left-hand side** of each goal in the Program calendar page's Goals pane: relative under 30 days, absolute after that. Amber within 7 days, red when overdue. Nothing shown when there's no date.
  - Not shown in the Days pane, Session Detail or the Goals page.
- Calendar cells show a badge: **"Due: [goal icon] [goal name]"**. The badges aren't draggable.
- On **desktop**, drag a goal from the Goals pane onto a cell to set its due date.
  - Breaking a rule warns but still allows the change: outside the program, outside the level's horizon, or after the parent's due date.
  - Undo toast after the drop.
- **No calendar due-date setting on mobile.** Due dates are edited in the goal modal.

**Conditions**
- Exactly one per goal, chosen manually: activity threshold, children, or manual.
- **Manual override is always available on every goal.** It's recorded as `manual_override` unless the condition is `manual`.
- Activity threshold kinds:
  - **Single session**: N sets each meeting every metric rule, *or* total yield (weight × reps) in one instance.
  - **Cumulative**: a total over the active period.
  - **Consistency**: N qualifying instances in the active period.
- Rules can combine several metrics.
- The active period runs from `started_at` (defaults to creation, editable) to the due date, **excluding pause intervals**. Old target windows are ignored.
- Conditions stay editable; if the new one is already met, you're prompted to complete.
- Deleting the evidence that completed a goal auto-uncompletes it.
- Parent progress is the fraction of children completed.

**Targets**
- Removed completely: convert, back up, then drop.
- Goals with several targets split into child goals. For Immediate goals, the extras become ordered siblings in a sequence track.
- Clean break for the agent, MCP and landing.

**Analytics**
- Metric Trends, Scatter, Metric Progress and Activity Totals.
- Right-click or long-press opens a "Set goal here…" menu.
- Y sets the value; a future X sets the due date. On Scatter, X and Y become two metric rules.
- The operator is inferred, the parent comes from the filter scope, and the full modal opens.
- Existing goals are drawn as reference lines.

**Levels**
- Five fixed levels. Rules are soft guidance.
- Promotion and demotion use the existing **Convert Level** option.
- Time horizons drive due-date defaults and warnings.
- **Ultimate, Long and Mid** use a relevance statement, a *Success vision* (relabelled description) and periodic reviews. **Short and Immediate** don't.
- In the Goal Detail modal, the **review cadence is shown next to the Success vision**, e.g. "Review every 3 months · next Jan 12". It's editable inline in edit mode.

**Notes and reviews**
- Explicit first-class note types: **`goal_review`** and **`goal_completion`**.
- Review cadence defaults by level: Ultimate yearly, Long quarterly, Mid monthly. Editable per level and per goal.
- A review is a `goal_review` note pre-filled with the vision, progress since the last review and due-date status. Saving it resets the cadence.
- "Review due" shows in the Goal Detail header and as calendar badges (program lineage scope only).
- Reviews can be deferred to the next period or disabled.

**Sequencing (built on pause)**
- A chosen subset of same-level siblings forms a track; a parent can have multiple tracks.
- Goals later in a sequence are **paused**, using the existing pause, until the goal before them completes. Pause already excludes evidence and blocks completion.
- The goal completion view has a **"Begin next goal in sequence: X"** checkbox, checked by default. Beginning means resuming.
- No separate "Start goal" action. Users activate or deactivate goals through the Goal Detail modal's existing **Pause / Resume** setting.
- The goal *un-completion* view mirrors this with a checkbox: "Pause next goal in sequence: X again".
- Due dates are fixed only.
- When a track ends, the parent's own condition decides whether it completes.
- **Display:** the sequence order number sits to the left of the goal name in hierarchy lists. Future goals show in the existing paused style. On the **goal flow tree**, sequenced goals are connected by **dashed arrows** in order.

**Rollout**
- Phased. Every goal gets an editable `started_at`.

---

## Data model

**Migration A (additive)**, in `models/goal.py` and `models/common.py`:

- **`Goal`** adds:
  - `completion_condition` (`'activity_threshold' | 'children' | 'manual'`, NOT NULL, CHECK).
  - `started_at` (NOT NULL, backfilled from `created_at`).
  - `review_cadence_value` / `review_cadence_unit` (nullable, overrides the level).
  - `review_disabled` (bool).
  - `review_deferred_until` (nullable).
  - `sequence_track_id` (FK, nullable) and `sequence_position` (int, nullable). A unique partial index on (`sequence_track_id`, `sequence_position`) where the goal isn't deleted.
- **`completion_source`** gets a CHECK over `condition | children | manual | manual_override`.
- **New `GoalCompletionCondition`** (`goal_completion_conditions`): one per goal (unique `goal_id`).
  - Fields: `root_id`, `activity_definition_id` (NOT NULL), `kind` (`single_session | cumulative | consistency`), `measure` (`sets | yield`), `min_sets` (default 1), `required_count` (consistency), `cumulative_metric_definition_id` (cumulative), timestamps, `deleted_at`.
  - CHECK constraints per kind.
- **New `GoalConditionMetricRule`**: `condition_id`, `metric_definition_id` (RESTRICT), `operator` (CHECK in `>= > <= < ==`), `value` **Numeric(14,4)**.
- **New `GoalSequenceTrack`**: `id`, `root_id`, `parent_goal_id`, `level_id`, timestamps, `deleted_at`.
- **`GoalPauseInterval`** adds:
  - `reason` (`'manual' | 'sequence'`, default `'manual'`), so the UI can say "Paused · waiting on *X*".
  - `resumed_by_goal_id` (nullable FK), set when a completion activates the next goal. Un-completion uses it to re-pause exactly.
- **`GoalLevel`** adds:
  - `review_cadence_value` / `review_cadence_unit`.
  - `uses_success_vision` (bool; seeded true for Ultimate, Long and Mid).
- **`Note.note_kind`** becomes an explicit enum (`goal_completion | goal_review`) with a CHECK constraint. `validators/notes.py:25` widens accordingly.

**Migration B (destructive, separate revision, after a backup per `docs/architecture/MIGRATION_POLICY.md`)** drops:

- the tables `targets`, `target_metric_conditions`, `target_contribution_ledgers` and `target_templates`;
- the goal columns `goals.targets` (JSON), `goals.completed_via_children` and `goals.allow_manual_completion`;
- the level columns `goal_levels.can_have_targets`, `auto_complete_when_children_done` and `allow_manual_completion`.

---

## Phases

### Phase 1 — Completion conditions (foundation)

**Backend**
- New `services/goal_condition_service.py`: CRUD with tenant checks and `row_version`. Validates that metrics belong to the activity, and that rule shape matches the kind.
- New `services/goal_condition_evaluator.py`. It is pure, takes evidence from `instance_goal_evidence.py`, and gates it by `[started_at, deadline]` minus pause intervals. Reuse `services/goal_contribution.goal_was_paused_at`. It covers:
  - *single_session / sets*: some instance has ≥ `min_sets` sets where every rule holds.
  - *single_session / yield*: the instance's total yield meets the rule. Reuse `services/_progress_aggregation.py`.
  - *cumulative*: sum the metric over qualifying instances in the window.
  - *consistency*: count instances meeting the rules in the window.

  It returns `{met, progress, current, required, achieving_instance_id}`. **There is no stored ledger.**
- Replace `_completion_targets.py` and `instance_goal_target_reconciliation.py` with `_completion_conditions.py` and `instance_goal_condition_reconciliation.py`. They keep the same hooks and post-commit events. Auto-uncompletion applies only when `completion_source == 'condition'`.
- Collapse `goal_domain_rules.py` into a single `completion_mode(goal)`. Manual completion is always permitted; there's no allow-manual flag.
- Edit condition: on save, re-evaluate. If the new condition is already met, return `condition_met_pending_confirmation` and the client prompts.
- **Conversion** `scripts/migrate_targets_to_conditions.py` (`--dry-run` by default, JSON and Markdown report per fractal), also wired into migration A's data step:
  - **0 targets** → `children` if `completed_via_children` or the level auto-completes, otherwise `manual`.
  - **1 target** → a condition with this mapping: threshold → single_session/sets with `min_sets=1`; sum → cumulative; frequency → consistency.
  - **N > 1 targets** → the goal becomes `children` and each target becomes a child goal at the next lower level. For **Immediate** goals, the first target stays on the goal and the rest become same-level siblings in a new track. Later steps are paused with reason `sequence`.
  - **Windows**: target windows and block links are ignored. The report lists every goal whose completion state would change.
- Remove `goal_target_service.py`, `goal_target_helpers.py`, `goal_target_rules.py` and the target routes and validators. Add `/api/<root>/goals/<id>/condition` (GET/PUT/DELETE).
- Serializers (`_serialize_goals.py`, `_landing_public_tree.py`) emit `completion_condition`, `condition` and a derived `condition_progress`.
- Agent and MCP clean break: bump `services/agent_operation_versions.py` and replace target operations with `goal.set_condition` in services, proposal previews and `agent_adapter`.

**Frontend**
- New `components/goalDetail/CompletionConditionEditor.jsx`: a three-way segmented control, kind/measure/sets/rule editors, and a sentence preview. It replaces `TargetManager` inside `GoalDetailModal` / `GoalEditForm`. The "Start date" field sits next to the due date.
- `GoalCompletionModal` and `GoalUncompletionModal`:
  - Replace their target lists with a condition summary and the completion source.
  - Show "Complete manually (override)" whenever the condition isn't met.
- A `ConditionProgress` component replaces `TargetsSection` in Session Detail.
- Delete:
  - `TargetCard`, `AddTargetModal`, `TargetManager`, `TargetAnalyticsModal` and its chart options;
  - `TargetsSection`, `useTargetQueries`, `useTargetAchievements`, `targetUtils`;
  - the landing target manager files;
  - the Immediate-goal "+" special case at `GoalHierarchyList.jsx:295`.
- New `goalCondition` query key root. Condition writes invalidate goals, goalTimeline and goalAnalytics.
- Offline: replayed instance writes trigger condition reconciliation exactly as targets did. Add a replay test.

### Phase 2 — Hierarchy creation from sidebars

- Extract `components/goals/GoalTreeComposer.jsx` over `GoalHierarchyList`. It has **one interaction for every device**:
  - Clicking the goal **icon** scopes it. Reuse `GoalHierarchyIconAction`.
  - A scoped goal (not completed, not paused) shows a **"+" right after its name**.
  - "+" opens `GoalDetailModal` in create mode with `parentGoal` and a level picker of every rank below the parent. The default is the next level.
  - Optional slots: `renderLeading` (the due chip on the Program calendar page, sequence numbers everywhere) and a toggle to hide completed goals (default on).
- **Auto-update:**
  - Create, edit, complete and delete mutations go through one `useGoalTreeMutations` hook.
  - It optimistically inserts the new node into every cached tree that contains the parent: the fractal tree, session goals view, program goal seeds and flow-tree source.
  - It then invalidates the shared goal-tree roots (`queryKeys.goals`, `sessionGoalsView`, program focus/seeds, flow tree).
  - The flow tree recomputes its layout from the updated topology (`useFlowTreeGraph` already memoizes by topology).
  - The new row flashes (`data-just-created`) and scrolls into view, and the scope is unchanged.
- **Program calendar and Days Goals panes:** `ProgramSidebar` renders through the composer. The create request carries a `program_id` context, and the service adds the goal to program focus in the same transaction when its parent is in `services/program_focus.py` scope.
- **Session Detail:** `SessionGoalHierarchyPanel` uses the composer. With an activity instance selected, the modal opens with an activity-threshold condition (single_session) pre-filled by `utils/conditionPrefill.js` (pure, unit-tested) from that instance.

### Phase 3 — Due dates on the Program calendar page

- `components/goals/GoalDueChip.jsx`, passed through `renderLeading` **only by the Program calendar page's Goals pane**.
  - Formatting lives in `utils/goalDueFormat.js` (pure, user timezone).
  - States: amber within 7 days, red when overdue. Nothing is rendered when there's no deadline.
- Calendar feed **schema v2** (`ProgramCalendarFeedService`) adds `goal_due_badges[]` (goal id, name, level, deadline) and `review_badges[]` (Phase 6). Both cover goals in program lineage scope in the ≤ 62-day window. The ETag includes goal revisions.
- `programCalendarCellDecorations.js` renders a static **"Due: [icon] [name]"** badge per goal, capped at 2 with a "+N" popover. Clicking a badge opens the goal modal.
- **Desktop drag:**
  - Goals pane rows become FullCalendar external draggables (`Draggable` from `@fullcalendar/interaction`, already loaded at `ProgramCalendarView.jsx:4`). This is enabled only on non-touch viewports.
  - The drop calls `PATCH goal {deadline}` and shows an undo toast.
  - Warnings come from a shared `services/goal_deadline_rules.py`, mirrored in `utils/goalDeadlineRules.js` with shared fixtures `tests/fixtures/goal_deadline_cases.json`.
  - Goal drags are identified by `data-goal-id`, so they never trigger `useCalendarDragSelection`.
- **Mobile:** no drag and no set-due mode. Due dates are edited in the goal modal.

### Phase 4 — Sequencing (built on pause)

- `services/goal_sequence_service.py`:
  - Create a track from selected same-level siblings; add, remove and reorder steps (positions rewritten under the parent row lock).
  - Validation: siblings only, same `level_id`, one track per goal.
- **Joining or reordering:**
  - The first incomplete step stays unpaused.
  - Every later incomplete step is paused through `GoalWorkflowService.toggle_pause` with `reason='sequence'`. Paused goals already block completion and exclude evidence.
- **Activation on completion:**
  - The complete request accepts `begin_next: bool` (default true).
  - In the completion transaction (`services/completion_handlers.py`), the next step is resumed and the closed interval gets `resumed_by_goal_id = <completed goal>`.
  - Auto-completion from a condition uses the default. Its toast offers **Undo** (re-pause).
- **Un-completion:**
  - If the next step's last pause interval was closed with `resumed_by_goal_id == this goal`, the API exposes `next_goal_activated_by_this`.
  - The un-completion view shows a checkbox "Pause next goal in sequence: X again" (default checked). If checked, it re-pauses with `reason='sequence'`.
- **Fit with the Goal Detail modal's existing settings** (`GoalOptionsView.jsx`):
  - **Pause / Resume** is the only activate/deactivate control, and there is no "Start goal" action. Manually resuming a later step activates it out of order, which is allowed and noted in the header. Pausing the active step doesn't touch the others.
  - **Move Goal:** moving a goal to another parent removes it from its track. If it was paused only for the sequence, it's resumed; the remaining steps renumber, and the new first step resumes if it was paused for the sequence.
  - **Convert Level:** the existing `convert_goal_level` rank checks stay. A level change removes the goal from its track, with the same cleanup as Move.
  - **Copy Goal:** the copy never joins a track and starts unpaused.
  - **Delete Goal:** the confirmation includes "Begin next goal in sequence: X" (default checked) when the deleted goal is the track's active step.
  - **Completion / un-completion views:** these carry the checkboxes above, in the same layout as the existing program and child summaries.
  - **Edit form:** a "Sequence" section to create or join a track and reorder it with up/down buttons.
- **Display:**
  - **Hierarchy lists:** the sequence order number goes to the left of the name through `renderLeading`. Paused-for-sequence goals use the existing paused style with the tooltip "Paused · waiting on *X*".
  - **Goal flow tree:** `flowTreeGraphUtils.js` adds `sequence` edges (dashed `strokeDasharray`, arrow `markerEnd`) between consecutive steps. They're **excluded from the layout input** in `useFlowTreeGraph.js`. Siblings in a track are ordered by `sequence_position`.

### Phase 5 — Goals from analytics

- A shared `components/analytics/ChartGoalContextMenu.jsx`, positioned by the anchored-overlay positioner. It opens on `contextmenu` (desktop) or a 500 ms long-press (touch) via `ChartJSWrapper`. Drag stays with annotations.
- Mapping (pure `utils/chartGoalPrefill.js`, unit-tested per chart):
  - **Metric Trends / Metric Progress**: Y gives a single_session rule. The operator is inferred from the metric's direction.
  - **Scatter**: two rules, one for X and one for Y.
  - **Activity Totals**: a cumulative condition.
  - A future X sets the deadline, with a 30-day future pad on time axes.
- "Set goal here…" opens `GoalDetailModal` pre-filled, with the parent pre-selected from the analytics goal filter scope.
- Reference lines: a `goalConditionLines` Chart.js plugin, fed by a bounded `GET /api/<root>/goals/conditions?activity_id=`.

### Phase 6 — Level horizons, success vision, notes and reviews

- **Horizons:** the level's `default_deadline_offset` pre-fills due dates, and `deadline_min/max` feed the Phase 3 warnings. `GoalCharacteristicsSettings` gains review cadence and `uses_success_vision`.
- **Success vision:** levels with `uses_success_vision` show the description as "Success vision" with the **review cadence beside it** ("Review every 3 months · next Jan 12", showing "Deferred" or "Reviews off" when that applies). In edit mode, the cadence value and unit are editable inline there, with a "Use level default" reset. These levels also show the relevance statement. Other levels hide the relevance statement (data kept) and SMART validation skips it. Convert Level re-applies these field rules automatically.
- **Explicit note types:**
  - `note_kind` enum `goal_completion | goal_review` in the validator, service and DB CHECK.
  - Notes page filter chips and `NoteCard` badges for both types.
  - The existing completion-note path in `GoalDetailModal` / `useGoalNotes` writes `goal_completion` explicitly.
- **Reviews:**
  - `services/goal_review_service.py` computes `next_review_at` from the last `goal_review` note (or `started_at`) plus the cadence, honouring `review_disabled` and `review_deferred_until`. Pure date logic shares fixtures with the client.
  - The Goal Detail header shows a "Review due" banner with **Review** (opens a `goal_review` note pre-filled with the vision, progress since the last review, children completed and due status), **Defer to next period** and **Disable reviews**.
  - Calendar `review_badges[]` are limited to the program's lineage scope.

---

## Critical files

- **Backend:** `models/goal.py`, `models/common.py`, a new migration pair, `services/goal_domain_rules.py`, `services/completion_handlers.py`, `services/_completion_targets.py` → `_completion_conditions.py`, `services/goal_workflow_service.py` (pause/move/convert hooks), `services/instance_goal_evidence.py` and `goal_contribution.py` (reused), `services/_serialize_goals.py`, `_landing_public_tree.py`, `services/program_focus.py`, the program calendar feed service (v2), `services/note_service.py`, `validators/notes.py`, `validators/goals.py`, `services/agent_operation_versions.py`, `blueprints/goals_api.py`.
- **Frontend:** `components/goals/GoalHierarchyList.jsx`, `GoalOptionsView.jsx`, `GoalCompletionModal.jsx`, `GoalUncompletionModal.jsx`, the new `GoalTreeComposer.jsx` / `GoalDueChip.jsx`, `components/GoalDetailModal.jsx`, `components/goalDetail/*`, `components/programs/ProgramSidebar.jsx`, `ProgramSidePane.jsx`, `ProgramCalendarView.jsx`, `programCalendarCellDecorations.js`, `components/sessionDetail/SessionGoalHierarchyPanel.jsx`, `components/flowTree/flowTreeGraphUtils.js` and `useFlowTreeGraph.js`, `components/analytics/ChartJSWrapper.jsx` plus the four visualizations, `GoalCharacteristicsSettings.jsx`, `components/notes/NoteCard.jsx`, `hooks/useGoalNotes.js`, `utils/queryKeys`.
- **Docs:** `index.md` (Goals and targets → Goals and conditions), `planning/ui-contracts-reference.md` (composer, due chip and badge, chart menu, sequence display).

## Verification

- **Backend:**
  - Evaluator boundaries: exactly `min_sets` and one fewer, equal operator, Numeric fractions, evidence at `started_at` and one second before, inside and outside pause intervals, yield vs sets.
  - Conversion fixtures: 0, 1 and N targets; Immediate with N targets; target windows ignored. Assert that the report matches.
  - Sequencing:
    - Joining a track pauses later steps with `reason='sequence'`.
    - `begin_next` true and false.
    - Un-completion re-pauses only when `resumed_by_goal_id` matches.
    - Manual resume out of order.
    - Move, Convert Level and Delete each clean up the track.
  - Manual override is allowed for every condition.
  - Deadline-rule fixtures shared with the client.
  - Review cadence, defer and disable.
  - The `note_kind` enum.
  - Feed v2 bounds, ETag and lineage scope.
  - Agent `goal.set_condition`.
  - Offline replay reconciliation.
- **Performance:** extend `tests/performance/test_power_account_budgets.py` with condition progress for 500 goals and the feed with badges.
- **Frontend (Vitest):**
  - Composer: scope → "+" after the name; no "+" on completed or paused goals; no hover affordance.
  - Optimistic tree insert and invalidation across trees.
  - Due chip only on the Program calendar page, and due format.
  - Drag disabled on touch.
  - Condition editor and prefill.
  - Chart menu mapping.
  - Completion and un-completion checkboxes.
  - Flow tree sequence edges are dashed and excluded from layout, with a snapshot showing node positions don't change.
- **Browser (`./run-tests.sh browser`, desktop and mobile):**
  - Scope → "+" → create in the Program pane: the goal joins focus and the tree and flow tree update.
  - Desktop drag to a cell, then undo; the "Due:" badge appears.
  - Right-click a trend point → goal → reference line.
  - Complete a sequenced goal → the next one resumes; un-complete → it's re-paused.
  - Review banner → `goal_review` note → cadence reset.
- **Migration rehearsal:**
  - Run the dry-run report on a backup copy.
  - Apply A, then `./run-tests.sh restore-drill`.
  - Apply B only after sign-off.
  - `./run-tests.sh lint` and `maintain` are green.

## Delivery notes

### Phase 1 (2026-10-19)
- Migration A (`e1a2c3d4f5b6`) was applied to the local database after a dry run and a backup (`backups/pre-conditions/fractal_goals_20261019.dump`). It produced 16 conditions and 1 sequence track. 7 rule-less targets were left manual with warnings. `--verify` reports 0 drift.
- Migration B: see "Migration B" below.

### Phase 2 (2026-10-19)
- **No `GoalTreeComposer` wrapper.** The scoped "+" lives in `GoalHierarchyList` behind `onStartSubGoalCreation`, since all three surfaces already render that list and two already scope through goal icons.
- **No `program_id` create context.** Program focus already includes live descendants of the program's goals (`services/program_focus.py`), so a child created in the program pane is in focus without extra writes.
- **Tree updates come from the server's response, not before it.** `applyCreatedGoal` inserts the server's goal into the cached trees and then refetches, which avoids temporary ids.
- **Visibility.** Session and plan hierarchies show only goals their scope or activities reach. So a goal created there without a selected activity joins the session's goals (Session Detail), or stays in the pane for the visit (Days).
- **Completed goals** are hidden by default in the Program calendar Goals pane only. Session Detail already defaults to hiding them in its scope modal.
- **Fixes found along the way:**
  - Program-page goal creation dropped activities attached in the modal and swallowed errors.
  - The goal modal lacked dialog semantics.
  - The goal form's Name and Description labels weren't linked to their inputs.

### Phase 3 (2026-10-19)
- **No calendar feed v2.** The page already loads every goal (the fractal tree) and draws deadline events from it. The badges keep that source, so they update with every goal mutation, with no ETag or feed change. "+N more" overflow comes from FullCalendar's existing `dayMaxEvents`.
- **Server rules are now soft.** The create and update paths no longer reject a child due after its parent, and no longer clamp children when a parent moves earlier. A drag's Undo then restores exactly one change. Responses include `deadline_warnings`. The program-date check runs on the client only, because a goal update has no program context. The unused `programs/<id>/goal-deadlines` endpoint keeps its program-range rule.
- **Fixes found along the way:**
  - The Program page's goal updates didn't refresh the fractal tree, so due badges lagged behind deadline edits.
  - The goal edit form's deadline field hard-capped dates at the parent's due date.

### Phase 4 (2026-10-19)
- **Sequence editing lives in Options → Sequence, not the edit form.** Its changes apply at once, like Pause, Move and Convert, so a Save/Cancel form would mislead.
- **Delete confirmation moved into Options → Delete for every page.** The Goals page's typed modal and the Program page's `window.confirm` are gone, which fixes Sessions-page deletes (they sent the goal object as its id and never confirmed).
- **Sequence arrows show in the flow tree's tree layout only.** The hierarchy layout shows step numbers instead.
- **Agent and MCP operations for sequences are not added yet.** Sequences are managed in the app.
- **Fixes found along the way:**
  - Migration `f3c4d5e6a7b8` relaxes `ck_goals_sequence_pair` to "a track id needs a position", because the track FK's ON DELETE SET NULL left positions behind and blocked cascading deletes.

### Migration B (2026-10-19)
- **Rollout decision:** signed off by the owner on 2026-10-19 ("confirmed, just make sure we've got backups").
- **Revision `a4b5c6d7e8f9`** (destructive contract) drops the tables `targets`, `target_metric_conditions`, `target_contribution_ledgers` and `target_templates`, the `goals` columns `targets`, `completed_via_children` and `allow_manual_completion`, and the `goal_levels` columns `can_have_targets`, `auto_complete_when_children_done` and `allow_manual_completion`. Every drop uses IF EXISTS. The downgrade recreates the schema empty; the rows come back only from a backup.
- **Backups (local, git-ignored):**
  - `backups/pre-migration-b/fractal_goals_20261019_pre_b.dump`, taken before the revision existed. It was restored into a scratch database: 31 targets, 14 ledger rows, and the same 119 goals and 16 conditions as the live database.
  - `backups/pre-migration-b/fractal_goals_20261019_post_b.dump`, taken after.
  - `backups/pre-conditions/fractal_goals_20261019.dump`, from before migration A.
- **Discarded locally:** 31 targets and 14 ledger rows, all converted by migration A. `--verify` still reports 0 drift afterwards.
- **Checks:**
  - The verification query in the revision's docstring returns no rows on the local database.
  - A fresh zero-to-head upgrade, `alembic check` (clean on fresh and local databases), and a one-revision downgrade and re-upgrade all pass.
  - `./run-tests.sh restore-drill` passes.
  - The full backend suite passes, apart from one analytics timing test that is over budget under full-suite load and passes on its own.
- **Fixes found along the way:**
  - The models now declare the server defaults their migrations set (`goal_condition_metric_rules.position`, `idempotency_records.status` and `created_at`), so `alembic check` is clean.
  - The test database reset (from Phase 1) dropped `alembic_version`, which broke the restore drill. It now keeps that table.
- **The conversion script** (`scripts/migrate_targets_to_conditions.py`) now reports that targets are retired. Previewing a conversion again needs a pre-B backup restored.

### Open items after the audit (2026-10-19)
- **Undo after an automatic begin.** When a condition completes a sequenced step, Session Detail shows a toast ("X is complete, so Y has begun.") with Undo. `useSequenceAdvanceUndo` watches the session's goal tree across refetches, so only completions seen happening count, then asks `GET /goals/<id>/sequence` which step began. Undo calls `POST /goals/<id>/sequence-hold`, which re-pauses that step as waiting; the predecessor stays complete. The server only allows this for a step its predecessor's completion began; anything else gets a 409. Goals serialize `sequence_begun_by` for that state.
- **Agent sequences.** The new `set_goal_sequence` proposal operation (scope `goals:write`, not reversible) takes sibling goal IDs in order, including `$ref`s to goals created earlier in the proposal. It replaces the sequence those goals are in, or creates one; one already-sequenced goal ends its sequence. It runs through `GoalSequenceService.sequence_goals`, which gains a non-committing mode for proposal preview and execution. The goals in the agent's context now include `paused`, `sequence_track_id` and `sequence_position`. `agent_adapter/agent_proposal_schema_v1.json` is regenerated.

### Phase 6 (2026-10-19)
- **Migration C, `b5c6d7e8f9a0` (additive).**
  - `goal_levels` gains `uses_success_vision` and `review_cadence_value/unit`. Ultimate (yearly), Long Term (quarterly) and Mid Term (monthly) are seeded by name, wherever a cadence isn't set.
  - `goals` gains `review_cadence_value/unit`, `review_disabled` and `review_deferred_until`.
  - `notes.note_kind` is CHECK-limited to `goal_completion | goal_review`.
- **Schedule on the server only.** `services/goal_review_rules.py` is pure date logic. Goals on reviewed levels serialize a `review` object (cadence and its source, last and next review, deferral, status), and the client words it and re-checks "due" against the user's timezone. With no client mirror, there are no shared fixtures. Review dates are batch-loaded with the goal tree (constant queries, tested). Landing snapshots skip them.
- **API.**
  - Goal updates take the cadence pair (both null means use the level's), `review_disabled` and `review_deferred_until`.
  - `POST /goals/<id>/review/defer` computes the next period.
  - A `goal_review` note (goal context only) clears any deferral.
  - Level updates validate the cadence pair and units.
- **UI.**
  - Goal Details: "Success vision" with the cadence beside it, editable inline; the relevance statement shown only on vision levels; the "Review due" banner (Review, Defer, Turn off, and Turn on); and a `goal-review` view with a pre-filled composer.
  - Goal Characteristics: a "Success vision & reviews" toggle and a cadence per level.
  - Notes: filters and badges for both kinds.
  - Program calendar: "Review:" badges for the displayed program's lineage.
  - Creating a goal: the due date starts at the level horizon.
- **Fixes found along the way.**
  - Goal Details resolved a goal's level from its type key, which found only the built-in defaults. Custom horizons never reached the due-date warnings. It now resolves the goal's own level.
  - The goal-tree payload was trimmed so it stays inside the power-account size budgets: review fields appear only on reviewed levels, and `sequence_begun_by` only on sequenced goals.

### Phase 5 (2026-10-19)
- **`ChartGoalSurface`** wraps the analytics chart in `ProfileWindow`.
  - Right-click, or a 500 ms touch long-press (cancelled by a 10 px move or release), reads the point off the chart's scales (`chartGoalTargets.js`). The supported charts tag their datasets with the metric and activity ids they plot.
  - `utils/chartGoalPrefill.js` turns the values into a condition draft (pure, unit-tested per chart). The `DropdownMenu` atom offers "Set goal here…", and `ConnectedGoalDetailModal` opens with that condition.
  - The parent is the analytics goal filter's goal, or the fractal root.
- **Departures from the plan.**
  - Metric Progress plots % improvement, so its point means "this much better than the latest session".
  - Activity Totals counts become consistency goals; time totals have no condition to map to and say so.
  - None of the four charts has a time x-axis (Metric Trends is one tick per session), so "a future X sets the due date" doesn't apply. New goals take the level's default horizon instead (Phase 6).
  - Reference lines draw on Metric Trends and Scatter only. Metric Progress plots percentages, and Activity Totals spans many activities while the conditions read is per activity.
- **API.** `GET /<root>/goals/conditions?activity_id=` returns up to 50 live goals on the activity, open first, in constant queries (tested). It sits under the `goalCondition` query-key root, so condition writes refresh the lines.
- **Follow-up (2026-10-20).** The description keeps its "Description" label. The review cadence moved beside the relevance statement, in view and edit mode, and reviews start from that statement. The `uses_success_vision` column keeps its name; in the UI it reads "Relevance & reviews".

### SMART's R becomes Reviewed (2026-10-20)
- **Relevance statements are retired.** Migration D, `c6d7e8f9a0b1`, turns every non-empty statement into a goal note with id `relevance-<goal id>`: 42 locally, including 3 on deleted goals. It then drops the column and renames `goal_levels.uses_success_vision` to `uses_reviews`. Its downgrade restores the statements from those notes; this was proven on a restored copy, where all 42 came back exactly.
- **Backup:** `backups/pre-migration-d/fractal_goals_20261020_pre_d.dump`.
- **R is Reviewed** (`services/goal_review_rules.is_reviewed`; `smartHelpers` mirrors it for live edits). It is met while reviews are on, a cadence applies and no review is due. A due review takes R away until a review is written or deferred. Levels without reviews, and completed goals, count it as met. Older landing snapshots that still say `relevant` are read as `reviewed`.
- **API.** `relevance_statement` is ignored if an older client sends it. Agent goal updates may set the review cadence and `review_disabled` instead, and the agent schema is regenerated. Onboarding's SMART step tracks `reviewed`.
- **UI.**
  - Goal Details shows a "Review" section under the description.
  - Edit mode shows "Review (SMART)": a "Review this goal" checkbox, then "every [n] [unit]" on the same line.
  - The relevance fields are gone from goal details and the fractal-creation modal.
  - Reviews start from the goal's description.
- **Follow-up (2026-10-20).** The schedule sits under the description without a "Review" heading, and the "Review due" banner offers only Review. Defer and turn-off moved out of the banner: reviews are turned off with the edit-mode checkbox. The server's `POST /goals/<id>/review/defer` stays, but the app no longer calls it.

