# Goal-Focused Program Blocks — Design Spec

## Context

On the Programs **Blocks** page, users can split a program into date ranges and add repeating program days. Goals are mostly an afterthought there, and the goal data that does exist doesn't mean anything consistent:

- `program_block_goals` exists, but the block modal has no goal picker. The client decides which goals belong to a block from their deadline dates (`isGoalAssociatedWithBlock`) and ignores `block.goal_ids`.
- `program_day_goals` exists, but nothing in the UI writes to it, and the API requires the goal's deadline to equal the day's date.
- Alignment is the share of time spent on *any* goal in the program (`program_metrics_service._aggregate`). There is no per-block, per-week or per-day alignment.
- Sessions started from a program day get the scope of the whole program (`_session_creation._apply_program_context`), not the day's.
- Weeks don't exist anywhere in the program model.

**What this spec delivers:** each page gets one job.

- **Blocks** is where the user ties goal lineages to periods of time and sets deadlines week by week.
- **Days** is where they plan each day tactically, focused on goals.
- **Calendar** is where they watch the schedule, events, streaks and consistency.

Goals narrow at each level, program → block → day → session, and the same consistency and alignment numbers are measured at every level from one engine.

## Grade of the current system against this goal: **D+**

| Area | Grade | Why |
|---|---|---|
| Data model | C+ | The block-goal and day-goal tables exist, but day goals are tied to deadlines and blocks have no alignment threshold or week concept. |
| Semantics | D | There are three different ideas of which goals belong to a block (stored ids, deadline in range, program-wide scope), and none of them is authoritative. |
| Metrics | D | Alignment is program-wide and weighted by time. There are no week rows. "Adherence" is the name for what the product calls consistency. |
| Session scope | D | Program-day sessions get the scope of the whole program. Nothing goes from the day to the session. |
| Blocks UX | D− | The block modal has no goals. The separate "Attach goal" modal picks a single goal from a flat list. The sidebar shows no goals. |
| Sidebars | C | The Calendar sidebar is solid. The Blocks sidebar is a list of numbers. The Days sidebar is navigation only. |
| Agent / tests | B | Clean service boundaries and generated agent schemas make extending it safe. |

## S+ target: what that looks like

- **One focus model, enforced by the server:** program goals ⊇ block focus ⊇ day focus. Every write path checks it (UI, API, agent proposals).
- **One alignment engine** (a pure module) feeds the calendar headline, block, week and day numbers, so the same date always shows the same numbers on every page.
- **Weeks are first-class:** computed rather than stored, with stable indexes, so there is nothing to keep in sync.
- **Session scope comes from the day automatically** and can still be edited, and off-focus goals are labelled honestly.
- **Every page has a clear job, and its sidebar carries the controls and insights for that job.**
- **Payloads are versioned, migrations are backfilled and logged, boundary cases are tested, and the agent schema is regenerated.**

---

## 1. Domain concepts (canonical definitions)

### Focus scopes
- **Program scope:** `program_goals` plus their live descendants. This becomes the *ceiling* for everything below it. (Today the program scope also absorbs block and day seeds. That union is kept as a separate helper for legacy reads, but it no longer validates anything.)
- **Block focus:** the block's `program_block_goals`, which are its focus goals.
  - **Block focus scope** is the focus goals plus their live descendants.
  - Every focus goal must be inside the program scope.
  - At least one focus goal is required when creating a block, and on any update that sets `goal_ids`.
- **Day focus:** the day's `program_day_goals`, one or more goals.
  - **Day focus scope** is those goals plus their descendants.
  - Every day goal must be inside its block's focus scope. If the block has no focus yet (a legacy block), the program scope is used instead.
  - At least one goal is required when creating a day in a focused block.
  - The deadline coupling in `attach_goal_to_day` is removed.
- **Milestones:** live goals in the block focus scope whose `deadline` falls inside the block's dates. These are the "deadlines against weeks" the Blocks page is built around. A milestone is derived, not stored, so it can't drift out of sync.

### Weeks
- Week *n* of a block covers `[start + 7(n−1), min(start + 7n − 1, end)]`.
- A last week shorter than 7 days is marked `partial: true`.
- The block modal offers a **Length (weeks)** field. Changing it sets `end = start + 7N − 1`, and the end date can still be edited directly.
- "End of week *n*" means the last day of that range, and it is the default deadline when a goal is placed in that week.

### Consistency (renamed from "adherence" everywhere)
- **Consistency = met scheduled program days ÷ observed scheduled program days.**
- Days are evaluated by the existing `build_day_facts` / `program_day_occurrences` evaluator:
  - Rest days and event-protected days are excluded.
  - A manual Complete counts as met.
- This is calculated per program, per block, per week and per program-day definition.
- When nothing is scheduled, "density" mode is used as it is today. In the UI it is labelled "Active-day density".

### Alignment (evidence-based)
**Evidence for a completed occurrence** is the completed activity instances in the sessions credited to that occurrence's date. "Credited" means the same three sources as today (exact program-day link, template match, manual credit), loaded through `program_day_credits`. Off-plan sessions don't count.

**Day alignment fraction:** aligned time ÷ total time, where *aligned* means the instance contributes to a goal in the scope being tested. Contribution goals are resolved with `resolve_contribution_goal`. If no evidence is timed, instance counts are used instead.

**Aligned day:** a completed occurrence whose fraction is at least the **threshold**.
- The threshold is set per program (`programs.alignment_threshold`, default 0.50).
- A block can override it (`program_blocks.alignment_threshold`, which can be empty).
- It must be between 0.05 and 1.00.

**The four alignment numbers, all using that threshold:**

| Number | Formula | Scope each day is tested against |
|---|---|---|
| Block / week alignment | aligned completed days ÷ completed days *with evidence* | the block's focus scope |
| Program-day alignment (per definition) | aligned completed occurrences ÷ completed occurrences with evidence | the day's own focus scope |
| Occurrence alignment (Days page, day review) | the raw fraction | the day's focus scope, and also the block focus scope |
| Program alignment (calendar headline) | the same day-count formula across the whole window | each day's own block focus scope (the program scope for unfocused blocks) |

**Exclusions:**
- A day completed manually with no evidence counts toward consistency but is *excluded* from alignment, and is shown as "no evidence".
- Rest days are excluded from both numbers.

**Kept, renamed:** the existing duration-weighted share is kept as `alignment.effort` for goal coverage and the "other work" breakdown.

### Session scope from a program day
When a session is created or previewed with a `program_day_id`:

1. **Scope** is the day's focus scope. If the day has no goals, the block's focus scope is used, and then the program scope.
2. **Automatic goals:** activity-derived goals are filtered to that scope, as `_link_session_goals` already does with `program_goal_ids`.
3. **Manual goals** are still allowed. They are recorded in `off_program_goal_ids`, which is renamed in the payload to `off_focus_goal_ids`, and the UI shows them as **Off focus**.

Alignment always comes from evidence, so editing scope can never inflate it.

### Invariants on focus changes
- **Narrowing a block's focus** so that some day goals fall outside it returns 409 `program_day_goal_out_of_focus` with a `conflicts` list (day, goal).
  - The client shows a confirmation: "3 days lose: Squat 1RM…".
  - Confirming resends the request with `prune_day_goals: true`, which removes those day-goal rows in the same transaction.
- **Narrowing the program's goals** cascades the same way to block focus goals, as `program_block_goal_out_of_scope`. Neither cascade deletes anything without that explicit flag.
- **Copying or cascading days to a later block** (`add_block_day` / `update_block_day` cascade) copies only the day goals that fall inside the target block's focus scope.
- **Every write** takes the program row lock first, as the calendar invariants already require.

---

## 2. Data and migration

One Alembic revision:

- **`programs.alignment_threshold`:** `Numeric(3,2) NOT NULL DEFAULT 0.50`, with CHECK `0.05..1.00`.
- **`program_blocks.alignment_threshold`:** `Numeric(3,2) NULL`, with the same CHECK.
- **Backfill:**
  - Add to `program_goals` any block or day goal that isn't covered by the program scope, so existing data satisfies the new ceiling.
  - Log each addition (the pattern from migration `f1b3d5a7c9e2`).
- **Existing day goals outside their block's focus are left as they are.** The read model flags them as `out_of_focus`, the UI offers a fix, and the next write must be valid.
- **Legacy blocks with no goals** keep working. They show a "Pick a focus" prompt, and their block alignment is `null` with `reason: "no_focus"`.
- No new tables. Weeks and milestones are derived.

---

## 3. Backend changes

**New pure modules** (kept out of the 700-line `program_metrics_service.py` for the maintainability gate):
- `services/program_focus.py` resolves scopes and checks invariants:
  - `resolve_focus_scopes(db, root_id, program)` returns a `FocusScopes(program_scope, block_scopes{block_id}, day_scopes{day_id})`, loaded in one batched query.
  - `assert_block_focus_valid`
  - `assert_day_focus_valid`
  - `find_focus_conflicts`
- `services/program_alignment.py` holds the pure calculations:
  - `block_weeks(block)`
  - `occurrence_alignment(evidence, scope_ids)` returns the fraction and its basis
  - `classify_aligned(fraction, threshold)`
  - `rollup(days, …)`, which produces consistency and alignment for any group of days: a block, a week or a definition.
  - The engine reuses `alignment_facts` from `program_day_summary.py`.

**Services:**

`_program_helpers._replace_block_goals`:
- now checks focus and the program ceiling
- runs the out-of-focus detection and the `prune_day_goals` flag

`_program_days`: day create and update accept `goal_ids` (replace-all, required in focused blocks), and `_replace_day_goals` replaces rows by soft-deleting them.

`_program_goals`:
- **`attach_goal_to_day`:** the deadline requirement is removed. It now delegates to `_replace_day_goals` (append).
- **`attach_goal_to_block`:** becomes **`schedule_block_milestone`**.
  - Inputs: `goal_id`, a deadline inside the block, and the goal, which must be inside the block's focus scope.
  - It no longer adds the goal to the block's focus. The deadline alone is what makes the goal a milestone.
  - The route stays the same and the request is validated.
- **New `create_block_milestone`:**
  - Inputs: `parent_id`, which must be inside the focus scope; the child's name and level; and the deadline.
  - It creates the goal through `GoalService.create_fractal_goal` in the same transaction.

`_goal_crud.create_fractal_goal_record`: the known gap is closed. The child's deadline must not be later than the parent's deadline, the same check update already uses.

`_session_creation._apply_program_context` and `_session_goal_scope._program_scope_goal_ids`: both switch to the day's focus scope, with the fallbacks from §1.

**`program_metrics_service` (calculation v7):**

| Section | Change |
|---|---|
| `adherence` | renamed to `consistency`, with the same fields |
| `alignment` | becomes the day-based headline: `{aligned_days, evidenced_days, rate, threshold}` plus `effort: {instances, duration_seconds}` |
| `blocks[]` | gains `focus_goal_ids`, `threshold`, `consistency`, `alignment`, and `weeks[]`, where each week is `{index, start, end, partial, consistency, alignment}` |
| `blocks[].program_days[]` | each entry gains `goal_ids`, `consistency`, `alignment` |
| `current_block` | new: `{block_id, week_index, week_count, week: {consistency, alignment}}` for the calendar sidebar |
| `consistency` | gains `next_scheduled_date` and `at_risk_today` (today is scheduled and not yet met) |

**New Blocks read model**, `GET /api/<root>/programs/<program_id>/focus` (`services/program_focus_read_model.py`, schema v1). It is one request for the whole Blocks page:
- **Per block:**
  - focus goals as a lineage tree (each with ancestors for breadcrumbs)
  - milestones grouped by week, each with `due_in_days`, `completed`, `overdue` and `at_risk`. `at_risk` means the milestone is due within 14 days and its subtree has had no aligned evidence in the last 7 days.
  - per-week consistency and alignment, taken from the alignment engine
  - progress for each focus goal: effort share, child milestones completed and due, and targets met
  - program days with their goals and `out_of_focus` flags
- **Program-level:** `upcoming_deadlines` (this week and next, plus anything overdue).
- **Caching:** under the day-read-model root key, so the existing invalidation keeps it fresh.

**Days trend:** `plan-occurrences` gains a per-day `trend` array covering the last 8 completed occurrences:
- date and status
- the day-alignment fraction and whether it was aligned
- for each activity, its volume (the metric sum), so the sidebar can draw sparklines

It is evaluated in the existing single evaluator pass.

**Validators:**
- `ProgramBlockSchema.goal_ids`: `min_length=1` on create, and also on update when the field is present.
- `alignment_threshold` is a decimal between 0.05 and 1.
- Day schemas gain `goal_ids`.
- The update schemas gain `prune_day_goals` / `prune_block_goals`.
- A `BlockMilestoneCreateSchema` is added.

**Agent harness:**
- The strict schemas inherit these fields.
- Regenerate `agent_adapter/agent_proposal_schema_v1.json`.
- Add `alignment_threshold` and day `goal_ids` to the undo and restore payloads and the state hashes (`agent_operation_versions.py`, `agent_harness_proposals._program_day_state_hash`).
- Add `goal_ids` to the agent's block and day context (`agent_harness_context.py`).

---

## 4. Frontend

### Blocks page (main panel): "where goals meet time"
`ProgramBlockView` is rewritten around the focus read model (`useProgramFocus`). Each **block card** has four parts.

1. **Header:**
   - name, dates, **Week 3 of 6**, and a Current/Upcoming/Finished badge
   - consistency and alignment as two small labelled meters
   - Edit / Delete buttons
   - a threshold chip, shown only when the block overrides the program default
2. **Focus row:**
   - lineage chips for the focus goals, using `GoalNameBadge` with an ancestor breadcrumb shown on hover
   - **Edit focus** opens `GoalHierarchySelectionModal`. Its `scopeGoalIds` is the program scope, with lineage highlighting and the ↓ "select branch" control.
3. **Week lanes:** a horizontal grid with one column per week.
   - Each column shows its date range, a consistency and alignment mini-bar, and the milestone cards due that week (goal name, level colour, done/overdue/at-risk state).
   - **+ Add goal** in a week opens a compact composer:
     - parent picker, limited to the block's focus scope
     - name
     - level, inferred from the parent
     - deadline, defaulting to the end of that week, with an exact-date override limited to the block, the parent's deadline and the level's constraints from `utils/goalCharacteristics`
   - Milestone cards can be dragged to another week (the deadline moves to the end of that week). The card menu offers **Move to week…** and **Set exact date…** as keyboard and touch alternatives.
   - On mobile the lanes become a vertical list of weeks.
4. **Program days:** cards showing each day's focus goal chips, its consistency and alignment, and an "out of focus" warning when it applies. "Add day" stays where it is.

Other changes on this page:
- **`ProgramBlockModal`** gains:
  - a required **Focus goals** selector (inline `GoalHierarchySelector`)
  - a **Length (weeks)** input
  - an optional **Alignment threshold** override (a slider showing the program default)
  - inline handling of the 409 focus conflicts, with a prune confirmation
  - a fix for the default colour: it currently sends a CSS variable, which fails the backend's hex validation
- **`ProgramDayModal`** gains a required **Focus goals** selector scoped to the block's focus scope.
- **`ProgramBuilder`** gains a **default alignment threshold** setting.
- **Removed:** `AttachGoalModal`, `isGoalAssociatedWithBlock` and the client-side `buildBlockGoalsByBlockId` / `buildBlockMetrics`. The landing demo moves to the server-shaped fixtures.

### Sidebars

**Blocks sidebar** (`ProgramBlocksSummary`, rewritten). It has three sections:

1. **Upcoming deadlines:** milestones due this week and next, plus overdue ones, with at-risk flags. Clicking one opens the reschedule menu.
2. **Weeks:** one row per block, with a heat strip of week cells (consistency as fill, alignment as a marker). Clicking a cell scrolls to that block's week lane and highlights it.
3. **Focus goal progress:** for each block's focus goals, the effort share, milestones done out of due, and targets met.

**Calendar sidebar** (`ProgramOverview`):
- Headline: **Consistency**, **Alignment** and **Program progress**.
- A new **Current block** card: "Strength · Week 3 of 6" with that week's consistency and alignment. It links to the Blocks page.
- A **Streak** card:
  - current and longest streak
  - an **at risk today** indicator when today is scheduled and not yet met
  - the next scheduled day
- Events and the goal tree stay as they are.

**Days sidebar** (`ProgramDaysNavigator`):
- Each day row gains goal chips.
- The selected day gets a **Trend** panel:
  - a strip of the last 8 occurrences (status mark, alignment fraction, an aligned tick)
  - consistency and alignment for the day definition
  - volume sparklines for each activity, using the `dataviz` skill conventions
- Progressive-overload hints are **out of scope** (deferred).

**Day review pane:** occurrence alignment shows both lenses: "82% on day focus · 64% on block focus".

**Create Session:** the program-day scope chip reads "Day focus: Squat, Bench". Manual goals outside the scope are labelled **Off focus**.

### Shared client plumbing
- Query keys go in the existing programs root, and mutations invalidate the focus read model and the metrics.
- `utils/programFocusViewModel.js` (pure, covered by `checkJs`) builds the lanes, meters and deadline grouping.
- The client accepts metrics v7 and focus v1, and rejects unknown versions (the existing pattern).
- Every "adherence" string and identifier in the client is renamed to "consistency".

---

## 5. Delivery phases (each one shippable)

1. **Focus domain:**
   - the migration
   - `program_focus.py`
   - write-path validation and the prune flags
   - day `goal_ids`
   - the milestone service and the parent-deadline fix
   - session scope from the day
   - validators and the agent schema
2. **Alignment engine and metrics v7:**
   - `program_alignment.py`
   - the consistency rename
   - the block, week and day rollups
   - `current_block`
   - the streak fields
3. **Focus read model and Blocks page:**
   - the endpoint
   - the block modal and day modal goal selectors
   - the week lanes
   - the milestone composer, drag and the menu
   - removing the deadline heuristic
4. **Sidebars:**
   - the Blocks sidebar sections
   - the Calendar's current-block and streak cards
   - the Days trend panel
   - the two-lens day-review alignment
5. **Documentation:**
   - update `index.md` (Programs section: the focus funnel, the definitions, the payload versions)
   - after this plan is confirmed, save it as `planning/program-blocks-goal-focus.md`

## Critical files
- **Backend:**
  - `services/program_scope.py`
  - `services/_program_helpers.py`
  - `services/_program_goals.py`
  - `services/_program_days.py`
  - `services/_program_crud.py`
  - `services/program_metrics_service.py`
  - `services/program_day_summary.py`
  - `services/_session_creation.py`
  - `services/_session_goal_scope.py`
  - `services/_goal_crud.py`
  - `validators/programs.py`
  - `blueprints/programs_api.py`
  - `models/program.py`
  - the agent files listed in §3
- **New backend:**
  - `services/program_focus.py`
  - `services/program_alignment.py`
  - `services/program_focus_read_model.py`
  - one migration
- **Client:**
  - `pages/ProgramCalendarPage.jsx`
  - `components/programs/ProgramBlockView.jsx`
  - `ProgramBlocksSummary.jsx`
  - `ProgramOverview.jsx`
  - `ProgramSidePane.jsx`
  - `days/ProgramDaysNavigator.jsx`
  - `ProgramDayPane.jsx`
  - `components/modals/ProgramBlockModal.jsx`
  - `ProgramDayModal.jsx`
  - `ProgramBuilder.jsx`
  - `hooks/useProgramGoalSets.js`
  - `hooks/useProgramDetailMutations.js`
  - `utils/programViewModel.js`
  - `utils/programGoalAssociations.js` (to be removed)
- **Reused:**
  - `GoalHierarchySelector` and `GoalHierarchySelectionModal`
  - `GoalNameBadge`
  - `utils/goalCharacteristics`
  - `build_day_facts`
  - `program_day_credits`
  - `alignment_facts`
  - `resolve_contribution_goal`
  - `lock_program_calendar`

## Verification
- **Unit tests (pure engine):**
  - week boundaries: 7, 8, 13 and 14-day blocks, and a 1-day block
  - threshold edges: 0.49, 0.50 and 0.51, with the 0.05 and 1.0 bounds
  - a manual Complete with no evidence is excluded from alignment
  - rest days are excluded from both numbers
  - a day with only untimed evidence falls back to instance counts
  - a block override versus the program default
- **Integration tests:**
  - focus ceilings on create and update (block outside the program, day outside the block, an empty `goal_ids`)
  - the 409 conflicts and the prune flag
  - the cascade copying only in-focus day goals
  - the milestone composer: the parent's deadline cap, a date outside the block, the level constraints
  - the session created from a day: its scope equals the day scope, falls back correctly, and records off-focus manual goals
  - the backfill migration on seeded legacy data
  - metrics v7 matching the focus read model for the same block and week
  - tenant isolation on the new endpoint
- **Performance:** add the focus endpoint to `tests/performance/test_power_account_budgets.py` (query count and payload size).
- **Agent:** regenerate the schema, then `tests/unit/test_agent_proposal_schemas.py`, undo for a block with a threshold, and the day-goal round trip.
- **Frontend:**
  - Vitest for `programFocusViewModel`, the block modal validation and conflict flow, the week lanes (drag and keyboard move), and the three sidebars
  - a browser workflow: create a block with focus → add a day with goals → add a milestone in week 2 → log a session from that day → check the week's consistency and alignment and the calendar's current-block card
- **Commands:**
  - `./run-tests.sh all`
  - `./run-tests.sh lint`
  - `./run-tests.sh browser`
- **Manual:** run the app (`/run`), then check the Blocks page on desktop and mobile widths in light and dark themes.

---

## Delivery log

### Phase 1: focus domain (2026-10-04)

Delivered:
- Migration `a7c3e9f1b5d2`: adds `programs.alignment_threshold` (default 0.50) and the optional `program_blocks.alignment_threshold` override, with 0.05–1.00 checks. It also backfills uncovered block and day goals into `program_goals`, shallowest first, and logs each addition.
- `services/program_focus.py`: scope resolution (`FocusScopes`), the write-path asserts, and `guard_focus_change`. The guard compares violations before and after a change and returns 409 or prunes them.
- Block create/update (`goal_ids` required, `prune_day_goals`), program update (`prune_block_goals`), and day create/update/cascade/copy (`goal_ids`). Cascades and copies keep only goals inside the target block's focus.
- `attach_goal_to_day` no longer needs a matching deadline. `attach_goal_to_block` became `schedule_block_milestone`, which only sets a deadline. `POST …/blocks/<id>/milestones` creates a child goal due inside the block.
- Fractal goal creation now caps a child's deadline at its parent's.
- A session's scope comes from its program day: the day's focus, then the block's, then the program's. `off_program_goal_ids` is renamed to `off_focus_goal_ids`.
- Agent harness: the regenerated proposal schema, day `goal_ids` and the block threshold in state hashes and undo payloads, and block/day `goal_ids` in agent context.
- Client (pulled forward from phase 3 so the app keeps working):
  - `FocusGoalsField` added to the block and day modals.
  - The block modal confirms pruning before it saves.
  - Program duplication carries focus goals across (moved to `utils/programDuplication.js`).
  - `utils/programFocus.js` mirrors the server's scopes.

Known pre-existing failures, not caused by this work:
- Four tests still assert day-read-model `schema_version == 5`; the model has emitted 6 since `d502e24c`.
- The frontend maintainability audit and the basedpyright baseline were already failing at `HEAD`. This phase leaves basedpyright at 21 errors, down from 24, and brings `ProgramDayModal.jsx` under its line cap.

### Phase 2: alignment engine and metrics v7 (2026-10-04)

Delivered:
- `services/program_alignment.py`, a pure engine:
  - `block_weeks` (weeks counted from block start, a short last week marked partial)
  - `build_date_alignments` (each scheduled date's met state plus block-focus and day-focus alignment from the evidence of its credited sessions)
  - consistency and alignment rollups
- Threshold classification uses the exact ratio; the reported ratio is rounded.
- `services/program_focus_metrics.py`:
  - block rows with `focus_goal_ids`, `threshold` and `threshold_source`, plus `consistency`, `alignment` (`reason: "no_focus"` for legacy blocks) and `weeks[]`
  - program-day rows with `goal_ids`, `consistency` and `alignment`
  - `current_block`
  - the schedule outlook (`at_risk_today`, `next_scheduled_date`)
- `program_metrics_service` (calculation v7):
  - `adherence` is renamed to `consistency`.
  - The headline `alignment` is now based on completed days, and the old duration share moves to `alignment.effort`.
  - Comparison rows report `consistency_rate` and `effort_alignment_rate`.
  - Focus seeds load in one union query and reuse the already-loaded goal tree, replacing the separate program-scope resolution. The service shrank from 847 to 809 lines, and its size cap was lowered to match.
- `services/program_focus.py` gained `load_focus_seed_rows` / `build_focus_scopes`, so callers that already hold the goal tree build scopes without extra queries.
- Client: accepts v7 only; Calendar and Blocks panes say "Consistency" and show day-based alignment; unfocused blocks read "No focus".
- Test cleanup: updated the stale day-read-model `schema_version == 5` assertions and a stale session-name expectation that they had been hiding.

### Phase 3: focus read model and Blocks page (2026-10-04)

Delivered:
- `GET /api/<root>/programs/<program>/focus` (`services/program_focus_read_model.py`, schema v1). For each block it returns:
  - the status, weeks, current week, and effective threshold with its source
  - the focus goals with ancestor lineage, plus progress measured as milestones done out of milestones due, and targets met
  - milestones grouped by week, with `due_in_days`, `overdue` and `at_risk`. "At risk" means due within 14 days with no completed work on the goal's subtree in the last 7 days.
  - the program days, with their goals and any `out_of_focus_goal_ids`
  - program-wide `upcoming_deadlines`: overdue items plus the next 13 days
- Query budget pinned at the measured 13 queries.
- **Deviation from spec:** consistency and alignment numbers are *not* repeated in the focus read model. The page joins them from metrics v7, which keeps one source for every number.
- `focus_scopes_from_goals` is shared by metrics and the focus read model, and the metrics service shrank to 805 lines, with its size cap lowered to match.
- Client:
  - The Blocks page is rebuilt from `ProgramBlockView` plus `blocks/`: `BlockFocusCard`, `BlockFocusRow`, `BlockWeekLanes`, `MilestoneCard`, `MilestoneComposer`, `BlockDayCards` and `RollupMeter`.
  - The data is built by `buildBlockCards` and loaded by `useProgramFocus`. Its query key sits under the day read-model root, and goal refreshes now invalidate that root.
  - Milestones are added per week (the deadline defaults to the week's last day, bounded by the block and the parent's deadline). They move between weeks by drag and drop or by a keyboard/touch reschedule panel. On mobile the lanes stack vertically.
  - Unfocused blocks show a "Pick a focus" prompt.
  - The block modal gained "Length (weeks)" and a custom alignment threshold.
  - The program builder gained a default alignment threshold and an inline confirmation for pruning when program goals are narrowed (`FocusConflictNotice`, shared with the block modal).
  - The landing preview renders the same cards, read-only, from `buildDemoFocusModel`.
- Removed: `AttachGoalModal`, `isGoalAssociatedWithBlock`, `buildBlockGoalsByBlockId`, and the attach-goal state in the controller, mutations and view model. `GoalViewMode` now treats a block's focus goals as its goals.
- Browser test `e2e/program-blocks-focus.spec.js` (desktop and mobile): focus a legacy block, add a goal in week 2, move it to week 3. The browser fixture now gives the planning program a goal.

Known pre-existing failures, unchanged by this phase: browser specs `agent-connections` (end-to-end), `program-day-status` (desktop) and `program-session-plans` fail identically at `HEAD`.

#### Follow-up: block header stats (2026-10-04)

The block header's two gauges were replaced:
- **Program days by status:** the four calendar status symbols (complete ✓, missed ✗, rest ☾, scheduled ●), each with its count.
- **Figures beside them:** consistency and alignment as a percentage with count/total, plus a new **Longest streak**.

Metrics v7 block rows gained:
- `status_counts`, using `date_status` in `services/program_alignment.py`, which mirrors the client's `getProgramDayStatusSymbol`
- `longest_streak`: the longest run of completed dates inside the block. Rest and not-yet-due dates bridge a run; a missed date ends it.

Week lanes and day cards keep their compact meters.

Status badges and the scheduled count:
- The ● count is the block's total scheduled program days. `status_counts.scheduled` is now the total, and the days still to come are reported as `pending`.
- Blocks use the shared `ProgramStatusBadge` (`components/programs/`), which is also used by the program header, the program picker and the landing preview. A current block reads Active and a finished one Completed.


Week calendar (replaces week lanes):
- Each block shows its weeks as calendar rows (`blocks/BlockWeekCalendar.jsx`). A row has a week summary (dates, "This week", compact consistency and alignment meters, and "+ Add goal" for the end of the week) followed by seven day columns. The columns start on the block's first weekday, since weeks count from the block start.
- Each day cell shows its date, the calendar's status symbol with the program day's name, and the goals due that day. Today is highlighted, and days past the block's end are greyed out.
- Day status comes from metrics v7 `days[]`, through the same `getProgramDayStatusSymbol` the calendar uses. Without metrics (the landing preview), the schedule alone marks days as scheduled.
- Goals are added on a specific day (the cell's "+") or for a week. Dragging a goal onto a day sets that exact date, kept within the block and no later than the goal's parent.
- The keyboard/touch reschedule panel and the composer open full-width under the week row (`MilestoneReschedulePanel`, `MilestoneComposer`). Goal chips are `MilestoneChip`.
- On mobile, the summary sits above the seven compact day cells, which hide program-day names and the per-day "+".

### Retiring the Blocks view (2026-10-04)

The separate Blocks page was retired. The Programs page now has **Calendar** and **Days** only, and the old `/programs/<id>/blocks` deep link opens the calendar.
- **Blocks section in the calendar side pane** (`ProgramBlocksPanel`). It shows at program scope, right after the headline metrics. Each block summary shows:
  - name, shared status badge, dates, and "Week n of m"
  - the header stats (status symbols with counts, consistency, alignment, longest streak) in a compact layout
  - focus goals with goals done, or a "Pick a focus" prompt
  - open goals due in the block, with overdue and at-risk flags and the reschedule panel
  - "+ Add a goal due in this block" (due by default at the end of the current week)
  - the block's program days (each opens its editor) with "+ Add day", plus edit and delete for the block
- **Whole-program metrics:** the section uses whole-program metrics and the focus read model whenever the Calendar view is open, regardless of the calendar's selection.
- **Removed:**
  - `ProgramBlockView` and `blocks/BlockFocusCard`, `BlockFocusRow`, `BlockWeekCalendar`, `BlockDayCards`, `MilestoneChip` and `RollupMeter`
  - `ProgramBlocksSummary`
  - the landing preview's Blocks toggle, and `buildDemoFocusModel`
  - the week-calendar helpers in the view model
  - drag-and-drop rescheduling. The reschedule panel covers it.
- **Collapsible side pane:** the side pane collapses on desktop as well. A Collapse button sits beside the Calendar | Days toggle (as in the Notes filters pane), the header's Show/Hide Sidebar button reopens it, and the open state is remembered per fractal in localStorage.

### Removing block focus and alignment (2026-10-05)

The compact side-pane blocks made block focus goals and evidence-based alignment more weight than they were worth, so both were removed. The day-review per-session alignment and the Days-view aids predate this plan and are kept.
- **Block goals:**
  - Blocks no longer take focus goals (API, validators, agent schema and harness, block modal).
  - `program_block_goals` is kept as legacy data that nothing reads or writes.
  - The milestone routes and the `/programs/<id>/focus` read model are removed.
- **Day goals:**
  - Day goals are optional and bounded by the program's goals plus their descendants (`program_day_goal_out_of_scope`).
  - Narrowing a program's goals needs `prune_day_goals` to remove stranded day goals.
  - Sessions started from a day are scoped to its goals, else the program's.
- **Metrics v8:**
  - `services/program_alignment.py` and `program_focus_metrics.py` become `program_rollups.py` and `program_block_metrics.py`.
  - The alignment payload, the effort share, `other_work` and the comparison's `effort_alignment_rate` are dropped.
  - Each block row gains `goals: {due, completed}`: the program goals and descendants whose deadline falls inside the block, and how many of them are done.
- **Side pane:**
  - Block stats are the status symbols plus Consistency, Goals completed, Goals due and Longest streak.
  - The focus goals, the goals-due list, the composer and the reschedule panel are removed.
  - The program overview and the sidebar show "Goals completed" in place of Alignment.
- **Settings:** `ProgramBuilder` and `ProgramBlockModal` drop the alignment threshold. The block modal keeps the Length (weeks) field (`BlockLengthField`).
- **Migration:**
  - `a7c3e9f1b5d2` (unreleased) is renamed `program_day_goal_ceiling`. It only backfills `program_goals` from live day goals that aren't covered.
  - Its downgrade drops any `alignment_threshold` columns left by the earlier draft.
- **Tests:** `e2e/program-blocks-sidepane.spec.js` replaces `program-blocks-focus.spec.js`.

### Side pane polish (2026-10-05)

- **Block summaries:**
  - The block name is shown in the block colour. The left colour border and the dot are gone.
  - Consistency, Goals completed/due (`X/Y`) and Longest streak sit on one row.
- **Details | Goals toggle is back** at program scope. On desktop it sits beneath the pane's header line; in the mobile sheet it is the header. Details shows the metrics, then events, then blocks. Goals shows the goal hierarchy. The "Program Goals" option opens the Goals view.
- **Dev database:** `alembic downgrade -1 && alembic upgrade head` was run, which dropped the draft `alignment_threshold` columns.
