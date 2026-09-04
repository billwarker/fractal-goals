# Programs Page: Scope-Driven Sidepane + Chain Calendar

## Status and quality target

**Target:** S+ production quality.

**Implementation status (2026-09-04):** Complete after dedicated visual-quality passes. Canonical occurrence and chain metrics, the range/detail read model, exact Create Session deep links, explicit program/day/range scope, conventional top-right dates, uncluttered goal deadlines, concise session-only day review, responsive sidepane hierarchy, cursor pagination, onboarding compatibility, query-budget coverage, CSS migration, and dead modal/model removal are implemented. Program-day cards and calendar ribbons use the same simple inline checkmark/x completion treatment, with accessible state labels preserved throughout. The day heading consolidates scope, date, collapse, and adjacent-day navigation without duplicating status or a redundant review eyebrow; equal navigation columns place the localized date at the true horizontal and vertical midpoint between the arrows. Multi-day selection scopes the canonical program overview metrics directly, supports both click-drag and anchored successive clicks, opens the pane, and labels the selected timeframe in its fixed header. The former competing range pane and standalone Insights workspace have been removed. Session rows resolve current or snapshotted template metadata, render the Sessions-page completion check beside the correctly colored template badge, include timezone-local start/end metadata, and show the block label in its own color. Day review is intentionally read-focused: definition editing, occurrence removal, and day-goal attachment live outside this surface. The visual chain is intentionally deferred because the compact connector treatment did not communicate clearly. The only compatibility surface is the documented `/active-days` alias through Release N+1; supported client code now uses `/day-options`.

This plan is implementation-ready only when the data contract, completion semantics, migration compatibility, performance budgets, accessibility behavior, and verification gates below are treated as acceptance criteria rather than optional polish.

The work is intentionally split into a canonical backend domain layer, a lightweight range projection, and an on-demand day-detail projection. Calendar, sidepane, and Create Session may render different projections, but they must not implement competing scheduling or completion rules.

---

## Pre-implementation audit (historical baseline)

### Product surfaces

The Programs page currently has two detail surfaces that under-deliver:

1. `ProgramSidePane` is static program-level content and does not respond meaningfully to calendar navigation.
2. `DayViewModal.jsx` contains useful day content, but blocks the calendar, duplicates visual primitives, and only supports one day at a time.

Calendar cells do not clearly distinguish successful, partial, missed, resting, and pending program days. The page therefore lacks a legible habit chain.

### Data and domain grade: **C+**

Strong foundations:

- Relational session linkage exists through `sessions.program_id`, `program_block_id`, and `program_day_id`, with an effective-start index.
- Program scope resolution is canonical and tenant-safe.
- Program-day template rules and `evaluate_program_day_completion` already encode required-template and `completion_min_templates` behavior.
- Template colors and goal-level icon configuration already exist.
- TanStack Query roots already support prefix invalidation for programs, metrics, sessions, and active program days.

Material gaps:

- `ProgramMetricsService` currently calls a scheduled date `scheduled_met` when it has any aligned activity evidence. That is not the same as satisfying the scheduled program-day template requirements.
- `metrics.days[]` has no partial or today-pending state and no requirement counts.
- `GET /programs/active-days` is single-date, uses `sessions` to mean template descriptors, and provides only completed-session counts.
- The active-days loader does not eager-load every relationship it serializes; expanding the current loop to a month would risk N+1 queries and excessive date-by-date work.
- The client has a fuzzy template-name fallback for session-to-day matching.
- `ProgramDay.is_completed` is a definition-level flag and cannot represent each occurrence of a recurring program day.
- `ProgramDaySession` is an append-only ledger without an occurrence date or deduplication. It cannot be authoritative for recurring-day status.
- `ProgramDay.notes` belongs to the program-day definition. It is not an occurrence-specific journal field.
- Create Session only resolves `program_day_id` against today's active days and does not support `template_id` or an arbitrary occurrence date.

### Dead and competing implementation policy

The implementation must converge on one completion evaluator and one occurrence builder. It must delete the fuzzy client matcher and stop reading drift-prone `ProgramDay.is_completed` or raw `ProgramDaySession` counts for occurrence status. Compatibility adapters may remain for one documented release only; they must call the canonical service rather than retain independent business logic, and their removal must be tracked in this plan.

---

## Intended outcome

The sidepane becomes the single non-blocking detail surface:

| Scope | Trigger | Sidepane content |
|---|---|---|
| Program | Initial state, background click, breadcrumb program segment | Program details, compact metrics, chain summary, goals, notes |
| Day | Click a day cell or a program event | Occurrences, requirements, templates, linked sessions, other work, goals, definition note, actions |
| Range | Drag multiple days or click a block label | Days met/partial/missed, chain breaks, duration, per-template completion, goals touched, Add Block when eligible |

The calendar shows status and a chain for the **currently selected program only**. All programs may continue to render their normal calendar events and backgrounds, but one date cell never merges adherence states from multiple programs.

Clicking an event belonging to another program switches the selected program before scoping the day. Clicking empty space in a cell keeps the current program if the date is within that program. It must not silently select the first overlapping program. If there is no current program for that date, the pane shows a neutral date state with available program choices rather than guessing.

The Calendar Day modal and its duplicate markup are deleted after parity is verified.

---

## Canonical domain semantics

### 1. Occurrence identity

A scheduled occurrence is identified by:

```text
(program_id, program_day_id, local_date, timezone)
```

`program_day_id` alone is insufficient because recurring definitions produce multiple dated occurrences. Every join between a session and an occurrence must require both `Session.program_day_id` and the session's effective local date. `template_id` is used to evaluate requirements but is not part of occurrence identity.

The effective session timestamp is `COALESCE(session_start, completed_at, created_at)`, converted from UTC to the requested IANA timezone before deriving `local_date`.

### 2. Authoritative completion

Extract a pure, tested occurrence evaluator shared by the day read-model and `ProgramMetricsService`. It receives:

- the program-day template rules;
- sessions precisely linked to the occurrence;
- the occurrence date and local today;
- whether the date is scheduled;
- aligned activity evidence for unscheduled dates.

For a scheduled occurrence, only completed, non-deleted sessions linked to that `program_day_id`, local date, and template contribute evidence. Calendar completion is evaluated per local date: overlapping definitions contribute one deduplicated template pool, required template IDs are unioned, and the strongest configured `completion_min_templates` threshold applies once.

One session may satisfy a template once; duplicate sessions are visible as extras but do not inflate the number of completed templates. Template names are never identifiers.

When multiple program-day occurrences land on the same local date, retain each occurrence for attribution and launch actions but evaluate the date once. Template IDs are deduplicated across definitions, required IDs are unioned, and thresholds are not added. The aggregate date is partial when at least one scheduled template is complete but the shared daily rule remains unmet.

### 3. Day states

The canonical states are:

| State | Meaning | Chain effect |
|---|---|---|
| `scheduled_met` | All requirements satisfied | Extends the chain |
| `scheduled_partial` | At least one scheduled template completed, but requirements are unmet | Breaks only when the date is closed |
| `scheduled_missed` | Closed scheduled date with no completed scheduled template | Breaks the chain |
| `scheduled_pending` | Today or a future scheduled date whose requirements are not yet met | Does not extend or break |
| `unscheduled_evidence` | No scheduled occurrence; aligned completed work exists on a closed/current date | Neutral; does not extend or break the scheduled chain |
| `rest` | Closed/current date with no schedule and no aligned evidence | Neutral bridge; does not extend or break |
| `upcoming` | Future date with no schedule | Neutral; does not extend or break |

`closed` means `date < local_today`. Today remains actionable and cannot be labeled missed before local midnight. A partial today is `scheduled_partial` with `breaks_chain: false`; the same unmet state becomes chain-breaking after midnight.

The backend returns facts rather than asking clients to infer them:

```json
{
  "state": "scheduled_partial",
  "observed": true,
  "closed": false,
  "counts_as_success": false,
  "breaks_chain": false,
  "broke_active_chain": false,
  "completed_template_count": 2,
  "required_template_count": 3,
  "requirements_met": false
}
```

Minimum-template rules remain on each occurrence's `requirements` object. They are
not summed into a synthetic day threshold when multiple occurrences share a date.

### 4. Chain semantics and presentation

The scheduled chain is calculated on the server from ordered canonical day facts:

- `scheduled_met` extends a chain.
- A closed `scheduled_partial` or `scheduled_missed` ends it.
- `rest` and `unscheduled_evidence` preserve a chain without increasing its length.
- `scheduled_pending` and `upcoming` neither extend nor end it.
- Current streak counts successful scheduled dates, not individual occurrences or elapsed calendar dates.
- Longest streak uses the same rule.
- A chain break is a transition from a non-zero run to a closed scheduled failure.

Each returned day includes `chain_role: start | member | end | single | bridge | none`, `run_length_at_date`, `breaks_chain`, and `broke_active_chain`. The final field is true only for the first closed failure that ends a live run, so every summary uses one chain-break definition. These facts support metrics and a future chain treatment, but the calendar intentionally renders no connector line for now. The previous short green segments were visually ambiguous and competed with event content.

Chain calculation includes up to 366 prior days plus one following day, bounding query and evaluator work independently of program age. Return `continues_before_range`, `continues_after_range`, `context_start`, and `context_truncated_before`; the last field explicitly identifies the rare case where a run may predate the bounded context instead of silently claiming whole-program precision.

This contract keeps streak metrics correct independently of whether the calendar renders a chain visualization.

### 5. Metrics semantics

`ProgramMetricsService.days[]`, adherence, template completion, block metrics, current streak, and longest streak must consume the canonical occurrence evaluator. Aligned activity evidence remains the source for alignment and `unscheduled_evidence`, but it cannot independently make a scheduled day met.

Increment `CALCULATION_VERSION` because adherence semantics change. Update calendar and accessible-state tests for all seven states. Existing persisted program/block completion flags remain write-side compatibility data only and are not read as analytics truth.

---

## API and read-model design

### Canonical service

Add a focused `ProgramDayReadModelService` (name may follow local service conventions) that owns:

- occurrence generation for a bounded local-date range;
- bulk loading and timezone bucketing of linked sessions;
- template requirement evaluation;
- aligned evidence bucketing;
- chain calculation;
- lightweight summary and detailed day projections.

`ProgramMetricsService` must call the shared occurrence/evaluation functions rather than duplicate them. Keep analytics-only aggregation in the metrics service.

### New program-scoped endpoint

Add:

```text
GET /api/<root_id>/programs/<program_id>/day-read-model
```

Required query parameters:

- `range_start=YYYY-MM-DD`
- `range_end=YYYY-MM-DD`
- `timezone=<IANA timezone>`

Optional:

- `detail_date=YYYY-MM-DD`, which must lie inside the requested range and requests the heavy detail projection for that date only.
- `session_limit`, valid only with `detail_date`, default 50 and maximum 100.
- `session_cursor`, an opaque stable cursor valid only with `detail_date`.

Rules:

- Both range bounds are required and inclusive.
- Reject partial bounds, `date` mixed with range bounds, reversed ranges, invalid dates, invalid timezones, and ranges over 366 days with HTTP 400.
- Return 404 for an inaccessible program without revealing cross-tenant existence.
- Clamp neither bound silently. Dates outside the program remain present as neutral days only when needed by the visible calendar grid; no occurrence is fabricated.
- Results are ordered by date, block order, program-day order, template order, and effective session timestamp with stable ID tie-breakers.
- Return and contract-test `schema_version: 2`; version 2 adds bounded-chain context metadata and canonical active-break facts.
- Day-detail session pagination is ordered by effective timestamp then session ID. Requirements and aggregate counts always cover the complete date, not merely the returned page.

Summary response shape:

```json
{
  "schema_version": 2,
  "program_id": "...",
  "timezone": "America/Toronto",
  "range": { "start": "2026-08-30", "end": "2026-10-10" },
  "chain": {
    "current_streak": 3,
    "longest_streak": 8,
    "continues_before_range": false,
    "continues_after_range": false,
    "context_start": "2025-08-31",
    "context_truncated_before": true
  },
  "range_summary": {
    "scheduled_dates": 12,
    "met_dates": 8,
    "partial_dates": 2,
    "missed_dates": 2,
    "pending_dates": 1,
    "evidence_dates": 1,
    "rest_dates": 4,
    "upcoming_dates": 10,
    "chain_breaks": 2,
    "longest_run_in_range": 5,
    "linked_duration_seconds": 14400,
    "template_completion": [],
    "goals_touched_ids": []
  },
  "days": [
    {
      "date": "2026-09-02",
      "state": "scheduled_partial",
      "observed": true,
      "closed": false,
      "counts_as_success": false,
      "breaks_chain": false,
      "broke_active_chain": false,
      "chain_role": "none",
      "run_length_at_date": 0,
      "duration_seconds": 1800,
      "aligned_instance_count": 2,
      "occurrence_count": 1,
      "completed_template_count": 2,
      "required_template_count": 3,
      "requirements_met": false,
      "block_ids": ["..."]
    }
  ]
}
```

When `detail_date` is present, add `detail`:

```json
{
  "date": "2026-09-02",
  "occurrences": [
    {
      "occurrence_key": "<program_day_id>:2026-09-02",
      "program_day_id": "...",
      "block": { "id": "...", "name": "...", "color": "..." },
      "name": "Daily Practice",
      "definition_note": "...",
      "goal_ids": ["..."],
      "requirements": {
        "required_template_ids": ["..."],
        "completion_min_templates": 3,
        "completed_template_ids": ["..."],
        "requirements_met": false
      },
      "templates": [
        {
          "id": "...",
          "name": "...",
          "description": "...",
          "color": "...",
          "is_required": true,
          "order": 0,
          "status": "completed"
        }
      ],
      "sessions": [
        {
          "id": "...",
          "name": "...",
          "template_id": "...",
          "template": { "id": "...", "name": "...", "color": "..." },
          "session_start": "...Z",
          "session_end": "...Z",
          "completed_at": "...Z",
          "total_duration_seconds": 1800,
          "completed": true,
          "is_paused": false
        }
      ]
    }
  ],
  "other_sessions": [],
  "goals_touched_ids": [],
  "sessions_page": {
    "next_cursor": null,
    "has_more": false
  }
}
```

`range_summary.template_completion` contains compact `{template_id, name, color, scheduled_occurrences, completed_occurrences}` rows. `range_summary.goals_touched_ids` is a distinct-ID aggregate from evidence inside the requested range. This supports range scope without embedding every occurrence or guessing from current program scope.

Program-day review intentionally stops at session granularity. Session rows contain identity, timing, duration, and execution state, then link to Session Detail for activities and other execution detail. The day read model does not load or serialize activity summaries; this keeps the sidepane scannable and removes activity eager-loading from the endpoint. Linked and other session rows share the day-detail pagination budget.

`other_sessions` means non-deleted sessions on that local date not linked to the selected program. It is loaded tenant-safely and labeled as other work, not credited toward scheduled completion. `goals_touched_ids` is derived from actual session/activity evidence in the detailed date projection, not from whole-program goal coverage.

### Definition notes and execution statuses

The pane labels `ProgramDay.notes` as **Schedule note** and explains that edits apply to every recurrence of that program-day definition. Editing uses the existing update-day mutation. Do not call it an occurrence-specific day note.

Template statuses in this project are initially `completed`, `in_progress`, or `pending`, derived from precisely linked sessions. Do not promise `skipped` or `substituted` until an occurrence-aware write model exists.

`ProgramDaySession` is not a read-model authority. During implementation, either:

1. add occurrence identity and uniqueness before using it for skipped/substituted states, or
2. leave it as a compatibility audit ledger and exclude it from status calculations.

Choose option 2 for this scope unless skipped/substituted authoring is explicitly added. Add a follow-up removal/normalization issue for the duplicate-prone ledger.

### Legacy `active-days` compatibility

Add the stable all-program Create Session projection:

```text
GET /api/<root_id>/programs/day-options?date=YYYY-MM-DD&timezone=<IANA timezone>
```

It returns a `schema_version` wrapper and explicitly named `templates` for every scheduled occurrence on that local date. It is a thin projection over the same canonical occurrence service and contains the exact program, block, occurrence, requirement, and completed-template IDs needed by Create Session. Add the corresponding `queryKeys.programDayOptions(rootId, date, timezone)` and `fractalProgramsApi.getProgramDayOptions` client API. This route is not a second source of business rules.

Keep `GET /programs/active-days?date=` for one compatibility release because Create Session currently consumes it. Preserve its existing response shape, including `sessions` meaning template descriptors. Implement it as a thin adapter over the canonical occurrence service; do not add range mode or overload the `sessions` key.

In the same implementation:

- migrate Create Session to `programDayOptions` and the stable day-options endpoint;
- add deprecation logging/telemetry for the legacy route;
- mark the Programs backend/client owners responsible for removal in release N+1;
- delete the legacy endpoint, API method, query key variant, and adapter in N+1 after telemetry confirms no supported client traffic.

This prevents a permanent competing read implementation and avoids an impossible JSON-key migration.

### Performance requirements

- Load programs/blocks/days/template links/goals with explicit eager-loading or select projections.
- Load linked sessions for the entire UTC-bounded range in one query and bucket in memory by precise occurrence identity.
- Load aligned evidence and detail-only other sessions in bounded bulk queries.
- Do not loop every date for every program day when recurrence expansion can iterate only matching weekdays/dates.
- Summary mode must not load activity summaries or other-session detail.
- Add performance tests with realistic month and 366-day fixtures.

Budgets to enforce in tests after measuring the existing harness baseline:

- Summary month: constant query count independent of occurrence/session count, target no more than 10 SQL statements.
- Detailed day: constant query count, target no more than 14 SQL statements.
- Metrics: no regression beyond the existing query budget after adopting canonical occurrence evaluation.
- No response body growth from detailed session/activity data in summary mode.

If the measured architecture requires different numeric ceilings, record the evidence and lock the lowest stable bounds before merge; do not omit the budget test.

---

## Client architecture

### Query keys and hooks

Add unambiguous keys:

```js
queryKeys.programDayReadModel(rootId, programId, timezone, rangeStart, rangeEnd, detailDate)
```

Create:

- `useProgramDayRange(rootId, programId, timezone, visibleRange)` for lightweight summaries;
- `useProgramDayDetail(rootId, programId, timezone, date)` for on-demand detail;
- `useProgramRangeViewModel(...)` for presentation-only aggregation of canonical day facts.

Range queries include FullCalendar's leading/trailing week padding. Normalize visible range boundaries before key construction so rerenders do not create duplicate cache entries.

`programDayState.js` may index and decorate server facts for rendering, but it must not recalculate completion or chain semantics. Its responsibilities are limited to stable lookup and accessible state labels; visual completion marks remain in the shared component.

Rewrite `useProgramDayViewModel` to consume canonical detail. Delete fuzzy name matching and any client reimplementation of requirement satisfaction. Goal-tree selectors may remain client-derived when they concern available actions rather than historical truth.

### Explicit scope reducer

The calendar reducer becomes:

```js
{
  scope: 'program' | 'day' | 'range',
  contextProgramId,
  contextDate,
  selectedRange,
  pendingBlockSelection
}
```

Add explicit actions:

- `focus_program`
- `focus_day`
- `focus_range`
- `clear_pending_block_selection`

Initial state and background click use `focus_program`; they may retain today as the calendar anchor without making the pane day-scoped. Prev/next day arrows dispatch `focus_day`. A block-label click dispatches `focus_range` with the exact block and program context.

The selected scope is not inferred from the presence of `contextDate`, because today exists even in program scope.

### Cache coherence

All mutations capable of changing these projections must invalidate the program-day read-model root and program metrics root:

- session create, update, complete, restore, delete, and program reassignment;
- program-day create/update/delete/schedule/unschedule;
- template requirement changes;
- goal/evidence changes that affect alignment or goals touched;
- timezone change through distinct keys rather than cross-timezone cache reuse.

Add `queryKeys.programDayReadModelRoot(rootId, programId?)` for prefix invalidation. Preserve existing session cache updates. At local midnight, invalidate both metrics and visible day summaries so pending days close correctly. Avoid optimistic completion unless both summary and detail caches can be updated atomically; otherwise show mutation pending state and refetch.

### Loading and error behavior

- Day selection scopes the pane immediately using cached summary facts and shows a localized detail skeleton.
- A day-detail failure leaves the calendar usable and offers a retry inside the pane.
- Range-summary failure renders an accessible non-blocking status and retry; it does not remove existing event data.
- Empty days distinguish “no occurrence,” “outside selected program,” and “no selected program.”
- Keep previous month data during adjacent navigation only when dates remain visibly labeled; never display stale statuses under a new month.

---

## Calendar behavior

### `ProgramCalendarView.jsx`

- Accept selected-program day summaries keyed by date.
- Extend the existing `syncBlockLabelForCell`/cleanup seam to stamp and remove `data-day-state`, `data-chain-role`, `data-chain-break`, and selected-program color variables.
- Ensure every attribute is cleared on unmount, program change, timezone change, and range refetch to prevent recycled FullCalendar cells from leaking state.
- Remove the second-click modal behavior. A single click always dispatches day scope.
- Event clicks select their owning program. Empty-cell clicks retain the selected program and never use `programs.find(...)` as an implicit overlap resolver.
- Date selection dispatches range scope outside block-creation mode while preserving the existing Add Block eligibility calculation.

### Visual rules

- `scheduled_met`: a green inline checkmark at the end of the program-day ribbon.
- Closed, incomplete occurrences use an inline x at the end of the program-day ribbon. Today and future scheduled occurrences remain neutral because they have not been missed.
- `unscheduled_evidence`, `rest`, and `upcoming`: available through the scoped day review and visually hidden calendar state text.
- Program-day cards use the same temporal inline treatment as calendar ribbons: check when met, x only when closed and unmet, and no mark while pending.
- Use semantic design tokens and preserve sufficient contrast in light/dark themes, forced-colors mode, and selected/today states.
- Calendar state never relies on color alone; every closed program-day ribbon includes a labeled completion mark.
- Calendar date numbers use FullCalendar's conventional top-right position. Block-start labels occupy the remaining header width at left and truncate before the date zone.
- Dates without a matching program-day ribbon add only a screen-reader label. They do not add a visible fallback marker that can collide with goal deadlines or FullCalendar overflow controls.
- Chain roles remain in the read model for metrics and future design work, but no chain line is rendered in this version.

The selected program's name and state are included in each decorated cell's accessible label. Purely decorative pseudo-elements are hidden from assistive technology.

---

## Sidepane behavior

### Structure

`ProgramSidePane` is the scope router while retaining `ProgramSidePaneSection` and program Details/Goals sub-tabs. Program and multi-day range scopes share the canonical `ProgramOverview`; range selection changes the metrics query window instead of mounting a competing summary.

Add:

- `ProgramScopeBreadcrumb`
- `ProgramDayPane`
- `ProgramOverview`
- `ProgramDayActionsMenu`
- `ProgramChainSummary`

Move sidepane-only CSS out of `ProgramCalendarPage.module.css` into `ProgramSidePane.module.css`; delete migrated selectors from the page stylesheet so there is no competing style implementation.

### Header and navigation

- Breadcrumb segments are buttons with descriptive accessible names and visible focus states.
- Day prev/next buttons announce the target date and remain within the selected program's date range.
- Auto-open a collapsed pane after an intentional day/range selection. On mobile, open the existing focus-trapped bottom sheet and restore focus to the triggering calendar cell when dismissed.
- Escape closes menus/dialogs before the mobile pane itself.
- Collapse state is stored per scope and reset only when the selected program changes.
- Day scope has one fixed heading section containing the program-return breadcrumb, collapse action, and a full localized date centered horizontally and vertically between equal-width previous/next control columns. It does not add a redundant “Day review” eyebrow. Status remains with the reviewed program-day card instead of being duplicated in navigation. Native unstyled buttons and wrapping ISO-date fragments are not acceptable.

### Visual hierarchy

- The pane owns a single scroll region below its fixed header and maintains stable scrollbar space.
- Day/range identity, state, occurrence cards, requirements, sessions, goals, and actions each have a distinct typographic and surface hierarchy using semantic design tokens.
- Occurrence cards use consistent padding, border radius, dividers, and action treatments; controls have visible hover, focus, disabled, and loading states.
- At desktop width the pane is 410px, with the calendar grid consuming the remaining flexible width. At tablet/mobile widths it retains the existing full-width, focus-trapped sheet behavior.
- IDs from API projections are normalized before client set membership checks, avoiding silent goal omissions when serializers differ between numeric and string identifiers.

### Day content

- The daily requirement explainer uses deduplicated server counts once above the occurrence cards; occurrence cards only describe their own template evidence.
- Incomplete occurrences do not render a second template-status inventory. Today shows a compact left-aligned two-column action grid: a fixed verb column (`Start` or `Continue`) and an app-standard small, correctly colored template badge column. This keeps verbs aligned across different template-name lengths while keeping the badge identity separate; the combined accessible name is `Start <template>` or `Continue <template>`. Closed and future occurrences expose no misleading launch action.
- Goals use configured `GoalIcon` styling.
- Once occurrence requirements are met, only completed session rows are shown. They link to Session Detail and show the shared template-name badge, Sessions-page completion check, duration, and explicitly labeled timezone-local start and end times (falling back to completion time when legacy data has no `session_end`). The requirement template row is omitted so completed work is not represented twice.
- Session rows remain compact session-level links; activity summaries belong exclusively to Session Detail and are neither requested nor rendered here.
- Other work is clearly separated and never presented as scheduled completion.
- Schedule note edits make recurrence-wide scope explicit.
- Day review does not expose definition editing, occurrence removal, or goal attachment. Those are program-authoring operations and belong in the Blocks workspace rather than the review pane; empty-day scheduling remains available as the intentional planning action.

### Quick start

For today, each outstanding template has a single quick-start link using:

```text
/<root_id>/create-session?program_id=...&program_day_id=...&date=YYYY-MM-DD&template_id=...
```

Extend Create Session auto-selection to validate all four values against canonical day options and select the exact template. Consume or preserve unrelated query parameters intentionally rather than clearing the full search string.

Do **not** label future occurrences “Start session.” Future days may offer “Review template” or “Go to today.” Supporting scheduled future-session creation is a separate product capability and is outside this scope.

### Range content

`useProgramRangeViewModel` aggregates server facts into:

- met, partial, missed, scheduled, rest, and evidence day counts;
- closed scheduled adherence denominator;
- chain breaks and longest run inside the selected range;
- linked duration;
- per-template completed/scheduled occurrences;
- goals touched from `range_summary.goals_touched_ids`, with an explicit loading/error state.

Do not derive historical goals touched from current program scope or whole-window goal coverage. The bounded distinct-ID aggregate is authoritative; do not guess if it is unavailable.

“Add Block” remains visible only when `pendingBlockSelection` is valid.

---

## Onboarding compatibility

The current earned fact is `calendar_day_modal_opened`, derived from the visited key `calendar_day_modal`. Preserve already-earned progress monotonically.

Implementation strategy:

1. Introduce the semantic visited key `program_calendar_day_reviewed` and derived fact of the same meaning.
2. Treat either the old or new visited key as satisfying the “Review the Calendar” substep during one compatibility window.
3. Mark the new key when day scope successfully opens; detail loading may still be pending.
4. Update onboarding copy so it instructs one click and describes the sidepane.
5. Update client and backend tests for old-state compatibility and new-state persistence.
6. Retain old persisted keys as harmless compatibility data unless a general onboarding-state migration is introduced.
7. Update `index.md` in the implementation commit to describe the new scoped-sidepane fact and compatibility mapping.

---

## Implementation sequence

### Phase 1 — canonical semantics and contract

1. Extract occurrence generation, precise session bucketing, requirement evaluation, day state, and chain calculation into canonical service helpers.
2. Add the new program-scoped day read-model endpoint and schema/validation.
3. Make `ProgramMetricsService` consume canonical facts; add the partial/pending states, requirement counts, corrected adherence, corrected template colors, and incremented calculation version.
4. Implement the legacy active-days route as a compatibility projection over the canonical service.
5. Add correctness, tenant-isolation, timezone, contract, and query-budget tests before client wiring.

### Phase 2 — client data and scope state

1. Add query keys, summary/detail hooks, cache invalidation roots, midnight invalidation, and loading/error states.
2. Make scope explicit in the calendar reducer and test every transition.
3. Rewrite day/range view models as presentation adapters over server facts.
4. Extend Create Session's exact day/template deep link for today and migrate its data adapter away from legacy naming.

### Phase 3 — calendar and sidepane

1. Render selected-program states and chain attributes through the existing cell-decoration seam.
2. Implement program/day/range sidepane components and responsive behavior.
3. Port write actions and definition-note editing with existing mutation validation and confirmations.
4. Wire onboarding's new semantic visit fact.
5. Remove all modal-open state and the second-click behavior.

### Phase 4 — deletions and convergence

Delete:

- `client/src/components/modals/DayViewModal.jsx`
- `client/src/components/modals/DayViewModal.module.css`
- `client/src/components/modals/__tests__/DayViewModal.test.jsx`
- fuzzy template-name matching in `useProgramDayViewModel.js`
- client completion calculations superseded by canonical facts where no other surface needs them
- page-level sidepane CSS after migration

Keep `ProgramDayModal.jsx`; it edits day definitions in the Blocks view.

Search for all imports, event names, CSS selectors, test fixtures, and lazy chunks before deletion. Add a follow-up with an owner/removal version for the active-days compatibility route and `ProgramDaySession` normalization; compatibility code without a removal criterion does not satisfy S+.

Required retirement records before merge:

| Item | Owner | Target | Exit condition |
|---|---|---|---|
| Legacy `active-days` route/client adapter | Programs backend + client | Release N+1 | Supported clients use `day-options`; legacy telemetry is zero for the agreed window |
| Duplicate-prone `ProgramDaySession` ledger | Programs backend | Next program-schema cleanup milestone | Add occurrence-aware uniqueness and a real status workflow, or remove the ledger and serializer field |

### Phase 5 — documentation and rollout

1. Update `index.md` for the canonical day read-model, corrected adherence semantics, scoped sidepane, onboarding compatibility, and legacy endpoint status.
2. Add API contract notes and calculation-version release notes.
3. Use additive deployment order: backend endpoint and compatibility adapter first, then client, then legacy removal after the supported window.
4. Monitor endpoint latency, response size, error rate, legacy route usage, and divergence assertions between metrics and day summaries.

---

## Verification gates

### Backend automated tests

- All seven states, including today pending and today partial versus closed partial.
- Required, optional, and `completion_min_templates` combinations.
- Multiple sessions for one template count once; extras remain visible.
- Multiple occurrences on one date retain independent attribution while sharing one deduplicated daily completion rule.
- Same-name templates never cross-match.
- Recurring `program_day_id` occurrences bucket by local date.
- DST spring/fall boundaries and at least two IANA timezones.
- Rest/evidence bridges, pending dates, week boundaries, current streak, longest streak, and chain-break counts.
- Range-boundary continuation preserves runs within the bounded prior context; older programs report `context_truncated_before` explicitly.
- Scheduled aligned evidence without required-template completion is not met.
- Unscheduled aligned evidence remains `unscheduled_evidence`.
- Deleted sessions/templates and archived templates follow documented rules.
- In-progress and paused linked sessions appear in detail but do not satisfy completion.
- Other work is tenant-safe and excluded from scheduled completion.
- Invalid ranges, mixed parameters, over-366-day requests, invalid timezone, inaccessible root/program.
- Deterministic ordering and schema snapshot/contract tests.
- Summary/detail query-count budgets and proof that summary omits heavy detail.
- Metrics/day-read-model parity for state, requirement counts, and chain facts.
- Legacy active-days response compatibility without duplicated business logic.

### Client automated tests

- Explicit reducer transitions, including initial/background program scope.
- Selected-program-only decoration with overlapping programs.
- Every stale DOM attribute is removed when cells are recycled or program/timezone changes.
- Glyph and accessible-label mapping for all seven states.
- Chain start/member/end/bridge rendering across week rows.
- Day summary-first loading, detail retry, empty states, and retained calendar interaction on error.
- Stable day-detail pagination, Load More behavior, and complete requirement counts on every page.
- Breadcrumb, prev/next, menu, dialog, Escape, focus restoration, and mobile focus trap.
- Day pane requirement copy, template statuses, concise session links, other work, goal icons, definition-note warning, and absence of activity-detail rendering.
- Range aggregates and unavailable/loading goals-touched behavior.
- Exact Create Session query parsing and validation for `program_id`, `program_day_id`, `date`, and `template_id`.
- Mutation and midnight invalidation of both metrics and read-model queries.
- Old and new onboarding fact compatibility.
- Removed modal chunk/import/second-click behavior.

### Repository gates

Run the focused suites plus the normal project gates:

```bash
fractal-goals-venv/bin/pytest tests/integration/test_programs_api.py tests/unit/services/test_program_metrics_service.py tests/performance/test_query_budgets.py
cd client && npx vitest run src/components/programs src/hooks/__tests__ src/utils/__tests__/programCalendarContext.test.js src/utils/__tests__/programViewModel.test.js
cd client && npm run lint
cd client && npm run build
```

Run broader backend/client suites if shared serializers, session lifecycle invalidation, onboarding state, or calendar primitives change.

### Manual acceptance

1. Verify a program containing met, partial, missed, pending, evidence, rest, and upcoming dates.
2. Confirm a scheduled date with unrelated aligned evidence stays partial/missed rather than met.
3. Confirm rest/evidence days preserve the numeric chain without adding ambiguous connector fragments to the calendar.
4. Verify the chain across a week boundary and after local midnight.
5. Switch between overlapping programs and confirm the completion mark/ribbon always names and reflects only the selected program.
6. Click a day once and verify the pane opens immediately, loads detail non-blockingly, and retains calendar visibility.
7. Navigate prev/next and breadcrumbs; verify scope and focus behavior.
8. Open a linked Session Detail and verify activity information is available there but absent from the day-review pane and payload.
9. Confirm other work is separated and never satisfies scheduled requirements.
10. Edit a schedule note and confirm every recurrence displays the updated definition note.
11. Exercise empty-day scheduling and verify review cards do not expose definition, unschedule, or goal-attachment mutations.
12. Drag a range and click a block label; verify aggregates and Add Block eligibility.
13. Start today's exact template through the deep link. Confirm future dates do not claim to start a session.
14. Complete a session and verify calendar and the scoped overview pane converge after invalidation.
15. Verify mobile bottom-sheet focus trapping/restoration, keyboard-only use, screen-reader labels, forced colors, light/dark themes, and reduced motion.
16. Confirm old onboarding achievements remain complete and a new user completes the step by opening day scope once.

---

## S+ definition of done

The work is S+ only when:

- one canonical backend evaluator owns occurrence completion and chain semantics;
- Calendar and scoped-sidepane parity is asserted by automated tests;
- partial and today-pending behavior is correct and timezone-safe;
- overlapping programs never produce ambiguous cell status;
- summary and detail projections meet fixed query and payload budgets;
- no fuzzy identity matching or drift-prone occurrence flags remain in read paths;
- cache invalidation covers all relevant mutations and local midnight;
- the modal and migrated CSS/client logic are deleted without dead imports;
- accessibility works on desktop and mobile without relying on color;
- onboarding compatibility and `index.md` are updated;
- lint, production build, focused suites, and impacted broader suites pass;
- compatibility code has a documented removal version and owner.
