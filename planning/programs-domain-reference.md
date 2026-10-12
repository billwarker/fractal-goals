# Programs — domain and UI reference

> The complete Programs description moved verbatim out of `index.md` on 2026-10-12 so the
> index stays an architectural map. This is the detailed reference for program days,
> calendar invariants, the occurrence evaluator, statuses, metrics, the calendar feed, the
> Days workspace, and dated session plans. Feature-level design history stays in the
> linked planning documents.

Programs contain dated blocks and reusable program-day definitions. **Program days belong to the
program** (`program_days.program_id`), not to a block: a day's weekdays repeat across the whole
program span and its explicit dates may fall anywhere in it. Blocks only label and group the dates
they cover (`block_for_date`; an occurrence's `block` is null outside every block), so moving,
resizing, or deleting a block never changes which days occur. Ad hoc adjustments use `program_day_occurrence_exclusions` to suppress one date without
changing recurring weekdays. The canonical evaluator and client conflict previews subtract these
exceptions; `utils/programDaySchedule.js` owns the client schedule projection. The day-review card offers Move day and Remove from this date for any program date, using shared
Button/Input atoms. A move draft lives in the calendar-context reducer: users can type a destination
or pick a date in the calendar without leaving the source review. On mobile, users collapse the sidebar
to access the calendar; selecting a date reopens it for confirmation. Picking never mutates schedules;
normal scope navigation clears the draft.
The program-day editor uses the current day name as its heading (falling back to Edit/New Program Day
when blank). Its fields scroll independently while the shared action footer stays visible and wraps
on narrow screens.
`POST …/days/<day>/move` atomically removes the source occurrence, replaces the destination,
and moves saved source plans, under program-first locking. Conflicting destination plans for the
same definition/template are soft-deleted; displaced definitions' plans remain dormant.
Move and unschedule clear affected manual date statuses and preserve sessions and session credits
on their original dates. Explicit scheduling clears that date's exclusion. Program duplication shifts and preserves
exclusions through the day-create `excluded_dates` field.
Days are managed program-scoped at
`/api/<root>/programs/<program>/days[/<day>[/duplicate|/schedule|/unschedule|/move|/goals]]`, and
`PUT …/days/order` sets their side-pane order (`day_number`) from the full list of day ids; **Duplicate**
copies templates, goals, and notes without a schedule. Blocks can **track weeks**
(`track_weeks`, `week_start_day` 0 = Monday): Week 1 starts on the block's start date and each
later week on the chosen weekday. `services/program_rollups.block_weeks` and
`client/src/utils/programBlockWeeks.js` share one definition, tested against
`tests/fixtures/block_weeks_cases.json`; the calendar shows W1, W2… chips, the day pane shows "Block · Week n",
and the Days tab's rails sit under block and week buckets. See [Program-level days and block weeks](program-level-days-and-block-weeks.md).
Program scope is resolved by `services/program_scope.py`; execution metrics use bounded read models
rather than client recomputation.

Program-day goals are optional and bounded by the program's goals and their descendants
(`services/program_focus.py`), on every write path. Narrowing a program's goals so existing day
goals fall outside returns 409 `program_day_goal_out_of_scope` with a `conflicts` list until resent
with `prune_day_goals`; pre-existing violations never block unrelated edits. Sessions started from a
program day are scoped to the day's goals, else the program's. Blocks carry no goals of their own:
`program_block_goals` is retained legacy data that nothing reads or writes. The calendar pane's
Blocks section (`components/programs/ProgramBlocksPanel.jsx`, program scope only) shows one summary
per block from `buildBlockCards` (`utils/programBlocksViewModel.js`) over metrics v9: program days by
status symbol, consistency, goals completed and goals due (program goals and descendants with a
deadline inside the block), and longest streak, with edit and delete controls. See
[Goal-focused program blocks](program-blocks-goal-focus.md).

Two calendar invariants hold on every write path (UI, API, agent proposals):
`services/program_calendar_invariants.py` rejects overlapping blocks (inclusive ranges, inside
the program's dates; backed by the `ex_program_blocks_no_overlap` exclusion constraint) and any
date holding more than one program day (checked after flush through `build_occurrences` across
the whole program, so weekday and explicit dates count alike; explicit dates outside the program are
400 `program_day_date_outside_program`). Every calendar write takes the program row lock
first. Violations are `ProgramServiceValidationError`s with `program_block_overlap` /
`program_day_date_conflict` codes (409) and a `conflicts` list; `utils/programCalendarConflicts.js`
mirrors them as editor hints (taken weekdays and dates, sibling-block overlap), and the block and
day modals show server conflicts inline.
Migration `f1b3d5a7c9e2` repairs pre-existing violations at startup before adding the constraints:
an overlapping block with fewer logged sessions is undated (kept, off the calendar), and on a
double-booked date the day with more sessions keeps it while the other loses only that schedule
row, weekday, or legacy date. Each repair is logged.

`services/program_day_occurrences.py` is the canonical calendar evaluator. It owns the seven
day states, stable chain roles, and per-calendar-day completion semantics. When definitions
overlap, required/completed templates are deduplicated and the strongest configured
`completion_min_templates` threshold applies once for that date. Scheduled completion credits
completed, non-deleted sessions on the occurrence's local date from one of three sources: an exact
program-day link, a template match (an unlinked or same-program session using a scheduled template),
or a manual credit mapping the session to a scheduled template. Stored exclusions remove automatic
credit. `program_day_session_credits` holds manual credits/exclusions per program/date/session; rows
are dormant when the session's local date or the schedule no longer matches. Every evaluator caller
loads candidates through `services/program_day_credits.py`, so calendar, metrics,
day review, and Create Session day options attribute sessions identically.

Manual Complete and Rest statuses are stored once per program/calendar date and resolved by the
same evaluator. Complete changes adherence and chain success without fabricating session evidence;
Rest removes the scheduled date from adherence and bridges chains. Clearing a status restores
automatic evaluation. Definition-level completion flags are legacy compatibility data and are not
written or used by calendar, metrics, onboarding, create-session day options, or session-completion workflows.
The day-review pane places one clickable effective-status icon beside the first scheduled day
name: a blue circle while scheduled, a check when met, a moon for rest (manual or event-protected),
or an X when missed. Its dropdown options carry the same symbols and mark the current manual status. Its dropdown escapes
the pane's scroll clipping; when definitions overlap, its actions apply to every definition on
that date. The calendar has one multi-day selection mode for block ranges, bulk statuses, and
calendar events. Any date inside the selected program is selectable; `useCalendarDragSelection` owns
the gestures (press-and-drag selects the range between cells, including over event ribbons, with a
live preview; a press without movement toggles one date; Shift extends), so FullCalendar's own
selection and clicks stand down in that mode. Status actions apply only to the scheduled subset;
**Plan event** spans the whole selection. Cells are keyboard-selectable and highlighted when selected.
The client expects program metrics calculation v9 and day read model schema v7 (occurrence `block`
may be null and carries `week_index` for tracked blocks).
Metrics v9 reports **consistency** (met scheduled program days over observed ones; rest and
event-protected days excluded). `services/program_rollups.py` holds the pure date records, block
weeks (Week 1 from block start; later weeks from the tracked start weekday, else every 7 days; short weeks are partial), consistency rollups, status counts,
and longest streak; `services/program_block_metrics.py` builds the block, week, program-day,
`current_block`, and schedule-outlook rows plus each block's `goals: {due, completed}`.
Calendar day ribbons use the same status symbol as the day-review pane (check, X, or blue circle from
`getProgramDayStatusSymbol` and `ProgramDayStatusMark`; the day read model is authoritative for
completion when available, including manually credited sessions. The date streak advances only when
all scheduled program days on that date are met. Symbols are decorative beside each ribbon's
assistive state text.
The page calendar has one toolbar on desktop and mobile (‹ › Today, a **Continuous** checkbox, title,
multi-day actions); compact calendars keep FullCalendar's header. Calendar content comes from one
root-scoped feed, `GET /api/<root_id>/programs/calendar-feed` (`ProgramCalendarFeedService`, schema
v1, at most 62 days), loaded by `useProgramCalendarFeed` in calendar-month chunks for the rows
actually on screen (the month grid, or the scrolled continuous rows) plus one month of idle-time
overscan. Each chunk carries overlapping programs and blocks, every program's canonical date facts
(built by the same `build_range_facts` path as the day read model) with light occurrence ribbons,
completed sessions once (credits unioned across programs), and calendar periods. Chunks are cached
under stable keys nested in the day-read-model root, so root-level read-model invalidation refreshes
them; they revalidate with a weak ETag (`304` when unchanged), and a loading month shimmers only its
own cells. `/programs/calendar` returns only every program's name, color, and span. Full program
detail loads only for the scoped program's side pane and editors. Clicking a date or program-day label within a
program immediately scopes the sidepane to that program. Every program keeps its color across its
date range and its name appears in its first date cell. Empty-space clicks
preserve a selected completed program's context; that context is page-local, so reloading or returning
to the Programs page starts with the active program. Unscheduled past dates do not offer program
creation.
Continuous mode (a per-viewer
localStorage preference) renders one unbroken stream of weeks as a custom `dayGrid` view with a weeks
duration; `utils/programCalendarContinuous.js` owns its window: 52 weeks (the day read model allows
366 days) centred on today, re-centred on a context date or navigation target that cannot scroll to
the top row within it. The 1st of each month shows a small month caption beside its number. The
title is the month of the top row's Thursday; ‹ › scroll to a month's first Thursday.
Streaks are drawn from the server's `chain_role`/`run_length_at_date` (never recomputed in the
client): a thin green line on the date row starts mid-cell on a run's first day, crosses member days,
is dashed across bridging rest/event days, and ends in a compact length ("3d", full text in the
tooltip and assistive text) on the run's last day (`utils/programCalendarStreaks.js`).
A definition is scheduled on weekdays (`day_of_week`) every `repeat_every_weeks` weeks (a positive
integer, default 1) and/or on specific dates. Week zero is the Monday–Sunday week containing the
program start; only weeks whose index is divisible by the interval recur. The program bounds still
clip the first and last week. Explicit dates remain independent of the interval, and exclusions
suppress either kind of occurrence. The editor shows an optional interval field to the right of the
Weekly / Specific dates toggle in Weekly mode, wrapping below it on narrow screens
(blank means 1), and occupied weekdays show owners in hover/focus tooltips instead of a paragraph.
Weekday availability and save conflicts use the same actual cadence and exception projection.
Program copies preserve the interval, anchored to the copied program's start week.
Specific dates are only
ever written as `program_day_occurrence_schedules` rows: the Program Day modal sends a replace-all
`scheduled_dates` set (app schemas only; agent proposals keep the base contract and schedule one date
at a time). The legacy fixed `program_days.date` column is gone (migration `b8d4f2a6c1e3` moved it
into schedule rows, merged identical per-block copies, and pinned every calendar to its old dates).
Reusable definitions are scheduled onto dates through `program_day_occurrence_schedules`
(`schedule_program_day` writes a row, never a placeholder session); the evaluator treats those dates
as occurrences, and the day pane keeps "Plan this day" available for today and future dates.
Scheduled occurrences on past, present, and future dates offer "Move day" and "Remove from this date";
recurring occurrences use persistent date exclusions rather than changing weekday rules.
Calendar events (`calendar_periods`,
`services/calendar_periods.py`, `/api/<root_id>/calendar-periods`) are fractal-wide, named spans such
as vacations. Precedence for a scheduled date is manual override, then a streak-protecting event
(only when the date would not otherwise be met; it becomes rest with `status_source: "period"`),
then automatic evaluation. Events render as hatched spanning bars, as a banner in the day pane, and
as a protected-day count in the overview.
In multi-day mode, the sidebar requests metrics for the exact selected scheduled dates, excluding
gaps from adherence, evidence, and block totals. Non-contiguous selections use a compact
"N selected days" heading rather than displaying the misleading first-to-last date range.

The day-review pane is review-first: its one session list covers every session on the date, labelled
credited (with source), off-plan, or other program, with per-session goal alignment (the same
equal-split allocation as program metrics, via `services/program_day_summary.py`) and server-provided
credit options. Off-plan sessions sit inside the first program-day card; planning actions appear only
for today and future unscheduled dates. Range summaries list each observed date's completed sessions
(any program, with session and template names plus template color); the calendar shows those sessions
on scheduled and unscheduled dates, using the shared session-template badge when available. Scheduled
program-day ribbons and their status symbols remain visible alongside the session badges; the legacy
program-payload session events are not rendered on the Programs page. Multiple completed sessions
using the same template on one date are represented by one badge with a count (for example, “×4”).
Sessions credited to a specific program-day occurrence render inside that ribbon on a line below it.

`ProgramDayReadModelService` emits schema v7, requires an IANA timezone, caps the complete
expanded chain window at `MAX_WINDOW_DAYS`, reports truncated context, and provides cursor-paged
day detail. The client rejects unsupported schema versions. FullCalendar block labels are
reconciled idempotently, cleaned on cell unmount, and activated through React event delegation.

Block summary cards use one layout in `programs/blocks/BlockHeaderStats`: status counts on a
separate row, followed by three metric columns on desktop. On mobile, the metrics become full-width
label/value rows with horizontal dividers, and values wrap to keep large counts visible.

The Days workspace selects program days through the sidebar on every screen size. Mobile opens
it with Show Sidebar; the duplicate day dropdown is removed. The selected day's centered heading and
block, week, and date rails remain visible in the workspace.

The Programs page has **Calendar** and **Days** views. On desktop the side pane leads with the view toggle and a Collapse control; the header's Show/Hide Sidebar button reopens it, and its open state is remembered per fractal. At program scope a Details | Goals toggle sits beneath the pane's header: Details shows headline metrics, events, then the program's blocks (whole-program results; block name in its colour, status counts, and one row of Consistency, Goals completed/due, and Longest streak), and Goals shows the goal hierarchy. A selected timeframe shows Details only, and a scoped date shows the day review;
mobile keeps Calendar/Days in the header and places Show Sidebar in a fixed, full-width footer using the shared secondary HeaderButton styling and Session Detail's spacing, with safe-area spacing and reserved content space; bulk calendar actions sit above it. The footer is available even without a selected program, portalled outside the page animation, and stays beneath modal sheets. The pane remains a closable sheet. Days (`components/programs/days/`) programs
one program day's occurrence dates in two columns: a focused date (by default the next program day)
beside the latest completed occurrence before it (else the previous one), each with its canonical
status mark and credited sessions. A template completed on a date shows its session in the plan card
layout (its sections, logged sets, and circuit rounds), aligned with the plan beside it; past days are read-only; upcoming dates show editable plans. Required templates are always open; optional templates wait in an **Optional sessions** selector until loaded into the date, which stores their seeded plan (`POST …/plans/<template>/<date>/load`, idempotent; `is_loaded` on each day-plan entry). **Remove from day** deletes that plan. On this tab the side pane lists every program day once (schedule summary, next date, its dates by
status with consistency (`programDayStats`, the block rollups' rules), templates,
and an Edit button; days without templates are listed and prompt for one) between a **Compare two
days** toggle at the top and a pinned **New program day** footer, and each column has its own date rail (canonical status marks; A picks the comparison, B
the date being planned). Above each rail, a ruler of **block** and **week** buckets (`utils/programDayBuckets.js`,
`PlanBucketRows.jsx`): block names in the block's colour, the selected block's weeks beneath it.
The selected date marks its block and week; picking a bucket jumps the rail to the first date in
that period (the rail keeps every date). Weeks follow the block's tracked start day, or 7-day steps
from its start when untracked; buckets without this day's dates are dimmed. One program-wide request, `GET /api/<root>/programs/<program>/plan-occurrences`,
evaluates all days in a single evaluator pass.
Compared columns line up row by row: cards, sections, items, and (through each editor's `alignKey`,
`planRowAlignKey`) set rows and circuit rounds and their activities, keyed by activity so logged runs
pair with plans. "+ Add activity" (`days/PlanItemPicker.jsx`) is the session page's full picker:
search, create or copy activities and circuits (create-from-search included); new definitions join
the unsaved draft and default to the scoped goal, else the day's goals. The Days side pane has the
same Details | Goals toggle: Goals (`days/PlanGoalHierarchyPanel.jsx`) is the session page's goal
hierarchy for the active plan card (last clicked; default the planning column's first), built by
`utils/planGoalsView.js` in the server's session goals view shape (day goals, else program goals, plus
activity and group goals, with ancestors) and rendered through `useSessionGoalsViewModel` and the
shared `useGoalHierarchyHighlights`. A logged session card uses that session's own goals view and
instances. A goal's icon scopes the active card's picker; scope clears on day change, on leaving
Days, or when the active card's hierarchy lacks the goal. Past cards highlight goals but never scope.
Within a circuit, each round's activities are selectable (item → round → member, as on the session
page); a member stands for its activity in the Goals pane. Clicking a card's empty space deselects.
See [Days alignment, picker, and goals](program-days-alignment-picker-goals.md).
`program_session_plans` (`services/program_session_plans.py`, `blueprints/program_session_plans_api.py`)
holds one dated plan per program day, template, and date: an independent snapshot of the template's
sections whose items may be added, removed, or reordered (sections stay fixed) and carry prescriptions.
Plans are virtual until first saved: an unplanned occurrence **is the template**, so edits to one date
never reach another. The latest earlier plan still on an occurrence date is reference only (`previous`):
its values show as placeholders by `item_key`, never copied. Saves use `row_version` (409 on conflict); template
edits never rewrite plans, which report `template_changed` and offer an explicit pull that keeps
planned values by `item_key` and plan-added items. Plans off the schedule are dormant and never supply placeholders.
Create Session offers today's occurrence plan, then unexecuted plans from the previous 14 days; a
chosen virtual plan is materialized in the session's transaction and linked by
`sessions.program_session_plan_id`. Agent proposals keep the base session contract without plans.

Detailed design:

- [Program days and dated session plans](program-days-session-plans.md)
- [Program calendar and chain read model](programs-scoped-sidepane-chain-calendar.md)
- [Program metrics](program-metrics-insights.md)
- [Program-aware session creation](program-aware-create-session.md)
- [Manual and bulk program-day statuses](program-day-manual-statuses.md)
- [Day review summary and session credit](program-day-review-summary-and-credit.md)
- [Calendar events and occurrence scheduling](program-calendar-periods-and-scheduling.md)
- [Viewport-driven calendar feed](program-calendar-viewport-feed.md)
- [Calendar invariants and optional templates](program-calendar-invariants-and-optional-templates.md)
