# Program calendar: optional continuous scrolling (unbroken weeks)

## Context

The program calendar only pages month by month (`dayGridMonth` + ‹ › Today). That has two problems:
- A program is a continuous span, but a streak or block that crosses a month edge is cut in half visually.
- Looking ahead or back means clicking through months one at a time.

You asked for an optional continuous mode that scrolls through the months, toggled by a checkbox next to ‹ › Today. You chose the **unbroken weeks** style: one continuous stream of weeks, like Apple or Google Calendar's scrolling month view, not stacked month grids.

(The other new request is already done and tested: clicking an event in the sidepane's Events list opens the event editor. `ProgramOverview` rows are now buttons that call the existing `periodEditor.openEdit` through `ProgramSidePane`'s `onEditPeriod`.)

---

## Grade of the current calendar (for this scope)

| Area | Grade | Why |
|---|---|---|
| Month view and decorations | **A-** | The server-driven status marks, streak lines, block labels, events and drag selection are all solid and cell-based (`[data-date]` hit-testing). |
| Navigation | **C** | You can only page by month. Streaks and blocks are cut at month edges. There is no way to scan a whole program. |
| Toolbar architecture | **C+** | There are two toolbars: FullCalendar's own header on desktop and a hand-built `mobileControlRow` on mobile. `headerActions` sits in an absolute overlay on top of FullCalendar's header. A real checkbox can't go inside FullCalendar's header, because it only renders buttons. |
| Data limits | **B+** | The day read model accepts up to 366 days (`MAX_WINDOW_DAYS`), so a 52-week window fits in one request. |

**Overall: B.** The rendering layer is ready for this. The toolbar and navigation are what hold it back.

---

## S+ plan

### 1. One page toolbar (desktop and mobile)
- In `ProgramCalendarView.jsx`, generalize the existing `mobileControlRow` into a single toolbar used whenever the view is *not* `compact`: `[‹] [›] [Today] [☐ Continuous]` on the left, the title centered, and `blockControls` on the right. On the page, FullCalendar's `headerToolbar` becomes `false`.
  - `compact` users (the landing page and `CalendarWidget`) keep FullCalendar's own header, unchanged.
- The title comes from state:
  - month mode: `datesSet` → `info.view.title`,
  - continuous mode: scroll tracking (see §3).
- The checkbox is a real `<label><input type="checkbox">Continuous</label>` with 44px touch targets on mobile. It only renders when the page passes `onContinuousChange` (a new `continuous` / `onContinuousChange` prop pair), so the landing page and widget never show it.
- In `ProgramCalendarView.module.css`, remove the absolute `headerActions` overlay and the FullCalendar header overrides that only the page used. Keep the compact overrides.

### 2. Continuous view (FullCalendar custom dayGrid)
- Define a custom view: `views: { dayGridContinuous: { type: 'dayGrid', duration: { weeks: N } } }`.
  - It uses a **weeks** duration, not `visibleRange`. FullCalendar only breaks rows on weeks when the range unit is week, month or year; a `visibleRange` renders one long row.
  - N is capped at **52 weeks (364 days)** so it stays under the read model's 366-day limit.
- Remount FullCalendar with `key={continuous ? `c:${window.start}` : 'month'}`, so toggling the mode or shifting the window starts cleanly.
- Use `height: '100%'` and `expandRows: false`. FullCalendar's own body scroller does the scrolling, and its weekday header stays fixed.
- Add a new pure module, `utils/programCalendarContinuous.js`:
  - `getContinuousWindow({ programStart, programEnd, anchor })`:
    - with a program: its range plus one week of padding each side, aligned to week starts,
    - for programs longer than 52 weeks: a 52-week window around `anchor` (the context date or today),
    - with no program: anchor −26 to +26 weeks.
  - `getWeekRowTitle(dates)`: the month of the row's Thursday (ISO rule), e.g. "October 2026".
  - `getMonthBoundaryClasses(dateStr)`: day-of-month ≤ 7 → top boundary; the 1st, when not in the first column → left boundary.
- Month legibility in the unbroken stream:
  - `dayCellContent` shows "Oct 1" on the 1st of each month (continuous mode only),
  - a stepped month boundary line comes from the boundary classes above,
  - every other month gets a subtle tint (`dayCellClassNames`), layered under the existing block colouring,
  - rows get a min-height (`.fc-daygrid-day-frame`, about 128px on desktop), so rows stay readable when not expanded.
- Streak lines, status marks, block labels, events and drag selection are all cell-based, so they work as they are. Streaks now run across month edges.

### 3. Scroll-aware navigation (continuous mode)
- **Scroll tracking**: a passive, rAF-throttled `scroll` listener on the body `.fc-scroller` finds the first week row whose bottom is below the scroller top. `getWeekRowTitle` turns that row into the title. The title is announced politely only when the month changes.
- `scrollToDate(date, { smooth })`: find `.fc-daygrid-day[data-date]`, scroll its row to the top of the scroller, and respect `prefers-reduced-motion`.
- **‹ / ›** scroll to the 1st of the previous or next month. When the target is outside the window, shift the window: re-anchor, remount, then scroll after mount.
- **Today** scrolls to today's row, and also calls `onTodayClick` as it does now.
- On mount and when the mode is toggled on: scroll instantly to the page's context date (or today). Toggling off returns month view to the month currently in view.
- **Drag selection auto-scroll**: in `useCalendarDragSelection`, when a drag is within 48px of the scroller's top or bottom edge, run an rAF auto-scroll loop and re-hit-test at the last pointer position. `selectableCellDateAt` already hit-tests by point.

### 4. Page wiring and preference
- In `pages/ProgramCalendarPage.jsx`, own `continuous` state, seeded from a per-viewer preference, and pass the window inputs (program start/end, context date).
  - `handleCalendarDatesSet` already sends the visible range to `useProgramDayRange`, so the read model fetches the whole window in one ≤364-day request.
- Move the storage helpers `readLocalStorageValue` / `writeLocalStorageValue` from `hooks/useFlowTreePreferences.js` into `utils/localPreferences.js` (the old module re-exports them). Store the preference under the key `program-calendar-continuous`.
  - It's a per-viewer convenience: wrapped in try/catch, and it defaults to off.
- `index.md`: add the continuous mode, the single page toolbar, and the 52-week window rule to the Programs calendar paragraph.

### Out of scope
- Loading more weeks on demand past 52 (shifting the window covers navigation).
- A continuous mode for the compact widget or the landing calendar.

---

## Files

- `client/src/components/programs/ProgramCalendarView.{jsx,module.css}` (toolbar, custom view, scroll navigation)
- `client/src/utils/programCalendarContinuous.js` (new: pure window, title and boundary helpers)
- `client/src/hooks/useCalendarDragSelection.js` (edge auto-scroll)
- `client/src/pages/ProgramCalendarPage.jsx` (state, preference, window inputs)
- `client/src/utils/localPreferences.js` (new, moved helpers) and `client/src/hooks/useFlowTreePreferences.js` (re-export)
- `index.md`, and `planning/program-calendar-continuous-scroll.md` (this plan, saved after approval)

## Verification

- **Unit tests** (`utils/__tests__/programCalendarContinuous.test.js`):
  - window alignment and padding, the 52-week cap and anchoring, the no-program window,
  - the Thursday rule for titles in rows that span a month edge,
  - boundary classes for the 1st through the 7th and in the first column.
- **Component tests** (`ProgramCalendarView.test.jsx`):
  - the checkbox only renders with `onContinuousChange` and toggles,
  - continuous mode renders the custom view with week rows across months, and the "Oct 1" label,
  - Today and ‹ › call `scrollToDate` (with scroll stubbed in jsdom),
  - compact mode keeps FullCalendar's header,
  - existing decoration and multiselect tests still pass.
- **Page test**: the preference persists across remounts, and the read-model range stays ≤364 days.
- Run the full Vitest suite and eslint.
- **Manual check** (`/run`):
  - toggle continuous on and scroll a multi-month program: the title tracks the month, streaks cross month edges, month boundaries and alternating tint are legible,
  - ‹ › Today scroll smoothly,
  - drag-select across a month edge with auto-scroll,
  - with a program longer than a year, › at the edge shifts the window,
  - reload: the preference is kept,
  - mobile width (560px calendar): the toolbar wraps cleanly.
