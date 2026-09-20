# Manual and Bulk Program-Day Statuses

**Implementation status (2026-09-16):** Implemented and browser-verified on desktop and mobile.

## Canonical semantics

`program_day_status_overrides` stores an optional `complete` or `rest` override for one
program/date. The scheduled definitions and completed linked sessions remain unchanged. The
canonical occurrence evaluator reports both `automatic_state` and the effective `state`, plus
`status_source` and `manual_status`.
Create-session day options expose the occurrence-level `manual_status` (not a definition-level
completion flag), so its today banner can show Complete or Rest without claiming sessions occurred.

- Complete is allowed through the user's local today and counts as adherence/streak success.
- Rest is allowed on any scheduled date, is excluded from adherence, and does not break chains.
- Automatic deletes the override and restores evidence-derived behavior.
- Template completion statistics always describe real completed sessions.
- Overrides on dates made unscheduled by later plan edits remain stored but inactive.
  Automatic can still clear such dormant overrides through the API.

## Mutation contract

`PATCH /api/{root_id}/programs/{program_id}/day-statuses` accepts unique ISO `dates`, `status`,
`timezone`, and `acknowledge_completed_evidence`. It locks the program and validates every date
before writing, so bulk changes are atomic and idempotent. Resting dates with completed linked
sessions requires an acknowledged retry; the sessions are preserved.

## Client behavior

The day pane exposes date-level controls from a state icon beside the first scheduled definition
name (blue circle, check, or X); its dropdown is viewport-positioned outside the scroll pane, so
overlapping definitions share one unclipped status menu. The calendar omits the redundant Manual
badge. A single calendar multi-day
mode supports block-range creation and bulk status changes on arbitrary scheduled dates, including
Shift selection, click-and-drag across eligible scheduled cells, keyboard activation on scheduled cells, cancellation, and a
persistent bulk action bar. Successful
mutations invalidate day read models, program metrics, and program calendar data.
Calendar day ribbons do not render extra completion checkmarks; their effective state is still
announced to assistive technology and shown in the day pane.
The selected-timeframe overview sends the exact selected dates to the metrics endpoint. Counts,
evidence, blocks, and goal outcomes exclude unselected gaps; selected-day streaks reset across
calendar gaps. Sparse selections show "N selected days" in headers, while contiguous selections
retain a date-range label.
`GET /api/{root_id}/programs/{program_id}/metrics?dates=YYYY-MM-DD,...` accepts up to 366 ISO
date values, deduplicates them, and requires them to lie in the program and one 366-day window.
It cannot be combined with `range_start`/`range_end`.
It returns the normalized dates in `window.dates`; existing range queries retain their contract.

The previous definition-level completion service method and duplicate model evaluator were
removed. The historical `program_day_sessions` table remains readable by analytics for existing
data but is never written or treated as a status authority.
