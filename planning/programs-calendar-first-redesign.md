# Programs Page Redesign — Calendar-First Architecture

## Audit Grade

**Original grade: A- for direction, B for implementation readiness.** The plan correctly identifies the product model inversion: programs should live on the calendar, not behind a card grid. It also catches the most important backend flaw: overlapping program ranges.

Feature gaps holding it back from S+:

- Date semantics were under-specified. Program ranges need to be explicitly **inclusive** (`start <= day <= end`) everywhere.
- Existing overlapping data needs a migration/remediation story before a hard constraint is trusted in production.
- The calendar needed density behavior for busy days where program bands, block bands, planned days, sessions, and goal deadlines stack quickly.
- The drawer needed concrete states: no selection, current-program auto-selection, mobile presentation, edit/delete confirmation, and deep-link behavior.
- Program creation needed an overlap error UX, not only backend rejection.
- The blocks detail page needed a backwards-compatible redirect from the old `/:rootId/programs/:programId` route.
- Verification needed focused backend tests for inclusive overlap and frontend tests for multi-program event generation.

**S+ upgrade:** this plan now treats the calendar as the canonical program surface, makes date-range integrity explicit, preserves old links with redirects, and specifies guardrails for existing data, error recovery, accessibility, and event density.

## Implementation Status — S+ Pass

The calendar-first redesign has moved from plan to implementation. The shipped shape is now:

- `ProgramCalendarPage` is the primary Programs surface for calendar and blocks views.
- Calendar and block views are seamless toggles on the same page.
- The right sidebar matches the visual integration pattern used by other app sidebars.
- The sidebar has `Details` and `Notes` views using the Session Detail tab style.
- Program Options consolidates edit, delete, duplicate, create, view other programs, and notes shortcut actions.
- Program notes are persisted as normal notes with `context_type='program'`, scoped by `context_id`.
- Program notes on the Notes page show the program name as the card header and support the standard note menu.
- The Notes page includes a first-class `Program Notes` filter chip.
- Active/inactive status is date-derived from the current date falling inside the inclusive program range.
- Duplicate Program copies the program shell, goals, blocks, and planned days into a new date range.

Additional S+ follow-through completed:

- Backend/API tests cover program note creation and list serialization with `program_name`.
- Program-note scoping tests verify that viewing a previous/current program returns only that program's notes.
- Program overlap tests include adjacent non-overlapping ranges.
- Program sidebar notes now have explicit loading and error states.

Remaining deliberate non-goal for this pass:

- Playwright/screenshot QA was intentionally skipped per product direction.

## Context

The current programs experience has two separate surfaces: a Programs list page (`/:rootId/programs`) showing cards for each program, and a Program Detail page (`/:rootId/programs/:programId`) with a calendar + block view. This creates a mental model where "programs are objects you pick and then view on a calendar" — but the user wants the opposite: **the calendar is the primary surface, and programs are time-bound segments that live inside it.**

Additionally, the backend has no date-overlap enforcement between programs. Multiple programs can cover the same dates, which is ambiguous and produces confusing UI (which program "owns" a given day?). The redesign enforces non-overlapping programs as a hard constraint.

**Goal:** Collapse the two-page flow into a single calendar-centric page where all programs are visible at once as non-overlapping spans of time, and program management happens through the calendar rather than a card-grid list.

---

## Database Grading (Current State)

| Dimension | Grade | Notes |
|-----------|-------|-------|
| Program overlap enforcement | **F** | No constraint, programs can share dates |
| Active-program semantics | **D** | Boolean `is_active` is a UI hint, not a calendar truth |
| Model structure | **B** | Rich hierarchy (Program → Block → Day → Template) is well-normalised |
| Serialization | **B+** | Nested, complete, but `weekly_schedule` is a legacy artefact on Program |
| API surface | **A-** | 18 well-structured REST endpoints, thin routes |
| Query keys / caching | **B** | Consistent but `useProgramsPageData` still fire-and-forget |

**Overall: C+** — the underlying hierarchy is solid, but the absence of date-range integrity makes the calendar-first model unsound without backend changes.

---

## Target Architecture — S+ Plan

### Core Design Principle

> One root = one calendar. Programs tile the calendar as non-overlapping, contiguous (or gapped) date ranges. There is no "active" program — the current date determines which program is in focus.

---

## Phase 1 — Backend: Date-Range Integrity

### 1.1 Add overlap validation to `ProgramService`

**File:** `services/programs.py`

Add a `_check_no_overlap(root_id, start_date, end_date, exclude_program_id=None)` helper. Program ranges are inclusive, so adjacent programs are allowed only when the next program starts **after** the previous program's end date:

```python
def _check_no_overlap(session, root_id, start_date, end_date, exclude_id=None):
    q = session.query(Program).filter(
        Program.root_id == root_id,
        Program.start_date <= end_date,
        Program.end_date >= start_date,
    )
    if exclude_id:
        q = q.filter(Program.id != exclude_id)
    if q.first():
        raise ValueError("Programs cannot overlap in date range")
```

Call this in `create_program()` (before insert) and `update_program()` (before update, passing `exclude_id=program_id`).

### 1.1b Existing-data remediation

Before enabling this in production, run a read-only overlap audit:

- Find programs with the same `root_id` where `a.start_date <= b.end_date AND a.end_date >= b.start_date`.
- Produce a report grouped by root, ordered by start date.
- Do not auto-fix user data. Let the user shorten, move, merge, or delete conflicting programs.

If a migration is needed later, prefer a nullable archive/superseded marker rather than silently changing dates.

### 1.2 Deprecate `is_active` as a user-settable field

- Keep the column for backwards compatibility but stop mutating it in `create_program`/`update_program`.
- Compute `is_active` dynamically at serialization time: `program.start_date <= today <= program.end_date`.
- Update `serialize_program()` in `services/serializers.py` to compute this.

**Files:**
- `services/programs.py` (lines ~391-479)
- `services/serializers.py` (`serialize_program`, ~line 644)
- `validators.py` (remove `is_active` from `ProgramCreateSchema` / `ProgramUpdateSchema`)

---

## Phase 2 — Frontend: Unified Calendar Page

### 2.1 New routing structure

Remove the Programs list route. The Programs page IS the calendar.

**Before:**
```
/:rootId/programs            → Programs list (card grid)
/:rootId/programs/:programId → ProgramDetail (calendar + blocks)
```

**After:**
```
/:rootId/programs                       → ProgramCalendarPage (all programs visible)
/:rootId/programs/:programId/blocks     → ProgramBlocksPage (block/day detail for one program)
/:rootId/programs/:programId            → redirect to /:rootId/programs/:programId/blocks
```

**Files to change:**
- `client/src/AppRouter.jsx` (lines ~318-331)
- `client/src/components/Sidebar.jsx` (nav label + link, ~line 89)

### 2.2 New `ProgramCalendarPage` component

**File:** `client/src/pages/ProgramCalendarPage.jsx` (new, replaces `Programs.jsx` and `ProgramDetail.jsx` calendar mode)

**Responsibilities:**
- Renders a single FullCalendar month view spanning all programs (no program-level scoping)
- Programs are displayed as **background highlight bands** across their full date range (coloured by block color or a program-level color)
- Blocks, scheduled days, goals, and sessions appear as events on top
- Clicking an empty date in a "gap" (no program) shows a "Create Program starting here" prompt
- Clicking an existing program band or its events opens a **Program Detail Drawer** (right sidebar) — not a new page
- "+ New Program" button in header opens `ProgramBuilder` modal pre-seeded with a start date
- "View Blocks" action in the drawer navigates to `/:rootId/programs/:programId/blocks`
- Auto-selects today's program when one exists; otherwise shows the calendar without a forced drawer
- On mobile, the drawer stacks above or becomes a sheet, and the calendar remains usable without horizontal overflow
- Busy days use FullCalendar overflow behavior instead of expanding cells indefinitely

**Key data hook:** `useProgramsCalendarData(rootId)` (new hook) — fetches all programs with their blocks and calendar events in a single query, analogous to the existing `useProgramsPageData` but returning calendar-formatted events for all programs simultaneously.

**State:**
- `selectedProgramId` — which program's drawer is open
- `currentMonth` — FullCalendar navigation state

### 2.3 Program Detail Drawer (sidebar, not page)

A slide-in panel (reuse `ProgramSidebar` pattern from `ProgramDetail.jsx`) showing:
- Program name, date range, goals
- Block list with dates (currently shown on the Programs list card)
- Quick actions: Edit Program, Delete, View Blocks
- Empty state when no program is selected
- Close button with accessible label
- Delete confirmation with session count

This replaces the Programs list card grid.

### 2.4 Keep `ProgramDetail.jsx` as the Blocks page

Rename/re-route `ProgramDetail.jsx` to serve `/:rootId/programs/:programId/blocks`. Remove the calendar view toggle from it (calendar now lives on the parent page). Keep:
- `ProgramBlockView` (primary/only view)
- Sidebar with stats and goals
- All existing modals (ProgramBlockModal, ProgramDayModal, etc.)

Remove:
- `ProgramCalendarView` from this page (moved to `ProgramCalendarPage`)
- View mode toggle (calendar / blocks)

**Files:**
- `client/src/pages/ProgramDetail.jsx` (prune calendar-related state + view toggle, ~lines 58-131)
- `client/src/components/programs/ProgramCalendarView.jsx` (move to be used from ProgramCalendarPage only)

### 2.5 Calendar event shape for multi-program view

`useProgramsCalendarData` needs to build events for ALL programs at once:

```js
// One background band per program
{ id: `prog-${p.id}`, start: p.start_date, end: p.end_date,
  display: 'background', color: programColor, extendedProps: { type: 'program', programId: p.id } }

// Per-block background sub-bands
{ id: `block-${b.id}`, start: b.start_date, end: b.end_date,
  display: 'background', color: b.color, extendedProps: { type: 'block_background', ... } }

// Program day / session events (same as today)
```

### 2.6 "No overlapping programs" UX guardrails

- `ProgramBuilder` modal: when picking start/end dates, visually show existing program ranges on the date picker (blocked-out or highlighted)
- Backend returns 400 with a clear error message on overlap — surface this in the modal
- On the calendar, gap periods between programs get a subtle "no program" visual treatment, with a click-to-create affordance
- ProgramBuilder should await save responses and stay open when the backend rejects overlap
- Creation from a gap should prefill the clicked start date

---

## Phase 3 — Migration / Cleanup

### 3.1 Remove `Programs.jsx` and `Programs.module.css`

Once `ProgramCalendarPage` is shipped, delete the old list-view files.

**Files to delete:**
- `client/src/pages/Programs.jsx`
- `client/src/pages/Programs.module.css`

### 3.2 Update `useProgramsPageData` → `useProgramsCalendarData`

The new hook fetches all programs + their blocks in one call and builds calendar events. The old `useProgramsPageData` hook can be deleted or kept only if the deleted Programs list page had other consumers.

**File:** `client/src/hooks/useProgramsPageData.js` (replace or repurpose)

### 3.3 Auto-focus current program on load

On `ProgramCalendarPage` mount:
1. Find the program whose date range contains today (dynamically computed `is_active`)
2. Open its drawer automatically
3. Navigate the calendar to today's month

---

## Files Changed Summary

| File | Change |
|------|--------|
| `services/programs.py` | Add `_check_no_overlap`, remove `is_active` mutation |
| `services/serializers.py` | Compute `is_active` dynamically |
| `validators.py` | Remove `is_active` from program schemas |
| `client/src/AppRouter.jsx` | Reroute programs to new page structure |
| `client/src/components/Sidebar.jsx` | Update nav link |
| `client/src/pages/ProgramCalendarPage.jsx` | **New** — primary calendar page |
| `client/src/hooks/useProgramsCalendarData.js` | **New** — multi-program calendar data hook |
| `client/src/pages/ProgramDetail.jsx` | Remove calendar mode, keep as blocks-only page |
| `client/src/pages/Programs.jsx` | **Delete** |
| `client/src/pages/Programs.module.css` | **Delete** |
| `client/src/hooks/useProgramsPageData.js` | **Delete** (replaced by new hook) |

---

## Verification

1. Navigate to `/:rootId/programs` — should show a full calendar with all program bands visible, no card grid
2. Click a program band — drawer opens with program info and block list
3. Click "View Blocks" in drawer — navigates to `/:rootId/programs/:programId/blocks` (block view)
4. Create a new program with overlapping dates — backend returns 400, modal shows error
5. Create a program in a gap — succeeds, calendar updates immediately
6. Today's date highlights the current program's drawer auto-opens on load
7. Run `./run-tests.sh verify` — no regressions in existing program tests
8. Run `./run-tests.sh backend` — new overlap validation tests pass
9. Old route `/:rootId/programs/:programId` redirects to `/:rootId/programs/:programId/blocks`
10. Dense days do not resize the calendar into an unusable layout
