# Program days: status symbols in the day-status menu + weekly or specific-date scheduling

## Context

Two small gaps on the Programs page, as a first pass before a larger program-days rework:

1. **Status menu has no symbols.** The sidepane status dropdown (`ProgramDayStatusMenu`) lists "Mark complete / Mark rest / Use automatic status" as plain text. Rest has no symbol at all: `getProgramDayStatusSymbol` shows a **blue scheduled circle** for rest days, so a rested day looks just like a pending one on the trigger and on calendar ribbons. The ribbon also adds a separate "Rest" text label to make up for it.
2. **Scheduling a day is either weekly or one fixed date.** When a day is created from the calendar for a single date, `handleCreateDayForDate` makes a *dated* `ProgramDay` (`program_days.date`). The modal then shows a read-only "Scheduled Date" and hides the weekday picker, so the date can't be changed or extended. Days created from the Blocks page only offer weekdays. The backend already has a better primitive for specific dates, `program_day_occurrence_schedules` (the "Plan this day" rows, serialized as `scheduled_dates`), and the canonical evaluator already combines them with weekdays. The modal just never exposes it.

Intended outcome: every symbol for a day status (including a new **moon for rest**) is used the same way in the menu, on the trigger, in the bulk bar and on ribbons. The Program Day modal can schedule a day either **weekly (days of week)** or **on specific dates (one or many)**, and those dates can be edited afterwards.

---

## Grade of the current system (for this scope)

| Area | Grade | Why |
|---|---|---|
| Status symbol system | **B** | One shared `ProgramDayStatusMark` + `getProgramDayStatusSymbol` is good. Rest has no symbol and falls back to the "scheduled" circle, so it's ambiguous. The menu options have no symbols. |
| Scheduling data model | **B-** | The evaluator (`program_day_scheduled_on`) is canonical and already combines weekdays with explicit schedule rows. But there are two competing ways to store "specific date": a legacy `program_days.date` (one date, immutable in the UI, blocks scheduling) and `occurrence_schedules` (many dates). |
| Program Day modal UX | **C** | A dated day is a dead end: read-only date, no weekday option, no way to add dates. The weekday chips are clickable `div`s (not keyboard or screen-reader accessible). The schedule summary is built by an inline IIFE. |
| API / validation | **C+** | There's no way to set a day's schedule dates in one atomic call; only one-at-a-time `schedule`/`unschedule` endpoints exist. `date` is a free string in the schema. |
| Blocks view labelling | **C** | A dated day shows only a weekday name ("Saturday"), not its date. Dedupe by `name + templates` hides separate one-off definitions that share a name (to handle in the larger rework). |
| Tests | **B** | Good coverage exists (`ProgramDayModal.test.jsx`, `ProgramDayStatusBulkBar.test.jsx`, `test_programs_api.py`), but nothing covers rest symbols or multi-date scheduling. |

**Overall: B-.** The domain core is solid. The gaps are in the representation and the UI surface.

---

## S+ plan

### Part 1: Status symbols (client only)

**1a. Add a `rest` symbol to the shared mark.**
- `client/src/utils/programDayState.js`, `getProgramDayStatusSymbol`: return `'rest'` when `manualStatus === 'rest'`, or when `state === 'rest'` and it is not met. Order: complete → rest → missed → scheduled. Period-protected rest (`status_source: "period"`) resolves to `state: 'rest'`, so it gets the moon too.
- `client/src/components/programs/ProgramDayStatusMark.jsx`: add a `rest` status that renders an inline SVG crescent moon with a small "z z" (matching the reference image), filled with `currentColor`. Add `'rest'` to propTypes.
- `ProgramDayStatusMark.module.css`: `.rest { color: <muted lavender/indigo token, e.g. color-mix of --color-text-secondary + brand> }`. The SVG scales with the `.sm`/`.md` boxes. Add a `forced-colors` fallback (`CanvasText`).
- Update the component doc comment (check / X / circle / moon).

**1b. Symbols inside the status menu options.**
- `ProgramDayStatusMenu.jsx`: prefix each option with its decorative mark: ✓ `complete` → "Mark complete", moon `rest` → "Mark rest", circle `scheduled` → "Use automatic status". Mark the option that matches the current manual status as the current choice (`aria-pressed="true"` plus a subtle selected style), so the menu reflects state as well as offering actions.
- `ProgramSidePane.module.css`, `.dayStatusDropdown button`: `display:flex; align-items:center; gap:10px`.

**1c. Consistency elsewhere.**
- `ProgramDayStatusBulkBar.jsx`: the same marks on its Complete / Rest buttons.
- `ProgramCalendarEventContent.jsx`: the ribbon mark now shows the moon for rest. Remove the visible "Rest" text pill (`restStatusLabel`) because the moon replaces it. Rest stays announced through the existing assistive `statusLabel` text.
- `index.md`: update the Programs paragraph that lists the symbols ("check, X, blue circle") to include the moon for rest.

### Part 2: Weekly *or* specific-date scheduling

**Design decision:** "specific dates" are always stored as `program_day_occurrence_schedules` rows (the canonical, many-date primitive the evaluator already reads). The legacy `program_days.date` column stays readable for compatibility (agent harness, older rows), but the modal no longer writes it. Editing a legacy dated day converts it in place: `date → NULL`, the old date becomes a schedule row, and the day keeps its id, so linked sessions, credits and manual statuses keep working. A bulk data migration of all dated rows is left to the larger program-days rework.

**2a. Backend: an atomic, replace-all `scheduled_dates` field**
- `validators/programs.py`: add `scheduled_dates: Optional[List[date]]` to `ProgramDayCreateSchema` and `ProgramDayUpdateSchema`. Parse with the existing `parse_date_string`, dedupe, cap at 366, and reject mixing it with `date` in one payload.
- `services/_program_days.py`: new helper `_sync_occurrence_schedules(session, day, block, dates, user_id)`:
  - validate that every date is within the block range (same error as `schedule_block_day`),
  - diff against `day.occurrence_schedules`; insert missing rows, delete removed ones,
  - if `day.date` is set, clear it (legacy conversion),
  - bump `day.row_version` when anything changed (same as `schedule_block_day`),
  - return `(added, removed)`.
  - Called from `add_block_day` (after the day row is created) and `update_block_day` when `'scheduled_dates' in data`. When `cascade` is on, the dates are **not** copied to later blocks, because they are block-range bound. Only name, templates and weekdays cascade, as today.
  - `update_block_day` takes the same program → block → day `with_for_update` lock order as `schedule_block_day` when `scheduled_dates` is present.
  - Emit `PROGRAM_DAY_UPDATED` with `scheduled_dates_added` / `scheduled_dates_removed` in the payload. Check existing `PROGRAM_DAY_SCHEDULED` / `UNSCHEDULED` listeners (activity log) and emit per-date events too if any listener relies on them.
- Removing a date with completed sessions: sessions and credits are not deleted. They become dormant/unscheduled, the same as `unschedule_block_day_occurrence` today (legacy placeholder cleanup is not needed here).
- The serializer already exposes `scheduled_dates`, so no change there.

**2b. Client: modal schedule section**
- `ProgramDayModal.jsx`: replace the read-only "Scheduled Date" input and the weekday-only section with one **Schedule** field:
  - A segmented control using the existing `Radio` atom styling or a `role="radiogroup"`: **Weekly** | **Specific dates**.
  - **Weekly**: the weekday chips, rebuilt as real `<button aria-pressed>` elements. The summary ("Every Mon, Wed and Fri in the block") moves to a pure helper `formatWeekdaySchedule` in `utils/programViewModel.js`.
  - **Specific dates**: a chronologically sorted list of date chips (`Sat, Sep 26, 2026` + remove ×), plus a native `<input type="date">` with `min`/`max` set to the block's start/end and an **Add date** button (Enter also adds). Duplicates are ignored. Show an empty-state hint ("Add at least one date, or switch to Weekly"). Summary: "3 dates · Sep 26 – Oct 10".
  - Initial mode: `Specific dates` when the day has a legacy `date` or `scheduled_dates` and no weekdays; otherwise `Weekly`. For a new day opened from the calendar (`handleCreateDayForDate`), use `Specific dates` prefilled with that date. For a new day from the Blocks page, use `Weekly`.
  - A weekly day that also has sidebar-planned extra dates shows them under Weekly as an **"Also planned on"** chip list (removable), so nothing is lost silently.
  - Save payload: Weekly → `{ day_of_week: [...], scheduled_dates: extraDates }`. Specific dates → `{ day_of_week: [], scheduled_dates: [...] }`. `date` is never sent.
  - Save is disabled (with inline reason) when the name is empty, or when Specific dates is chosen with zero dates.
- Pass the block into the modal. `ProgramCalendarPage.jsx` already has `selectedBlockId`, so look up the block and pass `block={...}` so the date picker gets `min`/`max`.
- `useProgramLogic.saveDay`: invalidate `scheduling` as well as `program`, because schedule changes move the day read model and metrics.
- `ProgramDayModal.module.css`: styles for the segmented control, the date chips, and the add-date row, using existing tokens and 44px touch targets on mobile.

**2c. Blocks page label**
- `ProgramBlockView.jsx`: replace the inline IIFE with a helper `getProgramDayScheduleLabel(day)` in `utils/programViewModel.js`:
  - weekdays → "Mon · Wed · Fri" / "Daily" (+ " · +2 dates" if extras exist),
  - dates only → "Sep 26" for one date, "Sep 26, Oct 3" for two, "Sep 26 +3 more" beyond that,
  - legacy `date` → the formatted date, not just the weekday name.

### Out of scope (for the larger rework)
- A bulk migration that retires `program_days.date` entirely, plus the agent-harness `create_only` date dedupe.
- The Blocks-view dedupe by `name + templates`.
- Recurrence rules beyond weekly (every N days or N weeks).

---

## Files

- Client: `utils/programDayState.js`, `components/programs/ProgramDayStatusMark.{jsx,module.css}`, `components/programs/ProgramDayStatusMenu.jsx`, `components/programs/ProgramSidePane.module.css`, `components/programs/ProgramDayStatusBulkBar.jsx`, `components/programs/ProgramCalendarEventContent.jsx`, `components/modals/ProgramDayModal.{jsx,module.css}`, `components/programs/ProgramBlockView.jsx`, `utils/programViewModel.js`, `hooks/useProgramLogic.js`, `hooks/useProgramDetailController.js`, `pages/ProgramCalendarPage.jsx`
- Server: `validators/programs.py`, `services/_program_days.py`
- Docs: `index.md` (symbols and scheduling notes), `planning/program-day-status-symbols-and-date-scheduling.md` (this plan, saved after approval)

## Verification

- **Server tests** (`tests/integration/test_programs_api.py`):
  - create a day with `scheduled_dates` (rows are created, and the evaluator/day read model shows the occurrences),
  - update replaces the set (add and remove),
  - a date outside the block range gets a 400,
  - a legacy dated day is converted on update (`date` becomes null, the row exists, and a linked completed session still credits),
  - sending `date` together with `scheduled_dates` gets a 400,
  - `row_version` advances.
- **Client tests**:
  - `getProgramDayStatusSymbol` returns `rest` for manual and period rest, and `complete` wins over rest,
  - `ProgramDayStatusMark` renders the moon,
  - the `ProgramDayStatusMenu` options show marks, and the current status is `aria-pressed`,
  - `ProgramDayModal`: switching mode, adding/removing/deduping dates, min/max on the date input, the payload shape for each mode, initial mode from the calendar vs the Blocks page, and a legacy dated day opening in dates mode,
  - `ProgramBlockView`: schedule labels,
  - update `ProgramDayStatusBulkBar.test.jsx` and the ribbon tests for the removed "Rest" text.
- Run `pytest tests/integration/test_programs_api.py` and the client Vitest suite for `programs/` and `modals/`, plus lint.
- **Manual check** (`/run`):
  - mark a day as rest in the sidepane: the moon appears on the trigger and the ribbon,
  - create a day from a calendar date, add two more dates, save: three ribbons, and the Blocks view shows "Sep 26 +2 more",
  - reopen the day, switch it to Weekly, save: the dates are gone and weekdays are applied,
  - open a legacy dated day and save: it is converted and its history is intact.
