# Implementation Plan: UX Polish Pass

## Context

The original bugs/notes/analytics plan was largely implemented (8/10 items done). This is the polish pass to address remaining UX rough edges identified in audit. Three focus areas:
1. **GoalNotesView + minor fixes** — match write-note CTA to Notes page style, add dashboard delete confirmation
2. **ActivityGraphSelector UX** — add search, show group context, improve affordances
3. **AnalyticsTopBar polish** — add date presets, active filter indicators

---

## Previous Plan Status: B+ (8/10 complete, 2 partial)

Cross-filtering (activity sync + date brush) deferred to a future pass.

---

# Remaining Work

---

## 1. GoalNotesView — Match Notes Page CTA Style

**Problem:** The "Write Note" button in GoalNotesView uses `<Button variant="primary" size="sm">` which renders differently from the Notes page CTA, which uses the PageHeader's `.primaryActionButton` class (`background: var(--color-brand-primary)`, `font-weight: 600`, white text).

**Fix:** Replace the `<Button>` with a styled button matching the PageHeader `.primaryActionButton` pattern, or import and reuse that class. The GoalNotesView already has a `.writeBtn` class — update it to match the visual weight of the Notes page CTA.

**Files:**
- `client/src/components/goalDetail/GoalNotesView.jsx`
- `client/src/components/goalDetail/GoalNotesView.module.css` — update `.writeBtn` to explicitly use brand-primary background, white text, font-weight 600, matching the `PageHeader.module.css` `.primaryActionButton` styles

---

## 2. Analytics View Delete Confirmation

**Problem:** `handleDeleteView` in Analytics.jsx calls `deleteAnalyticsView(viewId)` immediately with no confirmation. A misclick permanently deletes a saved analytics view.

**Fix:** Add a confirmation step before deletion. Use `DeleteConfirmModal` (already used in ManageActivities, etc.), styled consistently with other delete buttons in the app.

**Files:**
- `client/src/pages/Analytics.jsx` — add `viewToDelete` state, render `DeleteConfirmModal`, gate `handleDeleteView` behind confirmation
- Import `DeleteConfirmModal` from `../components/modals/DeleteConfirmModal`

---

## 3. ActivityGraphSelector — Add Search

**Problem:** `ActivityFilterModal` has no search/filter input. Users with many activities must click through group hierarchy to find what they need. The Notes page `ActivityFilterModal` is the same component — this is a systemic gap.

**Fix:** Add a search input at the top of `ActivityFilterModal` that filters the displayed activities/groups by name match.

**Implementation:**
- `client/src/components/common/ActivityFilterModal.jsx`:
  - Add `searchText` state
  - Add `<input>` at top of modal body, styled like the date inputs in AnalyticsTopBar (border, border-radius, bg-input)
  - Filter `visibleActivities` and `visibleGroups` by `name.toLowerCase().includes(searchText.toLowerCase())`
  - When search is active, flatten the group hierarchy and show all matching activities regardless of current `browseGroupId`
  - Clear search on close

**Files:**
- `client/src/components/common/ActivityFilterModal.jsx`
- `client/src/components/common/ActivityFilterModal.module.css` — add `.searchInput` styles

This benefits both the analytics selector AND the Notes page activity filter.

---

## 4. ActivityGraphSelector — Show Group Context in Trigger

**Problem:** The trigger button shows only `"Activity Name"` or `"N activities selected"` — no indication of which group the activity belongs to.

**Fix:** When a single activity is selected and it belongs to a group, show `"Group > Activity"` format in the trigger label.

**Files:**
- `client/src/components/analytics/ActivityGraphSelector.jsx` — update `triggerLabel` memo to include group name when available from `activityGroups` prop

---

## 5. AnalyticsTopBar — Date Presets

**Problem:** Only manual date inputs (From/To). Users need quick shortcuts for common ranges.

**Fix:** Add date preset buttons below the date fields: **7d**, **30d**, **90d**, **1y**, **All**.

**Implementation:**
- Each preset calculates `{ start: today - N days (ISO string), end: today (ISO string) }` and calls `onDateRangeChange`
- "All" calls `onDateRangeChange({ start: null, end: null })`
- Active preset gets a visual highlight (check if current dateRange matches a preset)
- Replaces the "Clear Dates" ghost button (the "All" preset serves the same purpose)

**Files:**
- `client/src/components/analytics/AnalyticsTopBar.jsx` — add preset buttons
- `client/src/components/analytics/AnalyticsTopBar.module.css` — add `.presetRow`, `.presetBtn`, `.presetBtnActive` styles

---

## 6. AnalyticsTopBar — Active Filter Indicator

**Problem:** No visual feedback showing that filters are active. User can set a date range and forget about it, wondering why charts look different.

**Fix:** When a date range is active, show a small badge/pill next to "Date Range" label showing the active range summary (e.g. "Apr 1 – Apr 6") and make the "Clear" action more prominent.

**Files:**
- `client/src/components/analytics/AnalyticsTopBar.jsx`
- `client/src/components/analytics/AnalyticsTopBar.module.css`

---

## Implementation Order

1. GoalNotesView CTA fix (smallest, isolated CSS change)
2. Dashboard delete confirmation (small, isolated)
3. ActivityFilterModal search (moderate, benefits multiple surfaces)
4. ActivityGraphSelector group context in trigger (small)
5. AnalyticsTopBar date presets (moderate)
6. AnalyticsTopBar active filter indicator (small)

---

## Verification

- **GoalNotesView**: Open goal detail → Notes tab. "Write Note" button should match the Notes page CTA visually (brand-primary bg, white text, 600 weight)
- **View delete**: Click delete on a saved analytics view → confirmation modal appears. Cancel → nothing happens. Confirm → view deleted with success toast
- **Activity search**: Open ActivityFilterModal (from analytics or notes page) → type partial activity name → list filters to matches, crossing group boundaries
- **Group context trigger**: Select an activity that belongs to a group in analytics → trigger shows "Group > Activity" format
- **Date presets**: Click "7d" → date range set to last 7 days, "7d" button highlighted. Click "All" → dates cleared
- **Filter indicator**: Set a date range → badge appears showing active range. Clear dates → badge disappears

---

# Original Plan Items (Completed)

Below is the original plan for reference. All items marked ✅ are complete, ⚠️ are partial.

---

## ✅ Bug 1: Disable Pinch-Zoom on Mobile

**Problem:** `client/index.html` viewport meta lacks zoom restrictions.

**Fix:**
- `client/index.html`: `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />`
- `client/src/index.css`: Add `touch-action: manipulation` to `html, body`

---

## ✅ Bug 2: Metrics Not Added to Copied Activities

**Problem:** `ActivityBuilder.jsx` uses `key={editingActivity?.id || 'create'}`. Copies have no `id`, so all copies share key `'create'` and React reuses the stale form instance without re-initializing state.

**Fix:**
- `client/src/utils/activityBuilder.js`: Add `_key: Date.now()` to the copy object in `prepareActivityDefinitionCopy`
- `client/src/components/ActivityBuilder.jsx`: Change key to `key={editingActivity?.id || editingActivity?._key || 'create'}`

---

## ✅ Notes Overhaul

### ✅ Note Types (auto-assigned, computed — no DB column)

Since `note_type` is a pure function of `context_type` + `set_index`, compute it in the serializer rather than adding a DB column. No migration needed, no sync risk.

| `note_type` | When assigned | Display label |
|---|---|---|
| `fractal_note` | context_type = 'root' | Fractal Note |
| `goal_note` | context_type = 'goal' | Goal Note |
| `session_note` | context_type = 'session', no set_index | Session Note |
| `activity_instance_note` | context_type = 'activity_instance', no set_index | Activity Instance Note |
| `activity_set_note` | context_type = 'activity_instance', set_index != null | Activity Set Note |
| `activity_definition_note` | context_type = 'activity_definition' | Activity Definition Note |

**Backend:**
- `services/serializers.py`: Add `note_type` as a computed field in `serialize_note` (base serializer), so it's available on every endpoint — not just display endpoints
- Helper function `derive_note_type(context_type, set_index)` in serializers or a small utility

**No migration required.**

### ✅ Better NoteCard Headings

**Improved heading format:**
```
[Note Type Pill]  ·  [Context name + goal icon w/ colour if applicable]     [timestamp]
```

- **Goal notes** (`showContext=true`): Goal level icon with proper colour + goal name
- **Activity instance notes**: Activity name
- **Session notes**: Session name
- **Activity set notes**: Activity name + "Set N"
- Timestamp right-aligned

**Serialization dependency:** Context names (`goal_name`, `goal_type`, `activity_definition_name`, `session_name`) are only available via `serialize_note_display`, not the base `serialize_note`. Must audit all note-fetching endpoints and ensure they use `serialize_note_display` for any path that renders NoteCards. Key endpoints to check:
- `blueprints/notes_api.py` — main notes endpoints
- `services/note_service.py` — any direct serialization calls
- `services/view_serializers.py` — view-level serializers

**Files:**
- `client/src/components/notes/NoteCard.jsx`
- `client/src/components/notes/NoteCard.module.css`
- `services/serializers.py`

### ✅ Context-Aware Pinning

Pinning pins the note to the top of its most relevant surface:

| Note type | Where pinned |
|---|---|
| `fractal_note` | Top of the Notes page timeline |
| `goal_note` | Top of the GoalDetailModal notes view for that goal |
| `session_note` | Top of the session notes panel in SessionDetail |
| `activity_instance_note` | Top of the activity history viewer in SessionDetail |
| `activity_definition_note` | Top of the activity history viewer in SessionDetail |
| `activity_set_note` | Cannot be pinned |

**Backend already sorts pinned first** — `pinned_at.desc().nullslast()` is already in `get_goal_notes` and `get_all_notes` queries. No backend changes needed for sort order.

**Frontend work:**
- `client/src/components/notes/NoteCard.jsx`: Hide pin action for `activity_set_note` type
- Verify each surface doesn't re-sort notes in a way that breaks the backend's pinned-first ordering
- `client/src/components/notes/NoteTimeline.jsx`: Verify pinned ordering is preserved
- `client/src/components/goalDetail/GoalNotesView.jsx`: Verify pinned goal notes stay at top
- `client/src/components/sessionDetail/NotesPanel.jsx`: Verify pinned session/activity notes stay at top

### ⚠️ GoalDetailModal Notes View (visual consistency) — addressed in polish pass above

Only goal notes appear here. Improve visual consistency with the modal:
- Replace the "write note" button style to match the Notes page CTA style
- Improve spacing/layout to align with the modal's existing design language

**Files:**
- `client/src/components/goalDetail/GoalNotesView.jsx`

---

## ✅ Analytics Improvements

### ✅ Fix Graph Visual Clipping

**Root cause:** Missing `layout.padding` in Chart.js options — not just CSS. Dual Y-axis charts have right-side label overflow, and bottom axis labels can get clipped.

**Fix (both needed):**
- `client/src/components/analytics/ChartJSWrapper.jsx`: Add `layout: { padding: { bottom: 16, right: 16 } }` to `useChartOptions` base options. Increase right padding when dual axes are active.
- `client/src/components/analytics/ProfileWindow.module.css`: Increase bottom padding in `.vizContainer` from 20px to 32px

**Files:**
- `client/src/components/analytics/ChartJSWrapper.jsx` (primary fix)
- `client/src/components/analytics/ProfileWindow.module.css` (secondary)
- `client/src/components/analytics/LineGraph.jsx` (verify dual-axis padding)

### ⚠️ Better Activity Selection for Graphs — addressed in polish pass above

**The existing `ActivitySearchWidget` is NOT compatible** — it's multi-select only with a modal/checkbox UI. Analytics needs a single-select dropdown for most charts.

**Approach:** Create a new `ActivityGraphSelector.jsx` component that:
- Shows activities grouped by activity group (section headers)
- Supports single-select (dropdown) for charts like LineGraph
- Supports multi-select (checkbox dropdown) for charts that can overlay activities
- Includes a search/filter input for fractals with many activities
- Reuses the activity group data already loaded in `ProfileWindow`

**Files:**
- New: `client/src/components/analytics/ActivityGraphSelector.jsx`
- `client/src/components/analytics/ProfileWindow.jsx` — replace the flat `<Select>` with the new selector

### ✅ Named Dashboard Layouts

Save/restore named multi-window layouts. Both `windowStates` (flat object) and `layout` (recursive tree) are JSON-serializable.

**Backend:**
- New model: `AnalyticsDashboard` — fields: `id`, `root_id`, `user_id`, `name`, `layout` (JSON blob containing both layout tree + windowStates), `created_at`, `updated_at`
- `migrations/`: Add `analytic_dashboards` table
- `services/dashboard_service.py`: CRUD with ownership checks
- `blueprints/dashboards_api.py`: GET/POST/PUT/DELETE `/fractals/<root_id>/dashboards`

**Frontend:**
- `client/src/hooks/useDashboardQueries.js`: TanStack Query hooks
- Dashboard selector in the new `AnalyticsTopBar` (see below)
- Also persist to `localStorage` as a fallback for instant load and offline capability

### ⚠️ New Analytics Top Bar + Cross-Filtering — partially done, polish pass above

Add a top-level control bar above the analytics panels:

**Bar contents:**
1. **Dashboard selector** — dropdown of saved named layouts + "Save current" + "New" buttons
2. **Cross-filter controls** — add shared filters (date range, activity) that apply across cross-filter-enabled panels

**Cross-filter implementation:**

1. **Date range filter**: User sets a date range in the top bar OR brushes a range on a Line/Bar chart. The range propagates to all cross-filter-enabled windows.
   - Use custom mousedown/mousemove/mouseup handlers on chart canvas (avoids adding `chartjs-plugin-zoom` dependency)
   - Only applicable to time-series charts (LineGraph, WeeklyBarChart). Heatmaps and scatter plots ignore date brush events.

2. **Activity sync**: User selects an activity in the top bar cross-filter controls. All cross-filter-enabled windows adopt that activity.
   - Per-window override: a window can opt out of activity sync independently

**Cross-filter state:**
- `crossFilterState` in `Analytics.jsx`: `{ dateRange: { start, end } | null, activity: activityObj | null }`
- Per-window sync toggle: "link" icon on each `ProfileWindow` to opt in/out
- Cross-filter state is **ephemeral** — not saved with dashboard layouts (always starts fresh on load)

**Files:**
- `client/src/pages/Analytics.jsx` — top bar, shared `crossFilterState`
- New: `client/src/components/analytics/AnalyticsTopBar.jsx`
- `client/src/components/analytics/ProfileWindow.jsx` — sync toggle, consume cross-filter
- `client/src/components/analytics/LineGraph.jsx` — emit brush events, apply date filter
- `client/src/components/analytics/WeeklyBarChart.jsx` — apply date filter

(Original implementation order and verification superseded by new plan at top of this file.)
