# Programs: block week tracking + program-level program days

## Context

Two things about program structure make the Programs page harder to use than it should be:

1. **Blocks don't show where you are inside them.** A block such as "Month 1" (Sep 1 – Sep 30) is shown as one coloured span. The user can't see "Week 3" on the calendar, even though metrics already split blocks into 7-day weeks behind the scenes (`services/program_rollups.py:block_weeks`). Those weeks are anchored to the block's start date, not to the calendar rows.
2. **Program days belong to exactly one block.** `ProgramDay.block_id` is `NOT NULL`, weekday rules only fire inside that block (`program_day_occurrences._within_block`), and the only way to reuse "Leg Day" across Month 1–4 is **Copy to Other Blocks**. That produces N independent copies. The Days-tab sidebar (`ProgramDaysNavigator`) then groups by block, so the same day appears once per block. Creating a day also needs a block: the sidebar has no create button, and the calendar offers "New day in {block}".

What we want:
- **Blocks:** the block modal has a **Track weeks** checkbox and a **Weeks start on** weekday picker. When it's on, the calendar labels Week 1, 2, … n inside the block. Week 1 starts on the block's start date, and each later week starts on the chosen weekday, so weeks line up with calendar rows. The same week boundaries feed metrics and the side pane.
- **Program days:** a program day belongs to the **program**, not a block. Its weekday rule repeats across the **whole program span**, and specific dates can be anywhere in the program. The Days sidebar lists each day **once**, with no block grouping, and has a **New program day** button.

Decisions confirmed:
- Weekday rules apply program-wide. Days have no block picker.
- The migration **merges identical copies** of a day (same name, templates and weekdays) into one day.
- Weeks are numbered from a chosen weekday. Week 1 is the possibly partial week that begins on the block's start date.

## Grade of the current system against this plan: **C**

| Area | Grade | Why |
|---|---|---|
| Data model for days | **D** | `program_days.block_id NOT NULL` makes a reusable definition block-bound. Reuse means copying (`copy_block_day`, `cascade` in `add_block_day` and `update_block_day`), which forks plans, goals and sessions across N rows. A legacy `program_days.date` column is still a third scheduling mechanism alongside weekdays and explicit rows. |
| Days UX | **D+** | The sidebar repeats days per block and hides days with no templates, so a newly created empty day disappears. There is no create entry point on the Days tab. The modal's "Copy to Other Blocks" exposes the model's limitation to the user. |
| Week semantics | **C** | `block_weeks` exists and is pure, but it is hard-coded to 7-day steps from the block start, can't be configured, and never appears on the calendar. |
| Calendar invariants / evaluator | **B+** | `build_occurrences` is the single canonical evaluator and the one-day-per-date invariant is locked and tested. Both only need to iterate `program.days` instead of `block.days`. |
| Reusable foundations | **B+** | Block labels already render per cell (`buildProgramBlockLabels` → `ProgramCalendarView.syncBlockLabelForCell`). Metrics already have a week concept. Lock ordering and `ProgramServiceValidationError` are already in place. |

## Target design (S+)

### A. Block week tracking

**Model and migration (`models/program.py` `ProgramBlock`):**
- `track_weeks BOOLEAN NOT NULL DEFAULT false`
- `week_start_day SMALLINT NULL`, using Python `weekday()` (0 = Mon … 6 = Sun)
- `CHECK (week_start_day IS NULL OR week_start_day BETWEEN 0 AND 6)`
- `CHECK (NOT track_weeks OR week_start_day IS NOT NULL)`

**One week definition, on both server and client:**
- `services/program_rollups.py:block_weeks(start, end, week_start_day=None)`:
  - Week 1 runs from `start` up to the day before the first `week_start_day` that falls after `start`. Each later week starts on that weekday and the last week is clipped to `end`.
  - `None` means the weekday of `start`. That reproduces today's 7-day stepping exactly, so blocks that don't track weeks behave as they do now.
  - `BlockWeek.partial` already exists and stays accurate.
- New `client/src/utils/programBlockWeeks.js` provides `blockWeeks(block)` and `weekForDate(block, date)`.
- Both implementations are tested against one shared fixture table, `tests/fixtures/block_weeks_cases.json`, read by pytest and by vitest. The two can't drift.

**Metrics:**
- `program_block_metrics` passes `block.week_start_day if block.track_weeks else None`.
- Week rows and the side pane's "current week" (`current_block_summary`) then follow the user's weeks.
- Calculation version goes from **v8 to v9**, because week boundaries can change. The client's expected version is bumped too.

**Serialization:**
- `serialize_program_block` and the calendar-feed block payload add `track_weeks` and `week_start_day`. These fields are additive, so the feed schema stays v1.

**API and validation:**
- `ProgramBlockSchema` and `ProgramBlockUpdateSchema` accept both fields.
- A validator enforces 0–6 and requires `week_start_day` when `track_weeks` is on.
- The agent `create_block` operation accepts them as optional, and the agent JSON schema is regenerated.

**`ProgramBlockModal.jsx`:**
- A **Track weeks** checkbox sits below Length (weeks).
- When it's checked, a **Weeks start on** segmented weekday control (Sun … Sat) appears. It defaults to Sunday, which is the calendar's `CONTINUOUS_FIRST_DAY`, so labels fall on row starts.
- A live preview line shows, for example, "Week 1: Sep 1–5 (partial) · 5 weeks". It is computed with `blockWeeks`.
- The control is a radio group with arrow-key support and works with screen readers.

**Calendar (`buildProgramBlockLabels` → new `buildProgramWeekLabels`):**
- For blocks with `track_weeks` on, a compact **W1, W2 …** chip appears in the block's colour on each week's first date.
- On the block's start date the chip sits beside the block-name label.
- The chips reuse the existing per-cell label mechanism (`labelType: 'week'`). They are decorative and can't be clicked. The aria/title text reads "Month 1, week 2 of 5".
- They render on the Programs page, on `CalendarWidget`, and on the landing demo through the same builder.

**Context surfaces:**
- The day side-pane header shows "Month 1 · Week 3" under the date.
- The Days-view column header shows the same text for each column's date.
- Both use `weekForDate`, and both appear only when the block tracks weeks.

### B. Program days belong to the program

**Model (`models/program.py`):**
- `ProgramDay.program_id`: `String`, FK `programs.id ON DELETE CASCADE`, `NOT NULL`, indexed.
- New relationship `Program.days`, with cascade delete-orphan and ordered by `day_number`.
- `ProgramDay.block_id` and `ProgramBlock.days` are **dropped**.
- The legacy `ProgramDay.date` column is **dropped**. The migration moves its values into `program_day_occurrence_schedules`, which leaves two scheduling mechanisms: weekdays and explicit dates.
- `day_number` stays and is used only as the sidebar sort order. It is renumbered per program.

**Evaluator (`services/program_day_occurrences.py`):**
- `build_occurrences(program, start, end)` iterates `program.days` over `max(start, program.start)` … `min(end, program.end)`.
- Each occurrence row stays `{"program_day", "block"}`, where `block` is the block containing that date, found with a new `block_for_date(program, date)` helper, or `None` when no block covers it.
- `program_day_scheduled_on(day, program, date)`: inside the program span, the date matches an explicit date or a weekday.
- Every consumer of `row["block"]` gets a `None` guard. These are `program_block_metrics`, `program_rollups` (block_id), `program_metrics_service`, `program_day_read_model_service`, `program_day_credits`, `program_calendar_feed_service`, and `_program_day_statuses`.

**Service (`services/_program_days.py`), now keyed by program:**
- `create_program_day(program_id, data)`, `update_program_day`, `delete_program_day`, `duplicate_program_day`, `schedule_program_day` and `unschedule_program_day_occurrence`.
- **Cascade and copy-to-blocks are removed.**
- **Duplicate** makes "<name> (copy)" with the same templates, goals and notes but **no schedule**, so it can never violate one-day-per-date.
- Explicit dates must fall inside the program span (`program_day_date_outside_program`, 400).
- Lock order becomes program → day.
- `assert_single_program_day_per_date` (`services/program_calendar_invariants.py`) iterates `program.days`. The block-overlap guard is unchanged.

**Block lifecycle:**
- Deleting a block no longer deletes days, because days belong to the program.
- Creating, moving or resizing a block no longer touches day schedules, so block writes drop the single-day-per-date re-check (blocks now only change labels and metrics grouping).

**Everything else that joins through blocks moves to `ProgramDay.program_id`:**
- `_session_goal_scope`, `_program_goals`, `program_focus`, `program_scope`, `program_session_plans`, `template_service`, `_analytics_datasets`, `circuit_service`, `session_activity_service`, `admin_service`, `agent_harness_context` and `agent_operation_versions`.
- `_session_creation` and `session_service` set `session.program_id` from `day.program_id` and `program_block_id` from `block_for_date` at the session's local date.
- `get_active_program_days` iterates `program.days`.

**Routes (`blueprints/programs_api.py`):**
- New program-scoped routes:
  - `POST /<root>/programs/<program>/days`
  - `PUT|DELETE …/days/<day>`
  - `POST …/days/<day>/duplicate`
  - `POST …/days/<day>/schedule`
  - `POST …/days/<day>/unschedule`
  - `POST …/days/<day>/goals`
- The `/blocks/<block>/days…` routes are **removed**, not aliased. The client and the agent adapter are the only callers, and both are updated in this change.

**Serialization:**
- `serialize_program` emits a top-level `days: [...]` sorted by `day_number`, and each day carries `program_id`.
- Blocks no longer carry `days`.
- The day read model (bumped to **v7**) still emits `block` per occurrence, which may be null, plus `week_index` when the block tracks weeks.

**Agent proposals:**
- `create_program_day` takes `program_id` instead of `block_id`, and `copy`/`cascade` are removed.
- `agent_adapter/agent_proposal_schema_v1.json` is regenerated, and the harness preview and run paths are updated.

### C. Migration (one Alembic revision, Postgres, fails loudly)

1. Add `program_blocks.track_weeks` and `week_start_day`, with their checks.
2. Add `program_days.program_id` as nullable, backfill it from `program_blocks.program_id`, then set `NOT NULL`, add the FK and add the index.
3. **Snapshot the current calendar.** For each program, compute today's occurrence map, `{date: day_id}`, from blocks, weekdays, explicit rows (inside the block only) and legacy `date`. This is pure Python inside the migration, a frozen copy of today's evaluator.
4. **Merge identical copies.** Within one program, group days by:
   - name, normalised (trimmed, case-folded)
   - template rules, as an ordered list of (template_id, is_required, order)
   - sorted `day_of_week`
   - `completion_min_templates`

   The day in the earliest block is kept. Every other copy is re-pointed to it, then deleted:
   - `sessions.program_day_id` and `program_day_sessions.program_day_id`
   - `program_session_plans.program_day_id`. Dates can't collide, because the one-day-per-date invariant already holds.
   - `program_day_occurrence_schedules`, by union and dedupe on (day, date)
   - `program_day_goals`, by union and dedupe on goal; soft-deleted rows are kept once
   - notes, taking the first non-empty value
5. **Preserve the calendar exactly under program-wide weekdays.** For each surviving day with weekdays:
   - Keep `day_of_week` if its source blocks (after the merge) cover every date in the program span that falls on one of its weekdays.
   - Otherwise, write explicit schedule rows for those weekday dates inside its source blocks and clear `day_of_week`.
   - Explicit rows that were dormant because they sat outside the source block are deleted. Legacy `date` values become explicit rows.
6. **Assert equivalence.** Recompute each program's occurrence map with the new rules (program-wide weekdays plus explicit rows). The migration raises, naming the program and the first differing date, if it doesn't equal the snapshot.
7. Drop `program_days.block_id`, its index and `program_days.date`, then renumber `day_number` per program.

**Downgrade:** re-adds `block_id` and gives each day the block containing its first occurrence, falling back to the program's first block. It is documented as lossy: merged copies stay merged.

### D. Client

**Data and utilities:**
- Every `block.days` reader moves to `program.days`.
- `getProgramDayScheduledDates(day, program)` is used by `buildProgramDayOccurrences`, and occurrences gain `block` from `blockForDate`.
- Utilities involved: `programViewModel.js`, `programCalendarConflicts.js` (`occupiedProgramDates(program, {excludeDayId})`, replacing `occupiedBlockDates`), `programDaysView.js`, `programDuplication.js` and `programGoalWindow.js`.
- Hooks: `useProgramLogic`, `useProgramDetailController`, `useProgramDetailMutations`, `useProgramSessionPlans` and `useSessionQueries`.
- `utils/api/fractalProgramsApi.js` gets the new program-scoped endpoints and drops copy.

**`ProgramDaysNavigator.jsx` (Days-tab sidebar):**
- A **New program day** button in the pane header opens `ProgramDayModal` in program context.
- One flat list of `program.days` in `day_number` order. Each row shows:
  - the day name
  - a schedule summary, such as "Mon · Thu" or "6 dates" (or "Not scheduled")
  - template badges
  - an **Edit** icon button
- Days with no templates are listed, marked "Add a template to plan sessions". Selecting one shows an empty state with an Edit CTA instead of disappearing.
- Block headings and `plannableDayGroups` are removed. The mobile `<select>` in `ProgramDaysView` loses its `optgroup`s.
- When a day is created, it is selected and scrolled into view.

**`ProgramDayModal.jsx` and `ProgramDayScheduleField.jsx`:**
- Takes `program` instead of `block`. Specific-date bounds are the program's start and end.
- Taken-date and weekday hints come from `occupiedProgramDates`.
- **Copy to Other Blocks** becomes **Duplicate**.
- Helper text: "Weekdays repeat across the whole program."

**`ProgramDaysView.jsx`:**
- The header shows just the day name; the block / day breadcrumb is removed.
- Each column's date header shows "Month 2 · Week 1" for its date when available.

**`ProgramDayPane.jsx` (calendar date pane):**
- On an unscheduled date, "New day in {block}" becomes **New program day**, which opens the modal pre-filled with that date as a specific date.
- **Schedule {day}** lists all program days.

**Other surfaces:**
- `createSession/ProgramDayPicker.jsx` and `pages/CreateSession.jsx` list program days without block grouping, showing today's block and week as context.
- `ProgramBlocksPanel` and `SessionCalendarHeatmap` switch to date-derived blocks.

## Critical files

| Area | Files |
|---|---|
| New | `migrations/versions/<rev>_program_level_days_and_block_weeks.py`, `client/src/utils/programBlockWeeks.js`, `tests/fixtures/block_weeks_cases.json` |
| Model / evaluator | `models/program.py`, `services/program_day_occurrences.py`, `services/program_rollups.py`, `services/program_calendar_invariants.py` |
| Services | `services/_program_days.py`, `services/_program_crud.py`, `services/_serialize_programs.py`, `services/program_block_metrics.py`, `services/program_session_plans.py`, `services/_session_creation.py`, plus the block-join call sites listed in B |
| API / validation / agent | `blueprints/programs_api.py`, `validators/programs.py`, `services/agent_harness_preview.py`, `services/agent_harness_runs.py`, `services/agent_operation_versions.py`, `agent_adapter/agent_proposal_schema_v1.json` |
| Client | `ProgramBlockModal.jsx`, `ProgramDayModal.jsx`, `ProgramDayScheduleField.jsx`, `days/ProgramDaysNavigator.jsx`, `days/ProgramDaysView.jsx`, `ProgramDayPane.jsx`, `ProgramSidePane.jsx`, `ProgramCalendarView.jsx`, `utils/programViewModel.js`, `utils/programCalendarConflicts.js`, `utils/api/fractalProgramsApi.js` |
| Docs | `index.md` Programs section (program-level days, week tracking, v9/v7 versions); this plan saved as `planning/program-level-days-and-block-weeks.md` |

## Tests

**Backend:**
- `block_weeks`, using the shared fixtures. Cases:
  - a start on the anchor weekday
  - a partial first week
  - a single-day block
  - `None` matches the legacy 7-day stepping
- Week validators.
- Program-wide weekday evaluation, including dates outside any block, where `block` is `None`.
- Explicit dates outside the program are rejected.
- One-day-per-date across program days.
- Duplicate creates an unscheduled copy.
- Deleting a block keeps days.
- Session creation sets `program_block_id` from the date.
- Metrics v9 week rows honour `week_start_day`.

**Migration (`tests/migrations/`):**
- Seed:
  - a day copied into 3 blocks that cover the program, which should merge and keep its weekdays
  - copies that differ by template, which should stay separate
  - a block-limited weekday day, which should be materialised to explicit dates
  - a legacy dated day
  - plans, sessions and goals on the copies
- After upgrade, assert:
  - identical occurrence maps
  - re-pointed foreign keys
  - no orphan rows
- Assert that a forced mismatch aborts the migration.

**Client (vitest):**
- `programBlockWeeks`, using the shared fixtures.
- `ProgramBlockModal`: the checkbox reveals the picker, the preview text is right, and the payload is right.
- `buildProgramWeekLabels`.
- `ProgramDaysNavigator`: a flat list, the create button, the empty-template row and the Edit button.
- `ProgramDayModal`: program-span bounds and Duplicate.
- `ProgramDayPane`: New program day.
- Update existing tests that build `blocks[].days` fixtures.

## Verification

1. Run `./run-tests.sh` (pytest) and `cd client && npm test`. Both should be green.
2. Run the migration against a copy of the dev database (`alembic upgrade head`) and check that the equivalence assertion passes. Spot-check one program's calendar before and after for an identical ribbon layout.
3. In the app:
   - Edit "Month 1", tick Track weeks, and pick Sunday. W1–W5 chips should appear on the calendar row starts, and the side pane should show "Month 1 · Week n".
   - On the Days tab, use **New program day** and give it Mondays. It should appear once in the sidebar and repeat on every Monday across all blocks.
   - Duplicate a day. The copy should appear unscheduled.
   - Delete a block. Its days should remain.
4. Once this plan is approved, save it to `planning/program-level-days-and-block-weeks.md` and update `index.md`.
