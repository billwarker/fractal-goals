# Program calendar: viewport-driven loading of program and session data

## Context

The program calendar now has a continuous-scroll mode that renders a 52-week window. Program and session data should show on whatever days are on screen, across **all** programs, and nothing else should load. When the page opens, it centers on today.

Right now the data layer was built for month paging and then adjusted for continuous mode. It loads too much in some places and too little in others.

### How it loads today

| # | Request | Where | Scope | Weight |
|---|---|---|---|---|
| 1 | `GET /programs/calendar?range_start&range_end` | `useProgramsCalendarData` | Every program, plus blocks in the range | Light (about 200 B per program) |
| 2 | `GET /programs/:id` **for each program overlapping the visible month**, plus the selected one | `useVisibleProgramCalendarDetails` | **Unbounded**: every block, every day, every template with its full `template_data` JSON and goals, and **every session ever linked** | **Heavy** (it grows with program age, often 100 KB–1 MB+) |
| 3 | `GET /programs/:id/day-read-model?range=visible month`, for each program above | same hook | Month | Medium, but each response repeats the same **root-wide** `completed_sessions`, so N programs mean N copies |
| 4 | `GET /programs/:id/day-read-model?range=visibleCalendarRange` | `useProgramDayRange` (page) | **The whole 52-week window in continuous mode** (because `datesSet` reports the full rendered range) | **Heavy**: 364 days of facts, a year of evidence evaluation, and a year of sessions |
| 5 | `GET /calendar-periods` | only when no program is displayed | Range | Light |

### Grade of the current implementation (for this scope)

| Area | Grade | Why |
|---|---|---|
| Correctness of what's in view | **C** | `visibleCalendarMonth` is the month of the **top** week row, so in continuous mode the lower part of the viewport (the next month) has no program-day detail. When no program is displayed, completed sessions don't appear at all, because they only come from program-scoped read models. `calendarProjectionReady` hides **all** projected events while a new range fetches, which causes flicker. |
| Network efficiency | **D+** | There's an N+1 fan-out of unbounded `getProgram` detail. A 364-day read model is fetched whenever the continuous window mounts or shifts. The same root-wide sessions are serialized once per program. |
| Caching | **C** | Query keys follow the visible month, so they churn during scroll, and nothing is prefetched ahead. `gcTime: Infinity` on full details, together with the `details` fallback that reads the cache for every program, means memory never shrinks. |
| Architecture | **C+** | Occurrences come from two sources. The client projects program-day events from full detail (`buildProgramCalendarEvents`), while the server's canonical evaluator (`program_day_occurrences`) produces status and chains separately. Those two can drift. |
| Server work per request | **B-** | Loaders already batch (`load_program_session_credits([ids])`, `load_program_credit_candidates(..., [programs])`), but every endpoint is still per-program. |

**Overall: C.** It works for one program in month mode. It doesn't scale with multiple programs, long programs, or continuous scrolling.

---

## What production SaaS calendars do

Google Calendar, Outlook and Linear-style timelines all use the same pattern:

1. **One range-bounded, owner-scoped feed endpoint** (`events.list?timeMin&timeMax`). It returns render-ready items for everything in the range, not per-container detail.
2. **Fixed, aligned chunks** (for example calendar months), each cached under its own key. Scrolling never produces a new, unique range. It only turns chunks on and off, so the cache reuses them fully.
3. **Viewport plus overscan.** Chunks that intersect the visible rows load first. One chunk on each side is prefetched when the browser is idle, so scrolling shows no spinner.
4. **Show stale data while revalidating, per chunk.** A loading chunk shows a quiet skeleton on its own cells only. Other data never disappears.
5. **Narrow invalidation.** A mutation invalidates the feed root, and only the chunks on screen refetch right away. Off-screen chunks refetch when they come back into view.

Full detail (blocks, day definitions and templates) loads **only** for the program being edited in the side pane. The calendar never needs it.

---

## S+ plan

### 1. Backend: root-scoped calendar feed (single source of truth)

**New endpoint:** `GET /api/<root_id>/programs/calendar-feed?range_start=YYYY-MM-DD&range_end=YYYY-MM-DD&timezone=Area/City`
- Range is 1–62 days. Month chunks are 28–31 days, and 62 allows two chunks in one call.
- The blueprint lives in `blueprints/programs_api.py` and stays thin. It reuses `_request_program_calendar_range()`-style parsing with a new `MAX_CALENDAR_FEED_DAYS = 62`.

**New service:** `services/program_calendar_feed_service.py` → `ProgramCalendarFeedService(session).get(root_id, user_id, start, end, timezone_name)`

Response shape (`schema_version: 1`):

```jsonc
{
  "schema_version": 1, "timezone": "...", "range": {"start": "...", "end": "..."},
  "programs": [{ "id", "name", "color", "start_date", "end_date" }],          // those overlapping the range
  "blocks":   [{ "id", "program_id", "name", "color", "start_date", "end_date" }],
  "days": [{                                                              // one per (program, date) with a fact worth drawing
    "date", "program_id", "block_ids",
    "state", "automatic_state", "manual_status", "status_source", "scheduled",
    "chain_role", "run_length_at_date", "breaks_chain", "counts_as_success",
    "occurrences": [{ "program_day_id", "name", "block_id",
                      "templates": [{ "id", "name", "color", "is_required" }],
                      "goal_ids": [...] }]                                    // light: no template_data
  }],
  "sessions": [{ "id", "name", "date", "template_id", "template_name", "template_color",
                 "program_id", "credits": [{ "program_id", "program_day_ids", "source" }] }],  // root-wide, ONCE
  "periods":  [ ...serialize_calendar_period... ]
}
```

How it's built:
- Load the programs that overlap the range with one query, using `_program_serializer_load_options()`. Loaders stay batched:
  - `load_program_session_credits(session, program_ids, chain_start, chain_end)`
  - `load_program_credit_candidates(..., programs, ...)`
  - status overrides with `program_id IN (...)`
  - `load_calendar_periods` once.
- For each program, run `build_day_facts` over its `_resolve_chain_window` (so chain and streak roles stay correct at chunk edges), then keep only the facts inside the range. This is the **same evaluator** the day read model uses, so the statuses match.
- Load completed sessions **once** for the whole root (move `ProgramDayReadModelService._load_completed_sessions_by_date` into a shared helper, `services/program_calendar_sessions.py`). Attach per-program credit facts from each program's facts, so one session can show its credit to several programs without being duplicated.
- **Leave out** evidence and alignment evaluation (`load_resolved_evidence`). That belongs to the day detail and metrics and is the most expensive part of today's read model. The feed only needs state, chain and occurrences.
- Log `calendar_feed_response bytes=… ms=… programs=… days=… sessions=…`, the same way as `program_metrics_response`.
- Response headers: `Cache-Control: private, no-cache` plus a weak `ETag` (a hash of the payload). A conditional GET can then return `304` when a background revalidation finds nothing changed. Add a `must-revalidate` note to index.md.

Refactor note: pull the shared "load inputs → build facts" step out of `ProgramDayReadModelService.get` into a small function that both services call. The single-program read model stays the source for the side pane's range summary and the day detail, so it is **not** removed.

### 2. Frontend: chunked, viewport-driven query hook

**New pure module:** `client/src/utils/calendarChunks.js`
- `monthChunksForRange(start, end)` → `['2026-08', '2026-09', ...]`
- `chunkRange(monthKey)` → `{ start, end }`
- `withOverscan(chunks, n = 1)`

**Query key** in `hooks/queryKeys.js`:
- `programCalendarFeedRoot: (rootId) => ['program-calendar-feed', rootId]`
- `programCalendarFeed: (rootId, tz, month) => ['program-calendar-feed', rootId, { tz, month }]`

**New hook** `hooks/useProgramCalendarFeed.js`, `useProgramCalendarFeed(rootId, timezone, viewportRange)`:
- `visibleChunks = monthChunksForRange(viewportRange)`
- `useQueries` over `visibleChunks`, with `staleTime` 60 s, `gcTime` 10 min, and `placeholderData: keepPreviousData` **per chunk key only**.
- An effect prefetches `withOverscan(visibleChunks) − visibleChunks` using `queryClient.prefetchQuery` inside `requestIdleCallback` (falling back to `setTimeout`). Scrolling into the next month is then instant.
- It merges the chunks into one normalized view `{ programs, blocks, daysByKey, sessionsByDate, periods }`, deduplicated by id, because programs and blocks repeat across chunks.
- It returns `loadingChunks` (the set of months with no data yet) so the view can put a skeleton on just those cells.
- It reuses `useMidnightInvalidation`, which becomes exported from `useProgramDayReadModel.js`, but pointed at `programCalendarFeedRoot`.

**The viewport range is the real visible rows, not the rendered window.** In `ProgramCalendarView.jsx`, the continuous scroll listener already finds the top row. Extend it to also find the **last** row whose top is above the scroller's bottom. Emit `onVisibleRangeChange({ start, end })` with a debounce: rAF plus about 120 ms trailing, and only when the range actually changes.
- Month mode: emit the `datesSet` range (6 weeks, which covers 2–3 chunks).
- Initial mount: the page seeds `viewportRange` from today (`getInitialCalendarRange`). The first paint therefore requests today's month plus its neighbours, **in parallel**, before FullCalendar has measured anything.

### 3. Page and event building

In `pages/ProgramCalendarPage.jsx`:
- Replace `useProgramsCalendarData`'s ranged summary, `useVisibleProgramCalendarDetails`, and the calendar use of `useProgramDayRange` with `useProgramCalendarFeed`.
- `visibleCalendarRange` → `viewportRange`, fed by `onVisibleRangeChange`.

Keep:
- `useProgramData(selectedProgramId)` (full detail) for the **side pane and editor only**.
- `useProgramDayRange` for the side pane's summary, bounded to the **viewport**, not the 52-week window (and capped at 62 days).
- The unranged `/programs/calendar` summary for the program picker and for `activeProgramId`.

**New adapter** in `utils/programViewModel.js`: `buildCalendarFeedEvents(feed, { goals, getGoalColor, … })`.
- It emits the **same event shapes and `extendedProps`** as `buildProgramsCalendarEvents`, `buildCompletedSessionEvents` and `buildCalendarPeriodEvents` produce today (`program_background`, `block_background`, program-day events, session events, period events). That leaves `ProgramCalendarEventContent`, the status marks, the streak lines and `nestContributingSessionsInProgramDays` unchanged.
- Goal-deadline events still come from the goals tree, which is already loaded.

Also on the page:
- Remove `calendarProjectionReady`'s "hide everything while fetching". Cells in `loadingChunks` get a `data-loading` attribute, which renders a subtle shimmer in `ProgramCalendarView.module.css` and respects `prefers-reduced-motion`.
- Delete `hooks/useVisibleProgramCalendarDetails.js` and the ranged branch of `get_program_summaries`. The unranged summary stays.

### 4. Invalidation

- Every mutation root that currently invalidates `programCalendarRoot` or `programDayReadModelRoot` also invalidates `programCalendarFeedRoot(rootId)`. That covers program/block/day CRUD, day statuses, session credits, session create/complete/delete, calendar periods, and agent change subscriptions (`AgentChangeSubscription.jsx`).
- React Query refetches only the chunks that are currently observed. Off-screen chunks go stale and refetch when they come back into view.

### 5. Documentation

- index.md, Programs paragraph: "The calendar reads one root-scoped, month-chunked feed (`/programs/calendar-feed`) that is loaded by viewport plus one month of overscan. Full program detail loads only for the side pane."
- Save this plan to `planning/program-calendar-viewport-feed.md` after approval.

---

## Payload: is it heavy?

These are estimates. The new log line will confirm them.

| Scenario | Today | With the feed |
|---|---|---|
| Initial load (today, 2 programs overlapping) | 2× full `getProgram` (**~100 KB–1 MB+ each**, growing with history) + 2× month read model + 1× **364-day** read model (continuous) | 3 month chunks: about **8–25 KB each raw, ~2–5 KB gzipped** |
| Scroll one month | New visible-month key: up to N× `getProgram` (if not cached) + N× read model | Usually **0 requests** (prefetched). Otherwise 1 small request |
| Server CPU | Evidence evaluation over up to a year, plus N× duplicate session loads | Facts only (no evidence), with sessions loaded once per chunk |

Rough per-chunk math:
- about 31 days × programs overlapping (usually 1–2) × about 350 B per day-fact ≈ 11–22 KB,
- plus sessions at about 250 B each (60 in a busy month ≈ 15 KB).

Flask should gzip responses. Check whether `flask-compress` or the proxy already does this. If neither does, add it: JSON like this shrinks 5–8×.

---

## Files

- **Backend (new):**
  - `services/program_calendar_feed_service.py`
  - `services/program_calendar_sessions.py` (the shared completed-session loader)
  - `tests/integration/test_program_calendar_feed_api.py`
- **Backend (edit):**
  - `blueprints/programs_api.py` (new route; drop the ranged summary branch)
  - `services/program_day_read_model_service.py` (use the shared loaders)
  - `services/_program_crud.py` (simplify `get_program_summaries`)
- **Frontend (new):**
  - `client/src/utils/calendarChunks.js`
  - `client/src/hooks/useProgramCalendarFeed.js`
  - tests for both
- **Frontend (edit):**
  - `pages/ProgramCalendarPage.jsx`
  - `components/programs/ProgramCalendarView.{jsx,module.css}` (`onVisibleRangeChange`, loading cells)
  - `utils/programViewModel.js` (feed adapter)
  - `hooks/queryKeys.js`
  - `hooks/useProgramsCalendarData.js` (unranged only)
  - `hooks/useProgramData.js` and the other mutation hooks (invalidation)
  - `utils/api.js` (`getProgramCalendarFeed`)
- **Delete:** `client/src/hooks/useVisibleProgramCalendarDetails.js`

## Verification

**Backend (pytest):**
- The feed returns every overlapping program, and none outside the range.
- Day states and chain roles equal the single-program read model's for the same dates. This parity test guards against the two sources drifting.
- Chains stay correct at a chunk's first day.
- Sessions appear once, even when several programs credit them.
- Sessions appear with **no** program.
- A range over 62 days → 400. Another user's root → 404.
- The number of queries stays constant as programs grow (assert with SQLAlchemy event counting).

**Frontend (Vitest):**
- `calendarChunks`: month boundaries, leap years, overscan.
- `useProgramCalendarFeed`: requests only the visible chunks, prefetches neighbours, merges and deduplicates, and keeps other chunks' data while one loads.
- `ProgramCalendarView`: in continuous mode, `onVisibleRangeChange` reports the top and bottom visible rows (scroll stubbed).
- The page's parity snapshot matches: the feed adapter produces the same events as the old builders for a fixture.

**E2E:** extend `client/e2e/program-calendar-continuous.spec.js`.
- Two programs in consecutive months.
- Scroll across the boundary: both programs' days and sessions render in the lower half of the viewport.
- The network log shows only month-chunk feed requests, and no `GET /programs/:id` until a program is scoped.

**Manual (`/run`):**
- Open Programs: it centers on today, and the DevTools network panel shows 3 small feed calls.
- Scroll six months quickly: no blank flashes and no hide-all flicker.
- Complete a session: only the visible chunk refetches.
- Check response sizes in the logs.

---

## Implementation notes (2026-09-26)

These are the places where the build differs from the plan above:
- **Evidence stays in the feed.** The feed builds facts through the shared `ProgramDayReadModelService.build_range_facts`, including goal-evidence evaluation. That keeps unscheduled-day states (`unscheduled_evidence` vs `rest`) identical to the side pane's read model. The integration parity test enforces this. The cost is bounded to one month per overlapping program.
- **Loaders run per program.** Overlapping programs have different chain windows, so credit, candidate and override loads run once per overlapping program (usually one or two per chunk). Calendar periods and completed sessions still load once per chunk.
- **The adapter is its own module.** The feed merge and event adapter live in `client/src/utils/programCalendarFeed.js`, not in `programViewModel.js`. Goal-deadline events still come from `buildProgramsCalendarEvents([], goals, …)`.
- **Ribbons carry their own state.** Each ribbon carries its own program's date fact (`extendedProps.dayState`), so every program's ribbon shows its own status, not the selected program's.
- **No separate range read model on the page.** The page no longer calls `useProgramDayRange`. Status marks, streaks and multi-day selection read the selected program's rows from the feed.
- **One error boundary for both routes.** The feed and day-read-model routes share `_calendar_read_model_response`, so the blueprint's SQLAlchemy error boilerplate doesn't grow (the maintainability gate enforces this).
- **Flask-Compress was already enabled**, so responses are gzipped.
- **Measured payloads** in the browser test server: month chunks of 2.5–5 KB raw, with unchanged revalidations answering `304`.
