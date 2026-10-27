# Notes page refresh: categories, saved filters, heatmap, timeline rail

## Context

The Notes page (`client/src/pages/Notes.jsx`) works but is hard to use at scale:

- **11 note types** (`utils/noteTypes.js`) are exposed as a wall of filter chips that mirrors
  storage details (activity *instance* vs *set* vs *definition*, circuit *run* vs *round*).
- Filters are one-off: search, type, pinned, goal and activity must be re-entered every visit,
  and nothing survives navigation.
- There's no overview of *when* notes were written. Sessions and goal details have heatmaps;
  notes don't.
- The timeline's connecting lines are hand-positioned per breakpoint, break at every date
  header, and session groups repeat their label inside each card ("Session note" under an
  "Upper Body – Heavy" header that already says it's a session).

Outcome: a compact page where the user picks from **4 categories**, clicks **saved filters**
(keyword or regex, combinable), scans a **notes heatmap**, and reads a cleaner timeline.

## Decisions (from your answers)

- **Categories (4):** General · Goals · Sessions · Programs.
  - *Assumption to confirm:* "drop activity notes" means dropping the **Activities** category,
    i.e. notes written about an activity itself (`activity_definition`), not notes written on
    an activity *during a session*. Existing activity-definition notes are shown under
    **General** and stay findable with the Activity filter. Composing on the Notes page can
    still link a note to an activity.
  - Category mapping (by `context_type`, so it's pure SQL):
    - General: `root`, `activity_definition`
    - Goals: `goal` (note · review · completion become a card label)
    - Sessions: `session`, `activity_instance`, `circuit_run`, `circuit_round`
      (card label: "Session", "Bench Press", "Bench Press · Set 2", "Circuit · Round 3")
    - Programs: `program`
- **Saved filters capture the full filter state:** name + text (keyword or regex) + categories +
  goal + activities/groups + pinned.
- **Several saved filters can be active at once; a note must match all of them (AND)**, plus any
  ad-hoc controls currently set.

## Grade of the current implementation (with respect to this plan)

| Area | Grade | Evidence |
|---|---|---|
| Query engine | **C** | `NoteService.get_all_notes` with `note_types` loads and serializes *every* note in the fractal, then paginates in Python (`services/note_service.py:529-546`). Search is unescaped `ILIKE '%…%'` (`%`/`_` act as wildcards). No `(root_id, created_at)` index for the feed. |
| Type model | **C-** | 11 types; backend `note_type_label` lacks `goal_review_note` and drifts from `utils/noteTypes.js`. |
| Filter UX | **D** | Four stacked sections, an 11-chip grid, no saved filters, no URL state. |
| Overview | **F** | No heatmap or date navigation. |
| Timeline visuals | **C+** | Magic-number marker offsets duplicated for mobile; rail restarts per day; redundant session labels. |
| **Overall** | **C-** | Solid CRUD and rendering; discovery and scale are the gaps. |

## S+ plan

### 1. Backend: one filter spec, applied in SQL

New `services/note_filter_spec.py` (pure, testable):
- `normalize_spec(raw)` → `{text, text_mode: 'keyword'|'regex', categories, goal_id,
  activity_definition_ids, activity_group_ids, pinned_only}`. Unknown keys rejected. Limits:
  text ≤ 200 chars, ≤ 50 ids per list.
- `CATEGORY_CONTEXT_TYPES` mapping above; `derive_note_category(context_type)` exported for
  serialization.
- `apply_spec(query, spec, db)`:
  - Categories → `Note.context_type.in_(…)`.
  - Goal/activity/group/pinned → the existing conditions, moved here from `get_all_notes`.
  - **Keyword:** split on whitespace with `"quoted phrases"` kept whole; each term AND-ed as
    `ILIKE` with `%`, `_` and `\` escaped (`escape='\\'`); case-insensitive.
  - **Regex:** PostgreSQL `~*` (case-insensitive POSIX). It is validated before use with
    `SELECT '' ~* :pattern` inside a savepoint; an invalid pattern returns
    `400 {code: 'invalid_regex'}` with a short reason. Queries that use a regex run with
    `SET LOCAL statement_timeout = '3s'`; a timeout returns `400 regex_too_slow`.
- Text matches `Note.content` and attachment file names (`EXISTS` on `note_attachments` →
  `media_assets.name`).

`NoteService.get_all_notes(root, user, specs, page, page_size, date=None, timezone=None)`:
- `specs` = ad-hoc spec + each active saved filter's spec; all applied → AND.
- `date` + `timezone` filters to that local day (heatmap selection), computed server-side.
- **Removes the Python pagination path**; everything is `count()` + `limit/offset` in SQL.
- The `note_types` query parameter is replaced by `categories`. Its only consumers are the Notes
  page and two tests, which are updated.

`NoteService.get_notes_heatmap(root, user, specs, timezone)`: same filters; groups by local day in
SQL (`date(timezone(:tz, timezone('UTC', created_at)))`). Returns
`{days: [{date, count}], max_count, total, range_start, range_end}`, from the first matching note
to today. This mirrors `get_session_heatmap` (`services/session_analytics_service.py:257`).

Serialization (`services/_serialize_notes_misc.py`): add `note_category` and `note_detail_label`
("Review", "Bench Press · Set 2", …). Keep `note_type`, which the goal timeline, session views
and agent use, and add the missing `goal_review_note` label.

### 2. Backend: saved filters

Migration `<rev>_note_filters_and_feed_index.py`:
- Table `note_filters`: `id`, `root_id` (FK goals, cascade), `name` (String 60, unique per root),
  `spec` (JSON, validated by `normalize_spec`), `position` (int), `created_at`, `updated_at`.
  The fractal's owner owns them.
- Index `ix_notes_root_live_created` on `(root_id, created_at)` `WHERE deleted_at IS NULL`, for
  the feed, date filter and heatmap.

`services/note_filter_service.py`: list / create / update (name, spec, position) / delete, with
root ownership checks. Regexes are validated on save. At most 30 filters per fractal.

Routes in a thin `blueprints/note_filters_api.py`:
- `GET|POST /api/<root>/note-filters`, `PUT|DELETE /api/<root>/note-filters/<id>`.

Notes list and heatmap accept `filters=<id,id>` plus the ad-hoc params; the server loads those
filters' specs, so regexes are never re-sent from the URL and are always validated server-side.
Unknown or foreign filter ids return 404.

Data export includes saved filters. Public landing snapshots don't touch them.

### 3. Frontend: state and data

- `hooks/useNotesPageFilters.js`: URL search-param state like `useSessionsPageFilters.js`:
  `q`, `mode`, `cat`, `goal`, `act`, `grp`, `pinned`, `saved` (ids), `day`. Back/forward and
  shared links restore the view.
- `hooks/useNoteFilters.js`: saved-filter CRUD under a new `noteFilters` query key; a mutation
  invalidates `allNotesRoot` and the heatmap.
- `useNotesPageQuery` sends `categories`, `text`, `text_mode`, `filters`, `day`, `timezone`.
  New `useNotesHeatmap` under `queryKeys.notesHeatmap(rootId, filters)`.
- `utils/noteTypes.js`: replace `NOTE_TYPE_FILTER_OPTIONS` with `NOTE_CATEGORIES`, mirrored from
  the server mapping and checked against a shared fixture
  `tests/fixtures/note_categories.json`, the same pattern as `goal_deadline_cases.json`.

### 4. Frontend: page layout

Split `pages/Notes.jsx` (475 lines) into `components/notes/page/`:

- **`SavedFilterBar`**, at the top of the feed: one row of saved-filter chips (using the
  `atoms/Badge` / toggle button styles), horizontally scrollable on mobile.
  - Click toggles a filter. Active filters combine with AND, and a "Showing notes matching all
    selected filters" hint appears once two or more are active.
  - Each chip's `···` menu offers **Rename**, **Update to current filters** and **Delete**
    (inline confirm). It reuses the portaled menu pattern from `NoteOptionsMenu`.
  - **+ Save current filters** appears whenever ad-hoc filters are set; it asks for a name inline.
- **Compact controls** in the right pane (and the existing mobile sheet):
  1. **Heatmap** (`NotesHeatmap`, reusing `common/CalendarHeatmap`). Clicking a day filters the
     feed to that day; a dismissible "Oct 23 ×" chip appears in the filter bar. The selected
     day is highlighted.
  2. **Search** with a mode toggle `Keyword | Regex`. A regex error shows inline under the field
     and the previous results stay.
  3. **Category**: a single-line segmented multi-toggle `All · General · Goals · Sessions ·
     Programs`, replacing the 11-chip grid.
  4. **Goal**, **Activity** and **Pinned**: compact rows using the existing pickers.
- The Notes page **Write Note** composer keeps linking to a goal or activity.

### 5. Timeline rail refinement (`NoteTimeline.module.css`, `NoteTimeline.jsx`)

- **One continuous rail** down the feed. Date headers become labelled nodes on it and the rail
  no longer restarts per day.
- **Shared geometry:** all markers are positioned from CSS custom properties (`--rail-x`,
  `--node-size`, `--rail-gap`) set once on `.continuousTimeline`. Mobile changes only those
  variables; the per-element magic offsets (`left: -18px`, `-17px`, `-15px`, `-14px`) go away.
- **Session groups:** a filled node in the session template colour, aligned to the header's
  centre line. The heavy box becomes a light bracket, a thin vertical line in the template
  colour from the header to the last note. The "N notes" count stays.
- **Standalone notes:** small hollow nodes on the rail.
- **Inside a session group**, cards drop the repeated "Session note" title and "Session"
  metadata. They show the detail label (e.g. "Bench Press · Set 2") and time.
- Pinned notes stay in their own section above the rail.

### 6. Cleanup and docs

- Remove `NOTE_TYPE_FILTER_OPTIONS`, the `note_types` parameter and its Python pagination
  branch, and the stale chip CSS in `Notes.module.css`.
- `index.md`, Notes section: categories, filter spec and saved filters, heatmap, URL state.
- Save this plan to `planning/notes-page-refresh-2026-10-27.md` on approval.

## Critical files

**Backend:**
- `services/note_service.py`
- new `services/note_filter_spec.py`, `services/note_filter_service.py`
- `services/_serialize_notes_misc.py`
- `blueprints/notes_api.py`, new `blueprints/note_filters_api.py`
- `models/common.py` (`NoteFilter`), new migration
- `services/data_export_service.py`

**Frontend:**
- `pages/Notes.jsx`
- new `components/notes/page/{SavedFilterBar,NotesFilterControls,NotesHeatmap}.jsx`
- `components/notes/NoteTimeline.{jsx,module.css}`, `components/notes/NoteCard.jsx`
- new `hooks/{useNotesPageFilters,useNoteFilters}.js`, `hooks/useNotesPageQuery.js`
- `utils/noteTypes.js`, `utils/api/fractalNotesApi.js`, `hooks/queryKeys.js`

**Reuse:**
- `common/CalendarHeatmap`
- the `useSessionsPageFilters` URL pattern
- `ActivityFilterModal`, `GoalTreePicker`
- `atoms/Badge`
- the `NoteOptionsMenu` portal pattern
- `layout/ResponsiveSidePane` / `NotesMobileSheet`

## Verification

Backend (`./run-tests.sh file …`):
- **Spec:** normalization rejects unknown keys and over-long text.
- **Keyword search:** escapes `%`/`_`, AND-s terms, keeps quoted phrases whole.
- **Regex search:** matches case-insensitively; an invalid pattern gives `400 invalid_regex`; a
  pathological pattern hits the timeout and gives `400 regex_too_slow`.
- **Categories:** each maps to the right context types, and activity-definition notes land in
  General.
- **AND semantics:** across two saved filters plus ad-hoc filters.
- **Pagination:** totals and pages are correct with category filters, with no Python pagination.
  Assert it via the query count, plus a 5,000-note scaling test kept under the existing analytics
  timing budget style.
- **Day filter:** respects the timezone.
- **Heatmap:** counts per local day match the list totals for the same filters.
- **Saved filters:** CRUD, per-root ownership (cross-user 404), the 30-filter cap, unique names.
- **Migration:** parity and downgrade/reapply.

Frontend (vitest):
- URL state round-trips.
- Saved filter toggle/AND, save/rename/update/delete.
- Regex mode error display.
- Category segmented control.
- Heatmap day selection and clearing.
- Session-group cards omit the redundant labels.
- `noteTypes` categories match the fixture.

Gates: `./run-tests.sh lint` (maintainability budgets unchanged; `Notes.jsx` shrinks) and
`npm run build`.

Browser (Playwright, desktop + mobile):
- Create a note, save a regex filter, then toggle two filters (AND) and check the count.
- Click a heatmap day.
- Reload: state is restored from the URL.
- No horizontal scroll at 320–1280px.
- Take timeline screenshots to review the rail.

## Implementation notes (2026-10-27)

Delivered as planned, with these changes during review:

- **Saved filters live in the side pane** (your request mid-implementation): a "Saved filters"
  section heads the pane with checkable rows, each with a `···` menu (Rename, Update to current
  filters, Edit in filters, Delete). The feed shows only a read-only "Filtered by … · Edit filters ·
  Clear" line, which also tells mobile users what is applied while the pane is a sheet. The selected
  heatmap day is named beside the heatmap with **Show all days**.
- **Follow-up layout:** the side pane reads heatmap → search → saved filters → category, goal,
  activity, pinned. Filters are created from a button on the search bar's right edge, which opens a
  **Create filter** dialog pre-filled with the typed (even uncommitted) search text, the current mode,
  categories and pinned, and, opt-out, the current goal/activity filters. The inline
  "+ Save current filters" form was removed; **Update to current filters** stays in each filter's menu.
- The note options menu now flips to left alignment instead of running off the left edge (seen on
  saved filters), and skips disabled items.
- `note_detail_label` was not added server-side: the card already derives the detail label (activity,
  set) from serialized fields, and session-group cards now drop the repeated session title/type.
- Saving or updating a filter clears the ad-hoc controls in **one** URL update: consecutive
  `setSearchParams` calls in one handler overwrite each other (found by the browser test).
- `services/note_service.py` shrank below the default 800-line cap, so its backlog exception was
  removed. `Notes.module.css` dropped 37 unused rules (584 → 159 lines).

Verification: 11 feed/filter backend tests (categories, keyword escaping, regex validation and
timeout mapping, AND across saved filters, local-day filter, heatmap, CRUD and ownership, 5,000-note
timing), existing note suites; frontend unit tests for URL state, saved filters, controls, summary,
heatmap selection, timeline labels and menu placement; lint/type/maintainability gates; build;
Alembic upgrade/check/downgrade/reapply; Playwright `notes-page.spec.js` on desktop and mobile.

### Second follow-up (2026-10-27)

- Side-pane sections use the Sessions sidebar style: divided blocks with plain 13px headings.
- **Regex search was removed** from the pane, the dialog and the server (along with its validation and
  statement timeout). Saved filters now hold keyword **conditions**: `contains` (substring, `LIKE`) or
  `equals` (whole word or phrase, an escaped `\m…\M` match), combined **all** (AND) or **any** (OR).
  The search bar's quick search still requires every word or "quoted phrase".
- One `FilterModal` creates (pre-filled from the search bar, one condition per word/phrase) and edits
  filters; each chip's menu is now **Edit…** and **Delete**.
- Saved filters render as compact wrapping chips.
- Specs saved earlier with `text_mode: "keyword"` are still accepted; `text_mode: "regex"` is rejected.

