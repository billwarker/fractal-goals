# Implementation Plan: Bugs, Notes Overhaul, Analytics Improvements

## Context

This work spans three product areas:

1. **Bugs**
   - mobile pinch-zoom still active
   - copied activities can reuse stale builder state
2. **Notes**
   - note types need clearer automatic definitions
   - NoteCard headings need stronger hierarchy
   - GoalDetail notes view should match the modal system better
   - pinning should behave consistently by note context
3. **Analytics**
   - charts clip labels
   - activity selection is too flat for large fractals
   - layouts are not persistable
   - cross-filtering needs a top-level control surface

---

## Audit Summary

### Current grade: `B`

The original plan is directionally strong, but a few assumptions were incomplete:

- `note_type` does **not** need a DB column. It should be derived centrally in `serialize_note`.
- Pinning is **not** fully solved backend-side today. Only `get_goal_notes` and `get_all_notes` sort by `pinned_at`; session and activity note endpoints still sort by `created_at` only.
- Pinning is also **not** fully solved frontend-side today. Some surfaces, especially flat timelines in session detail, re-sort notes by `created_at`, which can bury pinned notes.
- Chart clipping is **not** isolated to `ChartJSWrapper`. `WeeklyBarChart` uses its own options object, so it needs padding adjustments too.
- The dashboard/cross-filter work is large enough that it should be executed in phases with a shippable midpoint.

### What makes this plan better than the original

- It distinguishes **validation work** from **required implementation work**.
- It closes the session/activity pinning gap instead of only fixing goal/all-notes surfaces.
- It scopes analytics into a practical delivery sequence: clipping + selector first, persistence next, cross-filtering after persistence exists.

---

## S+ Rank Criteria

To earn an `S+` implementation grade, the work should satisfy all of the following:

1. **No duplicate note-type logic**
   - `note_type` is derived in one backend place and reused everywhere.
2. **Pinning is enforced, not just hidden**
   - `activity_set_note` pinning is blocked in the UI and rejected by the backend if attempted directly.
3. **Pinned ordering is correct on every note surface**
   - Notes page
   - Goal detail notes
   - Session notes
   - Activity history / activity definition note surfaces
4. **Analytics persistence is resilient**
   - local restore works immediately
   - server restore works across reloads/devices
   - invalid or outdated saved payloads fail safely
5. **Cross-filtering is predictable**
   - shared state is obvious in the UI
   - each window can opt in/out cleanly
   - brushing never mutates saved dashboard layouts
6. **Tests cover the high-risk regressions**
   - activity-copy builder reset
   - note serialization/type derivation
   - pin-eligibility rules
   - pinned-first ordering on flat and grouped timelines
   - analytics layout persistence serialization/restore

---

## Phase 1: Bug Fixes

### Bug 1: Disable pinch-zoom on mobile

**Problem:** `client/index.html` still allows zooming and the global stylesheet does not help touch browsers constrain accidental gestures.

**Fix:**
- `client/index.html`
  - update viewport meta to disable user scaling
- `client/src/index.css`
  - add `touch-action: manipulation` to `html, body`

**Verification:**
- mobile devtools or real device pinch gesture does not zoom the app

### Bug 2: Copied activities reuse stale builder state

**Problem:** `ActivityBuilder.jsx` keys the form with `editingActivity?.id || 'create'`. Copied activities have no persisted `id`, so multiple copies can reuse the same React subtree.

**Fix:**
- `client/src/utils/activityBuilder.js`
  - add an ephemeral `_builderKey` when preparing a copy
- `client/src/components/ActivityBuilder.jsx`
  - use `editingActivity?.id || editingActivity?._builderKey || 'create'` as the form key

**Verification:**
- duplicate an activity with metrics/splits
- builder reopens with copied values and does not leak stale form state from earlier copies

---

## Phase 2: Notes Overhaul

### Note Types

`note_type` should stay computed, not stored.

| `note_type` | When assigned | Display label |
| --- | --- | --- |
| `fractal_note` | `context_type = 'root'` | Fractal Note |
| `goal_note` | `context_type = 'goal'` | Goal Note |
| `session_note` | `context_type = 'session'` and `set_index is null` | Session Note |
| `activity_instance_note` | `context_type = 'activity_instance'` and `set_index is null` | Activity Instance Note |
| `activity_set_note` | `context_type = 'activity_instance'` and `set_index is not null` | Activity Set Note |
| `activity_definition_note` | `context_type = 'activity_definition'` | Activity Definition Note |

**Backend:**
- `services/serializers.py`
  - add `derive_note_type(context_type, set_index)`
  - emit `note_type` and `note_type_label` from `serialize_note`

**No migration required.**

### Better NoteCard Headings

**Target format:**

```text
[Note Type Pill]  ·  [Context name / goal icon]                              [timestamp]
```

**Display rules:**
- goal notes: goal icon + goal color + goal name
- session notes: session name
- activity instance notes: activity name
- activity set notes: activity name + `Set N`
- fractal notes: fractal/root label
- timestamp stays right-aligned

**Files:**
- `client/src/components/notes/NoteCard.jsx`
- `client/src/components/notes/NoteCard.module.css`
- `services/serializers.py`

### Context-Aware Pinning

Pinning should target the most relevant surface:

| Note type | Where pinned |
| --- | --- |
| `fractal_note` | top of Notes page |
| `goal_note` | top of GoalDetail notes |
| `session_note` | top of SessionDetail notes |
| `activity_instance_note` | top of activity history viewer |
| `activity_definition_note` | top of activity-definition notes/history viewer |
| `activity_set_note` | cannot be pinned |

**Required backend changes:**
- `services/note_service.py`
  - reject pin requests for `activity_set_note`
  - add pinned-first ordering to:
    - `get_session_notes`
    - `get_activity_instance_notes`
    - `get_activity_definition_notes`

**Required frontend changes:**
- `client/src/components/notes/NoteCard.jsx`
  - hide pin action for `activity_set_note`
- `client/src/components/notes/NoteTimeline.jsx`
  - preserve pinned-first ordering even in grouped mode
- `client/src/components/sessionDetail/NotesPanel.jsx`
  - do not re-sort flat note lists in a way that defeats pinned ordering
- `client/src/components/sessionDetail/NoteTimeline.jsx`
  - ensure flat rendering still places pinned notes first
- `client/src/components/goalDetail/GoalNotesView.jsx`
  - verify goal notes stay pinned-first after compose/edit mutations

### GoalDetail Notes View Polish

Only goal notes appear here, so the UI should feel closer to the dedicated notes experience.

**Changes:**
- restyle the write-note CTA to match Notes page action styling
- tighten spacing and header alignment
- keep the include-descendants toggle visually secondary

**Files:**
- `client/src/components/goalDetail/GoalNotesView.jsx`
- `client/src/components/goalDetail/GoalNotesView.module.css`

---

## Phase 3: Analytics Improvements

### Analytics 3A: Fix Chart Clipping

**Problem:** labels clip at the chart edges due to missing layout padding and some containers being too tight.

**Fixes:**
- `client/src/components/analytics/ChartJSWrapper.jsx`
  - add default `layout.padding`
  - allow extra right padding for dual-axis use cases
- `client/src/components/analytics/LineGraph.jsx`
  - increase right padding when Y2 is active
- `client/src/components/analytics/WeeklyBarChart.jsx`
  - add explicit layout padding because it does not use `useChartOptions`
- `client/src/components/analytics/ProfileWindow.module.css`
  - slightly increase chart container breathing room

### Analytics 3B: Better Activity Selection

The existing plain activity dropdown does not scale for grouped activity trees.

**Implementation target:**
- create `client/src/components/analytics/ActivityGraphSelector.jsx`
- support:
  - grouped activities by activity group
  - single-select for line/scatter views
  - search/filter input
  - graceful fallback for ungrouped activities

**Integration:**
- replace the current flat `<Select>` in `ProfileWindow.jsx`

### Analytics 3C: Named Dashboard Layouts

Persist recursive analytics layouts and per-window state.

**Backend:**
- add `AnalyticsDashboard` model
- add migration for `analytics_dashboards`
- add `services/dashboard_service.py`
- add `blueprints/dashboards_api.py`
- expose CRUD at `/api/roots/<root_id>/dashboards`

**Suggested persisted payload shape:**

```json
{
  "layout": { "...": "recursive layout tree" },
  "window_states": { "...": "state by window id" },
  "selected_window_id": "window-1",
  "version": 1
}
```

**Frontend:**
- add `client/src/hooks/useDashboardQueries.js`
- add API client helpers
- persist to `localStorage` immediately for instant restore
- sync named layouts to backend in the background

### Analytics 3D: Top Bar + Cross-Filtering

Add a shared control bar above the analytics window area.

**Top bar contents:**
1. dashboard selector
2. save / save-as / new controls
3. shared date range filter
4. shared activity filter

**Cross-filter rules:**
- shared state lives in `Analytics.jsx`
- each window gets a `isCrossFilterLinked` flag
- line/bar charts can emit date brush events
- windows that do not support a filter ignore it safely
- cross-filter state is ephemeral and is **not** saved into named dashboards

**Files:**
- new `client/src/components/analytics/AnalyticsTopBar.jsx`
- `client/src/pages/Analytics.jsx`
- `client/src/components/analytics/ProfileWindow.jsx`
- `client/src/components/analytics/LineGraph.jsx`
- `client/src/components/analytics/WeeklyBarChart.jsx`

---

## Recommended Implementation Order

1. bug fixes
2. note-type derivation
3. NoteCard header redesign
4. pin enforcement + pinned-first ordering across all note surfaces
5. GoalDetail notes visual polish
6. analytics clipping fix
7. activity graph selector
8. local analytics layout persistence
9. server-backed named dashboards
10. analytics top bar
11. cross-filtering

This order keeps each phase shippable and avoids tying core note fixes to the much larger analytics persistence work.

---

## Verification Checklist

- **Pinch zoom**
  - mobile pinch gesture should not zoom the app
- **Activity copy**
  - duplicate activity with metrics/splits and confirm copied builder state is fresh
- **Note serialization**
  - each context emits the correct `note_type`
- **NoteCard headings**
  - goal notes show icon/color/name
  - session notes show session name
  - set notes show `Set N`
- **Pinning eligibility**
  - set notes have no pin UI
  - backend rejects direct pin attempts on set notes
- **Pinned ordering**
  - goal notes stay pinned-first
  - session notes stay pinned-first
  - activity notes stay pinned-first
  - Notes page stays pinned-first
- **GoalDetail polish**
  - write-note CTA matches the rest of the note UI
- **Chart clipping**
  - dual-axis line graph labels do not clip
  - weekly chart axis labels do not clip
- **Activity selector**
  - grouped list renders correctly
  - search narrows results
- **Dashboards**
  - local restore works after reload
  - server-saved dashboard reloads correctly
  - invalid payloads fail gracefully
- **Cross-filtering**
  - shared date filter updates linked windows only
  - shared activity filter updates linked windows only
  - opt-out windows remain stable
