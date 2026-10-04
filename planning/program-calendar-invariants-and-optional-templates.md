# Programs: no overlapping blocks, one program day per date, optional-template selector

## Context

The Programs page currently lets users build calendars that contradict themselves:

- **Blocks can overlap.** `create_block` / `update_block` (`services/_program_crud.py:71-143`) save dates with no checks at all. Nothing checks start ≤ end, that the block sits inside the program, or that it avoids sibling blocks. The only overlap guard in the codebase is `_check_no_program_overlap` (`services/_program_helpers.py:109`), and it compares programs, not blocks.
- **Several program days can land on one date.** Weekly `day_of_week`, explicit `program_day_occurrence_schedules` rows and legacy `program_days.date` can all coincide. The evaluator (`services/program_day_occurrences.py:build_occurrences` / `evaluate_date`) quietly merges them, which makes status, credit and the Days view harder to understand.
- **The Days view shows every template, fully expanded.** `PlanDateColumn` renders a card for each template rule, and the only difference for an optional template is a " · optional" suffix (`SessionPlanCard.jsx:110-115`). Days with several optional alternatives turn into a wall of plans the user never intends to do.

The outcome we want:
1. Overlapping blocks are rejected everywhere: UI, API, agent proposals, and the database itself.
2. A calendar date carries at most one program day, enforced on every write path.
3. On a scheduled program day, only required templates open by default. Optional templates sit in a **selection container**. The user loads any number of them into the day, and can remove them again.

Decisions already made: optional templates are load-any-number, the selector is always used (even for a single optional template), and there is no legacy conflicting data, so strict constraints go in directly and the migration fails loudly if it finds a violation.

## Grade of the current system against this plan: **C−**

| Area | Grade | Why |
|---|---|---|
| Block integrity | **D** | No server validation of block dates at all (order, program span, overlap). Only the calendar drag-selection avoids overlap on the client. Blocks are not protected by the DB. |
| One day per date | **D** | The model and evaluator assume overlap is normal. The only guard is a same-block legacy `date` check under `create_only`. Concurrent writes are only partially serialized (program/block/day locks exist only on the scheduled-dates and schedule paths). |
| Error contract | **C** | Block and day routes turn every `ValueError` into a 400 by matching the message string. `ProgramServiceValidationError(payload, status)` exists but these routes don't use it. The client shows block, day and schedule errors only as toasts, never next to the field. |
| Optional-template UX | **C** | `is_required` is modelled properly (`program_day_templates.is_required`) and serialized per plan entry, but the UI only uses it as a text suffix. |
| Reusable foundations | **B+** | Lock ordering (program → block → day), virtual plans with `_materialize`, the canonical `build_occurrences`, the `ProgramServiceValidationError` payload and a strong test suite make the target cheap to reach cleanly. |

## Target design (S+)

### A. Calendar invariants are one service-level guard, backed by the DB where possible

**New module `services/program_calendar_invariants.py`.** This is the only place the rules live:

- `assert_block_dates_valid(program, block)`:
  - start ≤ end, and both dates set or both empty.
  - The block lies inside `program.start_date..program.end_date`.
  - Violations raise `ProgramServiceValidationError({error, code: 'program_block_invalid_dates', field}, 400)`.
- `assert_no_block_overlap(session, program, block)`:
  - Uses the same predicate as `_check_no_program_overlap` (`start <= other.end AND end >= other.start`), restricted to sibling blocks that have dates.
  - Raises `ProgramServiceValidationError({error: "Blocks can't overlap. <Block> already covers <start>–<end>.", code: 'program_block_overlap', conflicts: [{block_id, name, start_date, end_date}]}, 409)`.
- `assert_single_program_day_per_date(session, program)`:
  - Runs after the write has been flushed.
  - Calls the canonical `build_occurrences(program, program.start, program.end)`, so it shares one definition of "scheduled on" (weekday, explicit row, legacy date) with the calendar, metrics and the Days view.
  - Any date with more than one entry raises `ProgramServiceValidationError({error: "<Date> already has <Day name>. A date can hold only one program day.", code: 'program_day_date_conflict', conflicts: [{date, day_id, day_name, block_id}]}, 409)`.
  - The conflicts list is capped at about 20 entries. The message names the first conflicting date and the total count.
  - Because the check runs after flush, the transaction rolls back and nothing is saved.
  - Cost: a program spans at most 366 days, and the check is a single pass over in-memory relationships.

**Serialization.** One new helper, `_lock_program_calendar(session, program_id)`, does `SELECT … FOR UPDATE` on the program row. Every calendar write calls it first, so two concurrent requests can't both pass the check:
- block create and update
- day create, update, copy, schedule and unschedule
- program date changes

This reuses the program → block → day lock order that `update_block_day` and `schedule_block_day` already follow.

**Where the guards run:**

| Service method | Guards |
|---|---|
| `create_block`, `update_block` | dates valid, no overlap, then single day per date. Moving or resizing a block can push its weekday days onto dates owned by another block's legacy dated day, or reactivate dormant explicit schedules. |
| `add_block_day` (including `cascade`), `update_block_day` (including `cascade` and the `scheduled_dates` replace-all), `copy_block_day`, `schedule_block_day` | single day per date |
| `update_program`, only when the dates change | each block still inside the program |

**DB backstop for blocks, in a new Alembic migration:**
- `CREATE EXTENSION IF NOT EXISTS btree_gist`.
- `CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)`.
- `EXCLUDE USING gist (program_id WITH =, daterange(start_date, end_date, '[]') WITH &&) WHERE (start_date IS NOT NULL AND end_date IS NOT NULL)`.
- The migration fails as-is on violating rows, which is the agreed behaviour. Its docstring documents the audit query.
- The service maps an `IntegrityError` from the constraint to the same 409 payload, so the response looks identical if the service check is ever bypassed.
- The weekday-based day rule can't be expressed as a constraint, so the locked service guard is authoritative for days.

**Validators (`validators/programs.py`).** `ProgramBlockSchema` and `ProgramBlockUpdateSchema` get the same end ≥ start `model_validator` the program schemas already have. That gives fast 400s with field details.

**Routes (`blueprints/programs_api.py`).** The block and day routes (create/update block, add/update/copy/schedule day) get an `except ProgramServiceValidationError` branch that calls the existing `_program_service_error_response`. It goes before the string-matching `ValueError` fallback.

**Agent proposals.** `services/agent_harness_preview.py` and `services/agent_harness_runs.py` map `ProgramServiceValidationError` to `AgentHarnessError(message, exc.status_code, exc.payload['code'])`. That means wrapping `create_block` and `create_program_day` too, which currently let `ValueError` escape. The agent schemas don't change, so the generated JSON schema doesn't need regenerating.

**Evaluator.** No behaviour change. `evaluate_date` keeps its overlap-tolerant merging as defensive code, with a comment noting that the invariant now guarantees at most one definition per date.

### B. Client: stop conflicts before they're submitted, and show server errors inline

**New `client/src/utils/programCalendarConflicts.js`.** Pure functions built from the program detail the editors already load:
- `findBlockOverlap(blocks, draft)`
- `occupiedProgramDates(program, { excludeDayId })` returns a `Map<date, {dayId, dayName}>`. It mirrors `program_day_scheduled_on` and is used for hints only. The server remains authoritative.

**`ProgramBlockModal.jsx`:**
- Live inline error under the dates: "Overlaps Week 2 (Oct 6 – Oct 12)". Save is disabled while it shows.
- `saveBlock` in `useProgramDetailMutations` rethrows. The modal then shows a server 409 or 400 inline (an `error.response.data.conflicts`-aware message) rather than only a toast.

**`ProgramDayScheduleField.jsx` / `ProgramDayModal.jsx`:**
- Weekday toggles that would collide inside the block's range get a "Taken by Leg Day" hint, and the "Also planned on" and specific-date inputs reject taken dates inline.
- `saveBlockedReason` covers these cases.
- The server's `program_day_date_conflict` response renders inline in the modal footer and lists the conflicting dates. The toast is dropped, because the modal stays open.

**`ProgramDayPane.jsx`.** The "Schedule {day}" and "New day in {block}" actions already appear only on unscheduled dates. A test pins that down. A schedule 409 caused by a race shows a clear toast with the server message.

### C. Days view: required templates open, optional templates in a selector

**Model (no schema change).** On a given date, an optional template is *loaded* when a stored plan exists for (day, template, date) or a session was logged against it. Required templates keep today's virtual-plan behaviour. This reuses `program_session_plans`. "Loaded" is simply "this date has a plan for this template", so there is no second source of truth.

**Backend (`services/program_session_plans.py`, `blueprints/program_session_plans_api.py`):**
- `get_day_plans` returns every rule, as it does today, plus `is_loaded` on each entry: `is_required or plan_id or logged_sessions`. Older clients keep working.
- New `POST /api/<root>/programs/<program>/days/<day>/plans/<template>/load?date=&timezone=`:
  - Validates that the template is an optional rule of the day and that the date is today or later.
  - Materializes the resolved seed (previous plan, else template) through the existing `_materialize`. It is idempotent and returns the existing plan if one is already stored.
  - Returns the serialized entry with status 201.
- Removing a template uses the existing `DELETE` reset. For an optional template, deleting the plan unloads it.
- `list_program_occurrences` is unchanged. An unloaded optional template stays `seeded`, so the "planned" dot on the date rail appears only when something real was planned.

**Client:**
- `useProgramSessionPlanMutations` gets `load(templateId)`. It uses the same cache update and invalidation as save.
- `PlanDateColumn.jsx` splits the entries:
  - Required entries and loaded optional entries render as they do now (`SessionPlanCard` or `CompletedSessionCard`), in rule order.
  - Unloaded optional entries go into a new `OptionalTemplateSelector`.
- New `components/programs/days/OptionalTemplateSelector.jsx` (with a CSS module):
  - One card at the end of the column titled "Optional sessions" with a count.
  - Each row shows the template colour swatch, the name, a short "N activities across M sections" summary and an **Add to day** button. The button shows a spinner while loading and an inline error if it fails.
  - Rows are a list with a real `<button>` each, so they work with the keyboard and screen readers.
  - The card is hidden on past (read-only) dates. A logged optional session still appears there as a `CompletedSessionCard`.
  - The card is hidden when nothing is left to load.
  - It uses the alignment key `optional-selector`, so both columns line up.
- `SessionPlanCard.jsx`, for a loaded optional plan (`!entry.is_required`):
  - The header shows an "Optional" badge instead of the suffix.
  - The footer's left action reads **Remove from day** (the same DELETE as reset) instead of Reset. Resetting an optional plan means removing it and adding it again.
  - When the card has unsaved edits, Remove asks for confirmation.
  - After a successful add, focus moves to the newly loaded card, and after a remove it moves back to the selector.

Create Session is unchanged. Template-match credit still counts an optional template the user ran without loading it.

## Critical files

| Area | Files |
|---|---|
| New | `services/program_calendar_invariants.py`, `migrations/versions/<rev>_program_block_no_overlap.py`, `client/src/utils/programCalendarConflicts.js`, `client/src/components/programs/days/OptionalTemplateSelector.jsx` (+ `.module.css`) |
| Service | `services/_program_crud.py` (create/update block, update_program), `services/_program_days.py` (add/update/copy/schedule), `services/_program_helpers.py` (lock helper), `services/program_session_plans.py` (`is_loaded`, `load_plan`) |
| API / validation | `blueprints/programs_api.py`, `blueprints/program_session_plans_api.py`, `validators/programs.py`, `models/program.py` (`__table_args__` mirroring the constraints) |
| Agent | `services/agent_harness_preview.py`, `services/agent_harness_runs.py` |
| Client | `ProgramBlockModal.jsx`, `ProgramDayModal.jsx`, `ProgramDayScheduleField.jsx`, `hooks/useProgramDetailMutations.js`, `hooks/useProgramSessionPlans.js`, `utils/api/fractalProgramsApi.js`, `days/PlanDateColumn.jsx`, `days/SessionPlanCard.jsx` |
| Docs | `index.md` (Programs section: the invariants and the optional selector), plus this plan saved to `planning/program-calendar-invariants-and-optional-templates.md` |

## Tests

**Backend unit tests (`tests/unit/services/test_programs.py`).** Use the program-overlap tests at lines 72-97 as the pattern. Cases:
- Block overlap on create and on update, including touching edges (inclusive end).
- A block outside the program.
- start > end.
- Two weekly days on the same weekday in one block.
- A weekly day against another day's explicit date.
- A legacy dated day against a weekday day.
- A cascade that conflicts in a later block rolls back the whole operation.
- `copy_block_day` to an occupied date.
- `schedule_block_day` onto a date another day owns.
- A block resize that pushes days into a conflict.
- An unrelated edit still passes.

**New invariants unit tests.** Pure tests using `SimpleNamespace`, in the same style as `test_program_day_occurrences.py`.

**Integration tests (`tests/integration/test_programs_api.py`).**
- The 409 payload shape (`code`, `conflicts`) for the block and day routes.
- An `IntegrityError` from the exclusion constraint maps to the same 409.

**Plans (`tests/integration/…program_session_plans…`).**
- `is_loaded` per entry.
- `load` is idempotent, rejects required templates and rejects past dates.
- DELETE unloads.

**Agent.** In `tests/unit/test_agent_harness_service.py`, a create-block overlap and a schedule-day conflict each produce an `AgentHarnessError` with the right code in both preview and apply.

**Existing tests to update.** Integration fixtures that create overlapping days or blocks on purpose:
- Client tests `ProgramDayPane.test.jsx:81` and `createSessionProgramDay.test.js:45`. These keep their pure rendering intent, or are rewritten to a single day per date.
- Any backend fixture that schedules two days on one date. To find them, run the suite and grep for `day_of_week` duplicates.

**Client (Vitest):**
- `programCalendarConflicts` unit tests.
- `ProgramBlockModal`: inline overlap error and disabled save.
- `ProgramDayModal`: taken weekday hint and inline server conflict.
- `PlanDateColumn` / `OptionalTemplateSelector`:
  - Required templates are open and optional ones are listed.
  - Add calls `load` and moves the card into the column.
  - Remove returns it to the selector.
  - Past dates hide the selector.
  - A logged optional session shows as completed.

## Verification

1. `./run-tests.sh` (backend) and `cd client && npm test` (Vitest) pass. Run `alembic upgrade head` against the local Postgres. It must succeed, which confirms there are no legacy conflicts. Then run downgrade and upgrade again.
2. Manual pass with the `run` skill (app plus browser):
   - Create a block that overlaps another. The modal shows the inline error, and a forced API call returns 409.
   - Give two days in one block the weekday Monday. You get the inline "Taken by" hint, and saving is refused.
   - Schedule a reusable day onto a date that already has a day. The action isn't offered, and a forced call returns 409.
   - Open the Days view on an upcoming day with two required and three optional templates. Only the two required plans are open, and the selector lists the three optional ones.
   - Add two optional templates. They become editable plan cards and the date rail shows the planned dot.
   - Remove one. It goes back to the selector.
   - Reload the page. The state persists.
   - Check a past date. No selector, and logged optional sessions show as completed.
3. Agent: preview an overlapping `create_block` proposal and check that it fails with `program_block_overlap`.

## Addendum: existing data (2026-10-04)

The dev database did hold conflicts (an overlapping "Japan" block; "Testing" dates on top of the
daily "Daily Practice"), and the app runs migrations at startup, so a failing constraint blocks
boot. Migration `f1b3d5a7c9e2` therefore repairs violations before adding the constraints: the
less substantive overlapping block is undated (sessions first, then fewest overlaps), and on a
double-booked date the day with more sessions keeps it while the other definition loses only
the colliding schedule row, weekday, or legacy date. Repairs are logged; downgrade drops only the
constraints.
