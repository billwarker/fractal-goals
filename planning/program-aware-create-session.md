# Program-Aware Create Session

## Context

Commit `19b2378` ("feat: scope goal tree to active programs") taught the goal tree to understand programs: a checkbox per active program narrows the FlowTree to that program's goal lineage, persisted per user+fractal, with auto-deselect when a program leaves its date window.

The Create Session page has not caught up. It knows programs exist — it groups program days, lets you pick one, and the server quietly narrows *automatic* (activity-derived) goals to the program — but none of that is visible or controllable. Concretely, today:

- The session goal hierarchy shows every goal in the fractal, even when you have explicitly chosen a program day.
- Nothing tells you that today *is* a program day. If you arrive via "Add Session" you have to notice the program section yourself.
- `/programs/active-days` already returns `program_goal_ids`, `block_goal_ids`, `is_required`, `order`, `completion_min_templates`, and `completed_session_count` per row — **the client discards all of it**.
- `programsByName` keys program selection by *name*, so two programs sharing a name silently merge into one.
- `useCreateSessionPageData` fetches `goalsForSelection` on every page load and never reads it.

Intended outcome: Create Session becomes the same kind of program-aware surface the goal tree now is — it tells you when you're on a program day, prioritizes that day's templates, scopes the goal hierarchy to the program by default, and warns (without blocking) when you go off-program.

**Almost all of this needs no new data.** One small backend change (a `?date=` param) and one response-field addition; **no migration**.

---

## Grade of the current codebase for this work: **B**

**Why B:** the pattern to copy is already shipped and proven (`getActivePrograms` → scope id set → single `Set.has` choke point → auto-deselect effect → localStorage prefs). `getGoalLineageScope`, `collectProgramGoalIds`, `getProgramColor`, `getProgramDayTemplateRules`, and `usePrograms` all exist and are directly reusable. The server already serializes every field the UI needs.

**What holds it back:**
1. `selectedProgram` is keyed by program **name** — a live correctness bug that must be fixed before program-scoped state means anything.
2. `getGoalLineageScope` needs the **nested** tree; `SessionGoalScopePanel` consumes the **flat** `allGoals`. The hook must expose both.
3. All four selection handlers blindly `setManualGoalIds([])`, which will fight the scope toggle unless refactored.
4. `get_active_program_days` uses server `date.today()` while the client is timezone-aware.

Phase 0 clears 1–3; Phase 1 clears 4. Reaching S+ is mostly about paying those down first rather than layering features on top.

---

## Decisions (confirmed with user)

| Decision | Choice |
|---|---|
| Timezone | Add an optional `?date=` param to `/programs/active-days`; client passes its `getISOYMDInTimezone` date. |
| Scope semantics | **Lineage** (ancestors + node + descendants) via `getGoalLineageScope`, matching FlowTree. Strict membership would orphan children and render a broken tree. |
| Scope default | **ON** when a program day is selected. Unchecking is remembered **per program id**, so a different program still starts scoped. |
| Out-of-scope manual goals | Keep them selected; show an inline "N selected goals are outside this program" notice with a "Remove them" action. Never silently drop. |
| Server-side manual goal scoping | Advisory only — `preview` returns `program_scope_goal_ids`; `create_session` records off-program ids but **does not reject**. |
| Migration | None. |

---

## Phase 0 — Correctness prerequisites (blocking)

Independently shippable; unblocks everything else.

**`client/src/hooks/useCreateSessionPageData.js`**
- Delete the `goalsForSelection` query and its `goals:` return field (verified unused; this hook is its only consumer).
- Rename `groupProgramDaysByName` → `groupProgramDaysById`, keyed on `day.program_id`, each entry `{ program_id, program_name, days }`; return as **`programsById`**.
- Return **`goalTree: goalTreeQuery.data`** alongside the flat `allGoals`. This is the fix for the nested-vs-flat problem: `getGoalLineageScope` consumes `goalTree`, `GoalHierarchySelector` keeps consuming `allGoals`, and scope is applied as an id-`Set` filter over the flat list.
- Change `dedupeProgramDays`'s key from `${program_id}-${block_id}-${day_name}-${templateIds}` to `day.day_id` — two genuinely distinct days sharing a name and template set currently collapse into one, which would understate Phase 2's completion math.

**`client/src/pages/CreateSession.jsx`**
- `selectedProgram` → `selectedProgramId`; `handleSelectProgram(programId)`; `currentProgramDays = programsById[effectiveSelectedProgramId]?.days`.
- Extract `resetSelectionState({ keepProgramDay } = {})` and call it from all four selection handlers, so scope changes don't wipe manual goal picks.

**`client/src/components/createSession/ProgramSelector.jsx`**
- Props `programsByName` → `programsById`, `selectedProgram` → `selectedProgramId`. Iterate `Object.values(programsById)`, `key={program.program_id}`, `onSelectProgram(program.program_id)`.

**Tests**
- `client/src/hooks/__tests__/useCreateSessionPageData.test.jsx` (exists) — two same-named programs yield two `programsById` entries; `goalTree` returned; `goalsForSelection` never fetched; two same-named days in one block both survive dedupe.
- `client/src/components/createSession/__tests__/ProgramSelector.test.jsx` (**new**) — two same-named programs render as distinct cards.
- Update the hook mock in `client/src/pages/__tests__/CreateSession.test.jsx`.

---

## Phase 1 — Program scope toggle on the goal hierarchy

**Backend: timezone-correct active days**
- `services/_program_days.py:450` `get_active_program_days(cls, session, root_id, current_user_id=None, *, target_date=None)` — `today = target_date or date.today()`. Everything downstream (`_program_day_scheduled_on`) already takes a date.
- `blueprints/programs_api.py:339` — parse an optional `?date=YYYY-MM-DD` query param, 400 on malformed input, pass as `target_date`.
- `client/src/utils/api/fractalProgramsApi.js` — `getActiveProgramDays(rootId, date)` appends the param when present.
- `client/src/hooks/queryKeys.js` — `activeProgramDays(rootId, date)` includes the date so day rollover refetches.
- `useCreateSessionPageData(rootId, todayISO)` accepts and threads the date; `CreateSession` supplies `getISOYMDInTimezone(new Date(), timezone)` from `useTimezone()` (`client/src/contexts/TimezoneContext.jsx`), the same source `FractalGoals.jsx:66` uses.

**New `client/src/hooks/useCreateSessionPreferences.js`** — sibling of `useFlowTreePreferences.js`; **reuse its exported `readLocalStorageValue` / `writeLocalStorageValue`**, do not redeclare.
- Key `create-session-preferences:${userId || 'anonymous'}:${rootId}`, `STORAGE_VERSION 1`.
- Shape `{ programScopeOptOut: { [programId]: true } }` — per-program memory, so unchecking one program leaves others scoped.
- Returns `{ isProgramScopeEnabled(programId), setProgramScopeEnabled(programId, enabled), isHydrated }`.

**`client/src/pages/CreateSession.jsx`**
- Seed ids come straight off the selected day row — no extra fetch:
  `programScopeSeedIds = uniq([...selectedProgramDay.program_goal_ids, ...selectedProgramDay.block_goal_ids])`
- `scopeActive = Boolean(selectedProgramDay) && !isQuickTemplate && isProgramScopeEnabled(selectedProgramDay.program_id)`
- `programScopeGoalIds = useMemo(() => scopeActive && goalTree ? getGoalLineageScope(goalTree, programScopeSeedIds) : null, [...])` — import from `client/src/components/flowTree/flowTreeTreeUtils.js`.
- **Choke point** (one `Set.has` guard, mirroring `flowTreeGraphUtils.js:165`):
  `scopedGoals = programScopeGoalIds ? allGoals.filter(g => programScopeGoalIds.has(String(g.id ?? g.attributes?.id))) : allGoals`
- `offScopeManualGoalIds` = manual ids not in the set; `handleClearOffScopeGoals` filters them out.

**`client/src/components/createSession/SessionGoalScopePanel.jsx`**
- New props: `programScopeAvailable`, `programScopeEnabled`, `onProgramScopeChange`, `programName`, `programColor`, `offScopeGoalCount`, `onClearOffScopeGoals`.
- Render a `Checkbox` (`client/src/components/atoms/Checkbox.jsx`, the same atom `FlowTreeOptionsPane` uses, with its `containerStyle` prop) labelled `Only goals in {programName}`, tooltip copied verbatim from FlowTree: *"Only show goals in {name}, including their ancestors and descendants."*
- Off-scope notice row + "Remove them" button when `offScopeGoalCount > 0`.
- Pass a scoped `emptyState` (`"No goals in this program."`) through `GoalHierarchySelector`'s existing prop — no new mechanism.
- `programScopeAvailable` must be `false` whenever `readOnly` (quick sessions), so no dead toggle appears.
- Mobile: the `HeaderButton` label becomes `Session Goals · {programName}` when scope is active — the panel lives behind a `Modal` on mobile and would otherwise give zero scope feedback.
- CSS: `.scopeRow`, `.offScopeNotice`, `.programSwatch` in `SessionGoalScopePanel.module.css`.

**Tests**
- `client/src/components/createSession/__tests__/SessionGoalScopePanel.test.jsx` (exists) — toggle only when available; never for quick sessions; off-scope notice + clear action; scoped empty state.
- `client/src/pages/__tests__/CreateSessionProgramScope.test.jsx` (**new**, mirroring `FractalGoalsProgramScope.test.jsx`) — program day narrows the panel's `goals` to the lineage set; unchecking restores; **manual selections survive the toggle**; no-program user sees no toggle and an unfiltered list.
- `client/src/hooks/__tests__/useCreateSessionPreferences.test.jsx` (**new**) — hydration, per-program isolation, per-user/root isolation, malformed-JSON tolerance.
- `tests/integration/test_programs_api.py` (exists) — `?date=` returns that date's days; malformed date 400s; omitted param preserves current behavior.

---

## Phase 2 — "Today is a program day" + template prioritization

**New `client/src/utils/createSessionProgramDay.js`** (pure, standalone-tested)
- `buildTodayProgramDayView(programDays)` → `{ hasProgramDayToday, days, requiredTemplateIds, allTemplateIds, totalRequired, completedCount, minTemplates, isDayComplete }`, reading the rows' own `is_required` / `order` / `completion_min_templates` / `completed_session_count`. Use `getProgramDayTemplateRules` from `programViewModel.js` where a `templates` array shape is in hand — do not write a new sorter.
- `partitionTemplatesByProgram(templates, programTemplateIds)` → `{ programTemplates, otherTemplates }`, each preserving `TemplatePicker`'s existing `getTemplateSortTimestamp` order.

**New `client/src/components/createSession/ProgramDayTodayBanner.jsx`** (+ `.module.css`; add to `index.js`)
- Props: `programName`, `blockName`, `dayName`, `dayNumber`, `blockColor`, `completedCount`, `minTemplates`, `totalRequired`, `isDayComplete`, `onJumpToProgramDay`.
- `block_color`-accented callout — *"Today is Day 4 — Upper Push · Strength Base"* — with a `completedCount / minTemplates` progress meter and a "Start this day" action. Muted "Day complete" state when done, so it stops nagging.

**`client/src/pages/CreateSession.jsx`**
- Render the banner above `SourceSelector` when `hasProgramDayToday`; `onJumpToProgramDay` selects the program then the day.
- **Auto-select**: exactly one program day today with exactly one *required* session and no explicit `sessionSource` → preselect program + day + session. Generalizes the existing `defaultSessionSource` block. Guard with `hasAutoSelectedRef` so the user can navigate away.

**`client/src/components/createSession/TemplatePicker.jsx`**
- New props `programTemplateIds`, `requiredTemplateIds`, `completedTemplateIds`, `programName`.
- Pinned `"Today in {programName}"` group rendered before the existing grid — prioritizes without hiding anything.
- Per-card pills in the existing `.pillRow` beside "Active Program": `Required` / `Optional` / `Done today`.

**Tests**
- `client/src/utils/__tests__/createSessionProgramDay.test.js` (**new**) — required/optional partitioning, ordering, completion math, empty input.
- `client/src/components/createSession/__tests__/ProgramDayTodayBanner.test.jsx` (**new**) — progress text, complete state, jump action.
- `client/src/components/createSession/__tests__/TemplatePicker.test.jsx` (exists) — pinned group ordering; pills; **unchanged rendering when `programTemplateIds` is empty** (no-program regression guard).
- `client/src/pages/__tests__/CreateSession.test.jsx` (exists) — single-required-day auto-select; banner absent for no-program users.

---

## Phase 3 — Program context header + off-program warning

**`client/src/pages/CreateSession.jsx`**
- `PageHeader` subtitle becomes `"Day 4 of Strength Base · {programName}"` when a program day is selected; current copy otherwise.
- Off-program warning when `hasProgramDayToday && !selectedProgramDay && selectedTemplate && !programTemplateIds.has(selectedTemplate.id)`: *"This session isn't part of today's program day."* plus a "Use the program day instead" link. **Non-blocking** — going off-program is legitimate.

**`client/src/components/createSession/CreateSessionActions.jsx`**
- New props `offProgramWarning` (node|null), `programDayLabel`. Render the warning above the button; extend `SessionSummary` to the full `{program_name} · {block_name} · {day_name}` breadcrumb (it currently shows only `program_name`).

**Tests**
- `client/src/components/createSession/__tests__/SessionCreationActions.test.jsx` (exists) — warning only in the off-program case; never disables the button; full breadcrumb in the summary.

---

## Phase 4 — Deep link from the program calendar

**`client/src/pages/CreateSession.jsx`**
- Read `program_day_id` via `useSearchParams()`. Once `programDays` resolves, match the row and select program + day (+ its single session), sharing `hasAutoSelectedRef` with Phase 2. Then `setSearchParams({}, { replace: true })` so refresh/back doesn't re-force the selection.
- If the id isn't in the returned rows, show a dismissible notice: *"That program day isn't scheduled for today."*

**`client/src/pages/ProgramCalendarPage.jsx`**
- Add a "Start session" action on a today-occurrence → `/${rootId}/create-session?program_day_id=${dayId}`. The occurrence click handler is near `handleSelectProgramOption` (~line 687).

**Tests**
- `client/src/pages/__tests__/CreateSessionDeepLink.test.jsx` (**new**) — valid id preselects program/day/session; unknown id shows the notice without crashing; param is cleared.

---

## Phase 5 — Server hardening (no migration)

**`services/session_lifecycle_service.py`**
- `preview_goal_scope` (~line 197): also return `program_scope_goal_ids: sorted(program_goal_ids)` when `program_day_id` is supplied. `_program_scope_goal_ids` already computes this and currently discards it after filtering. Lets the client scope from the authoritative `program_goals` table rather than the `active-days` row shape.
- `create_session` (~line 322): when `program_day_id` is set, record `off_program_goal_ids = set(goal_ids) - program_goal_ids` into `session_data.program_context` for later analytics. **Do not reject** — `_replace_manual_goal_scope` stays root-scoped, since rejecting would break duplicate-session flows and older clients.
- `validators/sessions.py`: no change. `SessionGoalScopePreviewSchema` is a request schema; these are response-only additions.

**Tests**
- `tests/integration/test_sessions_api.py` (exists) — `goal-scope-preview` with `program_day_id` returns `program_scope_goal_ids` matching `program_goals`; empty without one.
- `tests/integration/test_programs_api.py` (exists) — **the highest-value backend addition**: assert `/programs/active-days` rows carry `program_goal_ids`, `block_goal_ids`, `is_required`, `order`, `completion_min_templates`, `completed_session_count`. This contract is currently untested and Phases 1–3 all depend on it.

---

## Verification

**Automated**
- Client: `cd client && npx vitest run src/pages/__tests__/CreateSession*.test.jsx src/components/createSession src/hooks/__tests__/useCreateSession*.test.jsx src/utils/__tests__/createSessionProgramDay.test.js`
- Server: `./run-tests.sh` or `pytest tests/integration/test_programs_api.py tests/integration/test_sessions_api.py`
- Full pre-push client suite (four fork workers) before merging.

**Manual (Flask :8001, Vite :5173)**
1. *No-program fractal* — Create Session is byte-for-byte unchanged: no banner, no toggle, no pills, full goal list. This is the primary regression check.
2. *Active program, today is a program day* — banner names the program/block/day with a `n/m` meter; the day's templates are pinned under "Today in {program}" with Required/Optional pills; a single required day auto-selects.
3. *Goal scope* — with the day selected the hierarchy is narrowed to the program's lineage and the toggle is checked. Uncheck → full tree, manual picks intact. Reload → still unchecked for *that* program; switch to a second active program → checked again.
4. *Off-scope goals* — select a manual goal, then enable scope: the "N selected goals are outside this program" notice appears; "Remove them" clears exactly those.
5. *Off-program* — on a program day, pick a non-program template from the template path: the caution appears, and the Create button still works.
6. *Deep link* — from `/:rootId/programs`, "Start session" on today's occurrence lands preselected with a clean URL. Hand-edit to a bogus `program_day_id` → notice, no crash.
7. *Quick session* — the goal panel stays read-only with **no** scope toggle; program days still reject quick templates.
8. *Timezone* — set the profile timezone well ahead of the server (e.g. Pacific/Auckland) near local midnight and confirm the banner follows the user's date, not the server's.
9. *Mobile* (≤768px) — the goal panel opens as a sheet and the header button reads `Session Goals · {programName}` when scoped.
10. *Duplicate names* — create two active-window programs with identical names and confirm they appear as two selectable entries whose days do not merge.

**Risks to watch**
- **Reset churn**: the `resetSelectionState` refactor is the single most likely place to regress; the "manual selections survive the toggle" test is the guard.
- **Flat-list filtering**: filtering `allGoals` before `GoalHierarchySelector` is safe because `buildChildIdsByParent` re-derives parentage from the filtered set — this is precisely why lineage scope was chosen over strict membership.
- **Overlapping programs** are prevented server-side, so normally 0–1 active program; the per-program pref map handles legacy multi-program data anyway.
