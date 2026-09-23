# Programs Calendar: Text Alignment, Reliable Future Planning, and Time-Off Periods

**Implementation status (2026-09-23):** Implemented and covered by backend unit/integration/budget
tests and client component/hook tests. Deviations and follow-ups agreed during implementation:

- **Naming:** user-facing copy calls periods **events** ("Plan event…", "Plan an Event", "Edit event");
  the data model and API keep `calendar_periods`.
- **Creation:** events are created from the calendar's multi-day selection. Selection now accepts any
  date inside the selected program; status actions use only the scheduled subset, and Plan event spans
  the full selection. Program Options → Plan an Event enters selection mode instead of opening an
  empty form. Clicking an event bar opens its editor (FullCalendar reports the event, not the clicked
  cell, so "open the clicked day" was not reliable); the day banner's Edit covers day-scoped access.
- **Gestures:** a new `useCalendarDragSelection` hook replaces FullCalendar's native date selection in
  multi-day mode, fixing drags that start or pass over event ribbons and supporting click-to-toggle
  in the same mode.
- **Headers:** both the day and multi-day sidepane headers drop the program back button; background
  click returns to program scope.
- **Legacy data finding:** `uq_sessions_one_active_per_owner_root` allowed only one incomplete session
  per owner and fractal, so the old placeholder scheduling could never hold more than one future day
  per user. The local backfill produced one schedule row.
- **Agent schema:** the published proposal schema keeps `session_start` as a compatibility input for
  `schedule_program_day`; `date` is now accepted and canonical.
- **Streak chain:** the calendar now renders the previously deferred chain as a thin green line on
  the date row, linking met days (dashed across bridging rest/event days), with a compact "Nd"
  length on each run's last day. It supersedes the "no chain line" note in
  programs-scoped-sidepane-chain-calendar.md.
- **Budgets:** metrics +2 queries (schedules batch, periods), comparison +2, day detail 34.

## Context

Four follow-ups to the day-review work:

1. **Text colours don't match.** Goal deadline pills use `--color-text-primary`. Completed-session text on unscheduled days uses `--color-text-secondary`, so the two look unrelated.
2. **Scheduling a day doesn't show it.** "Plan this day → Schedule ‹day›" calls `ProgramService.schedule_block_day` (`services/_program_days.py:273`). That creates an **incomplete placeholder Session** at noon with `program_context`; it does not create an occurrence. The canonical evaluator (`program_day_scheduled_on` / `build_occurrences` in `services/program_day_occurrences.py`) only recognises dated definitions and weekday recurrences, so the scheduled day never appears in the sidepane or calendar. The placeholder also pollutes the Sessions list, and `unschedule_block_day_occurrence` has to scan *all* incomplete sessions in the fractal to undo it. ("New day in ‹block›" works, because it creates a dated definition.)
3. **Planning disappears on scheduled future days.** `ProgramDayPlanCard` only renders when a date is unscheduled.
4. **Time off has nowhere to go.** A vacation can only be expressed by bulk-marking each scheduled date Rest. That stores no name, no date span and no intent, doesn't cover days added to the schedule later, and discards any work actually done.

**Decisions confirmed:**
- A rest period protects only days that would otherwise break the streak. Days the user still completes count as met and extend it.
- Periods are fractal-wide: they apply to every program whose dates they overlap.

---

## Grade of the current implementation against this plan: **B**

| Area | Grade | Why |
|---|---|---|
| Canonical evaluator | **A−** | One evaluator with overrides, credits and a bounded chain window. Adding another status source is a small, contained change. |
| Occurrence write model | **D** | Scheduling a reusable definition on a date writes a fake session, not an occurrence. It is invisible to the evaluator, unschedule scans every incomplete session in the fractal, and agent proposals repeat the same pattern. |
| Status overrides | **B+** | Per-date `complete`/`rest` rows are atomic and reversible. But they are per-program and per-date, have no span or label, and cannot express "excuse this time off unless I trained". |
| Calendar/pane presentation | **B** | One status symbol and consistent ribbons. Colours drift between event types, and there is no multi-day event concept. |
| Planning UX | **C** | The primary scheduling action silently does nothing visible, and planning is unavailable on already-scheduled future days. |

**S+ target:**
- Every way of putting work on a date produces a real occurrence that the one evaluator sees.
- Time off is a first-class, named, fractal-wide period, and the evaluator resolves it with explicit precedence.
- The calendar and the pane explain *why* a day did not break the streak.
- No placeholder sessions are written.

---

## 1. Align calendar text colours (small)

- `.eventPillCompletedSession` in `client/src/components/programs/ProgramCalendarView.module.css` changes to `color: var(--color-text-primary)`, matching `.eventPillGoal`.
- Both share `.eventPillText` (11px/500), so no other change is needed.
- Add a shared comment above the two rules so their text treatment stays in lockstep.

## 2. Occurrence schedules replace placeholder sessions

**Data model.** New table `program_day_occurrence_schedules`, created by an additive Alembic migration and modelled in `models/program.py` beside `ProgramDaySessionCredit`:

```
id PK, program_day_id FK program_days ON DELETE CASCADE, date DATE NOT NULL,
created_by_user_id FK users SET NULL, created_at
UNIQUE (program_day_id, date); INDEX (date)
```

`ProgramDay.occurrence_schedules` relationship, selectin-loaded wherever `template_links` are loaded (`ProgramService._program_serializer_load_options`, `ProgramMetricsService._read_options`, and the day-options loader in `_program_days.py`).

**Evaluator** (`services/program_day_occurrences.py`):
- `program_day_scheduled_on(day, block, date)` is also true when `date` is one of the day's explicit schedule dates *and* inside the block.
- `build_occurrences` iterates weekday matches ∪ explicit schedule dates, still bounded to the requested range.
- Everything downstream (credits, metrics, day options, calendar, pane) picks this up with no other change.

**Write path** (`services/_program_days.py`):
- `schedule_block_day` validates that the date is inside the block, and rejects a date the definition already covers (`already_scheduled`).
- It then upserts one schedule row, bumps `row_version`, emits `PROGRAM_DAY_SCHEDULED` with `date` and no `session_id`, and returns the serialized occurrence `{program_day_id, date}`.
- It takes `date` (ISO). `session_start` is accepted for one release and reduced to its local date.
- `unschedule_block_day_occurrence` deletes the schedule row. The fractal-wide incomplete-session scan is removed; it only deletes legacy placeholder sessions for that exact day and date that have no activity instances.
- Update the agent callers: `services/agent_harness_runs.py:508` and `services/agent_harness_preview.py:401` (preview shows an occurrence, not a session), plus `blueprints/programs_api.py:461` and its schema.

**Legacy data.** The migration backfills schedule rows from existing placeholder sessions. It finds sessions whose `attributes.program_context.day_id` is set that are not deleted, not completed, and have no activity instances, and creates one row per (day, local date of `session_start`). The placeholders themselves are **not** deleted by the migration. Removing them is a destructive clean-up that belongs in a separate, explicitly approved step, per `docs/architecture/MIGRATION_POLICY.md`. This is listed in the retirement table.

**Client:**
- `useProgramLogic.scheduleDay` (`client/src/hooks/useProgramLogic.js:113`) sends `{ date }`.
- It uses the existing `invalidateScheduling` refresher, which already covers `programDayReadModelRoot`, metrics and day options.
- The pane re-fetches and shows the new program-day card immediately.

## 3. Planning is always available for today and future dates

- In `client/src/components/programs/ProgramDayPane.jsx`, `ProgramDayPlanCard` renders for every `date >= today`, scheduled or not, below the program-day cards.
- It lists only reusable definitions not already occurring on that date, plus "New day in ‹block›".
- Each explicitly scheduled occurrence on a future date gets a quiet **Remove from this date** action, calling the existing unschedule endpoint.
- Recurring (weekday) and dated definitions stay edit-only in the Blocks view. This keeps the earlier rule: authoring lives in Blocks, and only date-level scheduling happens in the pane.

## 4. Calendar periods (vacations and other time off)

### Data model

New table `calendar_periods`, fractal-scoped and user-owned. It uses a new model and migration in `models/calendar_period.py`, exported from `models/__init__.py`:

```
id PK, root_id FK goals ON DELETE CASCADE, owner_id FK users ON DELETE CASCADE,
name TEXT NOT NULL (≤120), kind TEXT CHECK IN ('vacation','travel','illness','other'),
start_date DATE, end_date DATE  CHECK (end_date >= start_date),
protects_streaks BOOLEAN NOT NULL DEFAULT true, notes TEXT NULL,
created_at, updated_at, deleted_at NULL
INDEX (root_id, start_date, end_date)
```

The maximum span is 366 days. Soft-deleted periods never contribute.

### Canonical semantics

The evaluator takes `periods=` as a list of `{id, name, kind, start_date, end_date, protects_streaks}`. Precedence for a scheduled date:

1. A **manual override** (`complete` or `rest`) wins, as today.
2. Otherwise, if the date is inside a streak-protecting period **and** its automatic state is not met, the state becomes `rest`, with `status_source: "period"` and a `period_id`. It is excluded from adherence and bridges the chain, exactly like manual Rest.
3. Otherwise, the automatic state applies. A met day inside a period stays `scheduled_met` and extends the streak.

More rules:
- Periods with `protects_streaks: false` are informational only (for example, noting travel while still training). They are never applied to state.
- Unscheduled dates inside a period keep their states. The period is still reported on the fact (`period_ids`) for display.
- Future dates inside a protecting period are reported as `rest`. The calendar and pane then show planned rest ahead of time, and the day can never become missed.
- Every fact gains `period_ids`. The range summary adds `period_rest_dates`, and the response gains a top-level `periods` array of the periods overlapping the range, so the client never recomputes coverage.

### Loading and callers

- A bounded loader, `load_calendar_periods(db, root_id, owner_id, start, end)`, goes in a new `services/calendar_periods.py`.
- All four evaluator callers pass `periods=` to `build_day_facts` or the occurrence evaluation: read model, metrics, program comparison, and day options, which adds `period` to its manual-status banner.
- That is one additional query per request, and budgets are updated with measured values.
- Bump `CALCULATION_VERSION` 5 → 6 and read-model `SCHEMA_VERSION` 4 → 5, along with both client constants.

### API

A new blueprint `blueprints/calendar_periods_api.py`, with a validator in `validators/calendar_periods.py` and a service in `services/calendar_periods.py`:

- `GET /api/<root_id>/calendar-periods?start=&end=` returns the periods overlapping a bounded window.
- `POST /api/<root_id>/calendar-periods` creates one.
- `PUT /api/<root_id>/calendar-periods/<id>` updates one.
- `DELETE /api/<root_id>/calendar-periods/<id>` soft-deletes one.
- Rules:
  - The owner must own the fractal.
  - Dates must be ISO, with `end_date >= start_date` and a span of at most 366 days.
  - Overlapping periods are allowed; overlap simply unions coverage.
  - Mutations emit `CALENDAR_PERIOD_CREATED/UPDATED/DELETED` after commit, with event-logger labels.
- Client: `fractalCalendarPeriodsApi`, `queryKeys.calendarPeriods(rootId, start, end)`, and a hook `useCalendarPeriodMutations`. On success it invalidates `calendarPeriods`, `programDayReadModel` for the root, `programMetricsRoot` and `programDayOptions`.

### Creation UX

- The existing multi-day selection bar (`ProgramDayStatusBulkBar.jsx`) gains **Plan time off…**. It opens `CalendarPeriodModal` prefilled with the first–last selected dates. Non-contiguous selections span their outer bounds, and the modal says so.
- The Program Options menu gains **Add time off**, which opens the same modal with empty dates.
- The modal has fields for name, kind, start date, end date, a **Protect streaks** toggle (on by default, with the helper text "Scheduled days you don't complete become rest days and won't break your streak"), and notes.
- In edit mode it also has **Delete**, with confirmation built into the modal.

### Calendar display

- Each period renders as one FullCalendar all-day event spanning its dates, `type: 'calendar_period'`, `sortOrder: -5`, so it sits above the ribbons.
- It is a thin, full-width bar with a hatched neutral background (a CSS repeating gradient on tokens), the kind label and the name, e.g. "Vacation · Lisbon". This makes it distinct from program blocks, ribbons and goals.
- Clicking it opens the day pane for the clicked date. Keyboard activation matches goal pills.
- Covered ribbons whose state is period-rest show the existing "Rest" label, and the status symbol stays the scheduled circle. Cell assistive text reads "‹day›: rest day (Vacation)".
- Periods come from the day read model's `periods`, so they show whichever program is selected. No program selected falls back to `GET /calendar-periods` for the visible range.

### Sidepane display

- **Day scope:** a period banner card sits at the top of the pane, e.g. "Vacation · Sep 10–17 · Protecting streaks", with a one-line explanation.
  - When the day was excused: "Scheduled work wasn't completed; this day counts as rest."
  - When it was met anyway: "Completed during time off — counts toward your streak."
  - The card has **Edit** and **Remove** actions.
- **Day status menu:** shows "Rest (Vacation)" when `status_source === 'period'`. Choosing Complete, Rest or Automatic still applies a manual override, which takes precedence. The menu text says the period remains.
- **Range and program overview** (`ProgramOverview`): the adherence explainer lists "N days protected by time off" from `period_rest_dates`. Periods overlapping the window are listed with their dates.

---

## Verification

**Backend** (unit tests plus `tests/integration/test_programs_api.py`, a new `tests/integration/test_calendar_periods_api.py`, and `tests/performance/test_query_budgets.py`):
- Schedules:
  - A reusable definition scheduled on a date appears in the read model, metrics and day options.
  - A duplicate schedule is rejected.
  - Scheduling outside the block is rejected.
  - Unscheduling removes the occurrence.
  - No placeholder session is created.
  - The migration backfill maps a legacy placeholder to exactly one schedule row and leaves the session untouched.
  - The agent preview and run paths produce an occurrence.
- Period precedence:
  - Missed → rest (`status_source: period`), with the chain bridged.
  - Partial → rest.
  - Met stays met and extends the chain.
  - Manual complete or rest beats the period.
  - `protects_streaks: false` changes nothing.
  - Future protected dates are rest.
  - Unscheduled dates are unchanged but carry `period_ids`.
  - Boundaries: the first day, the last day, and the days just outside.
  - Overlapping periods union.
  - Soft-deleted periods are ignored.
- Metrics and read-model parity, including `period_rest_dates`.
- Period API:
  - Validation: reversed dates, a span over 366 days, an unknown kind, a name that is too long.
  - Tenant isolation returns 404.
  - Soft delete.
  - Event emission.
- Query budgets: measure and lock (+1 query per evaluator caller).

**Client:**
- The completed-session pill uses the primary text colour.
- The plan card renders on scheduled future dates and hides definitions already on that date.
- Remove from this date appears only on explicit schedules.
- `scheduleDay` sends `date`, and the pane shows the new occurrence after invalidation (hook test).
- The period modal covers create, edit and delete, validation, and prefill from a selection, including non-contiguous selections.
- The bulk bar gets its Plan time off action.
- Calendar period events are built from read-model `periods`, and the renderer produces the bar with assistive text.
- The day pane shows the period banner in both excused and met variants.
- The status menu shows the period source.
- The overview shows protected-day counts.
- Schema and calculation version rejection.

**Commands:**
```bash
fractal-goals-venv/bin/pytest tests/integration/test_programs_api.py tests/integration/test_calendar_periods_api.py tests/integration/test_program_day_session_credits.py tests/unit/services tests/performance/test_query_budgets.py
fractal-goals-venv/bin/alembic upgrade head   # local DB, after confirming the resolved URL is localhost
./run-tests.sh lint && ./run-tests.sh frontend && (cd client && npm run build)
```

**Manual (run the app):**
1. On a future date, choose Plan this day → Schedule ‹day›. The program-day card appears immediately in the pane and on the calendar, and no new session appears on the Sessions page. Remove it again.
2. On a future date that is already scheduled, confirm the plan card is still offered.
3. Select Sep 10–17 → Plan time off → "Vacation". A hatched bar spans the week, the missed days show Rest with no ✗, and the streak is preserved in the overview. A day you completed during the week still shows ✓ and extends the streak.
4. Edit the period (untick Protect streaks) and confirm the days revert to missed. Delete it and confirm automatic behaviour returns.
5. Check that goal deadline text and session text now match.
6. Check light and dark themes and mobile layout (period bar legibility, modal, bottom sheet).

## Documentation and retirement

- Update `index.md` (Programs): occurrence schedules, period precedence, calendar display.
- Save this plan to `planning/program-calendar-periods-and-scheduling.md`.
- Add retirement records:

| Item | Target | Exit condition |
|---|---|---|
| `session_start` input on the schedule endpoint | Release N+1 | All callers send `date` |
| Legacy placeholder sessions | Explicit cleanup step | Backed-up, approved deletion of backfilled placeholders with no activity |
| Agent proposal `schedule_program_day.data.session_start` | Next agent schema version | Agents send `date`; drop `session_start` from `ProgramDayScheduleSchema` and regenerate the artifact |
