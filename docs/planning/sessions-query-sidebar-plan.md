# Sessions Query Sidebar Plan

Created: 2026-03-14
Updated: 2026-03-14

References:
- [index.md](/Users/will/Projects/fractal-goals/index.md)
- [Sessions.jsx](/Users/will/Projects/fractal-goals/client/src/pages/Sessions.jsx)
- [SessionNotesSidebar.jsx](/Users/will/Projects/fractal-goals/client/src/components/sessions/SessionNotesSidebar.jsx)
- [useSessionQueries.js](/Users/will/Projects/fractal-goals/client/src/hooks/useSessionQueries.js)
- [queryKeys.js](/Users/will/Projects/fractal-goals/client/src/hooks/queryKeys.js)
- [sessions_api.py](/Users/will/Projects/fractal-goals/blueprints/sessions_api.py)
- [session_service.py](/Users/will/Projects/fractal-goals/services/session_service.py)

## Problem

The current sessions page uses the right panel as a notes timeline and keeps list filtering/sorting in `Sessions.jsx` page-local state. That works for simple completion toggles, but it does not scale to:

- a dedicated filter/query surface
- time-range scoping
- activity-based filtering
- goal filtering through activity associations
- a calendar heatmap that reflects the sessions currently in scope

This also conflicts with the query-first architecture in [index.md](/Users/will/Projects/fractal-goals/index.md):

- `Sessions.jsx` fetches paginated sessions directly with `useInfiniteQuery` instead of going through a dedicated query hook
- filtering and sorting happen after fetch in page-local memo logic
- the current API only supports pagination, so the UI cannot ask the backend for a canonical filtered session set or matching heatmap aggregates

## Goals

1. Replace the notes-focused right sidebar with a collapsible query/filter panel.
2. Move completion filtering and sort controls into that panel.
3. Add a time-range control that scopes both the visible session list and the heatmap.
4. Add activity filters.
5. Add goal filters based on goals associated to a session through its activity definitions.
6. Add a calendar heatmap at the top of the panel that shows session counts for the active query scope.
7. Keep the implementation aligned with the repo standard:
   `page/component -> query hook -> shared query key -> API module`

## Non-Goals

- Rebuilding the session card layout.
- Redesigning session detail or note editing flows.
- Preserving the notes timeline inside the same sidebar in phase 1.
- Adding full-text session search unless it is requested separately.

## Proposed UX

### Panel

Replace `SessionNotesSidebar` with a new `SessionsQuerySidebar` that remains collapsible from the sessions page header.

Panel sections, top to bottom:

1. Calendar heatmap
2. Time range
3. Completion status
4. Sort
5. Activity filter
6. Goal filter
7. Query summary and reset actions

The main header button should change from `Show Notes` / `Hide Notes` to `Show Filters` / `Hide Filters`.

### Calendar Heatmap

The heatmap sits at the top of the sidebar and visualizes daily session counts for the current time range and all active filters except sort order.

Behavior:

- Uses the active timezone.
- Shows one cell per calendar day.
- Groups cells into week rows so the narrow sidebar can support long ranges.
- Renders the newest week first.
- Supports internal vertical scrolling for long ranges, so days nearest the range end are visible first.
- Includes a legend for count intensity and a compact summary such as `43 sessions in range`.
- Hover/focus reveals exact date and count.

Phase 1 recommendation:

- make the heatmap informational only
- do not make day-cell click a required filter interaction yet

### Time Range

The panel should define time range as a filter, not as a sort mode.

Recommended controls:

- Presets: `7D`, `30D`, `90D`, `6M`, `1Y`, `All`
- `Custom` option with explicit start/end dates

Rules:

- Default to `90D`
- The selected range determines both list results and heatmap buckets
- Sorting still applies within the selected range
- Range should be based on session start when present, with fallback to `created_at`

### Completion Filter

Move the existing completion toggle group into the sidebar:

- `All`
- `Incomplete`
- `Completed`

Counts may be shown in labels if the API response includes filtered totals cheaply; otherwise labels can remain plain in phase 1.

### Sort

Move the existing sort controls into the sidebar:

- `Session Date`
- `Last Modified`
- `Ascending/Descending`

The list header should no longer own sort state.

### Activity Filter

Allow multi-select activity filtering using existing activity definitions for the current root.

Matching rule:

- a session matches if it contains at least one activity instance whose `activity_definition_id` is in the selected set

### Goal Filter

Allow multi-select goal filtering based on activity associations, not direct session-goal linkage.

Matching rule:

- a session matches if it contains at least one activity instance whose activity definition is associated with at least one selected goal

UI rules:

- only show goals that are associated with at least one activity in the current root
- goal labels should use the existing goal naming/color system where practical

## Architecture Alignment

### Frontend

Do not extend the current `Sessions.jsx` pattern of fetching raw pages and then locally deriving the canonical result set.

Instead:

1. Keep transient form state inside the sidebar only while the user is editing controls.
2. Normalize the applied filter state into a canonical query object.
3. Drive the sessions list from a dedicated query hook.
4. Drive the heatmap from a dedicated query hook.
5. Keep shared query key generation centralized in [queryKeys.js](/Users/will/Projects/fractal-goals/client/src/hooks/queryKeys.js).

Recommended split:

- `Sessions.jsx`: layout, URL/search-param coordination, selected session state, collapse state
- `client/src/components/sessions/SessionsQuerySidebar.jsx`: filter UI only
- `client/src/components/sessions/SessionCalendarHeatmap.jsx`: heatmap rendering only
- `client/src/hooks/useSessionsPageFilters.js`: normalize defaults, presets, URL mapping
- `client/src/hooks/useSessionQueries.js`: own filtered list and heatmap query hooks

This keeps the page as a coordinator instead of a data-shaping owner.

### Backend

Keep the backend pattern from [index.md](/Users/will/Projects/fractal-goals/index.md):

`request -> blueprint -> validation -> service -> serializer -> response`

Do not push activity/goal filter semantics into ad hoc client joins over partially loaded pagination.

The backend should become the canonical owner of:

- completion filtering
- time-range filtering
- activity filtering
- activity-associated goal filtering
- sort field/order for the list query
- daily count aggregation for the heatmap query

## Proposed API Contract

### 1. Extend session list query

Extend `GET /api/<root_id>/sessions` to accept query params such as:

- `limit`
- `offset`
- `completed=all|completed|incomplete`
- `sort_by=session_start|updated_at`
- `sort_order=asc|desc`
- `range_start=YYYY-MM-DD`
- `range_end=YYYY-MM-DD`
- repeated or comma-separated `activity_ids`
- repeated or comma-separated `goal_ids`

Server semantics:

- `goal_ids` are interpreted through activity-definition associations
- range filtering uses `session_start` when available, then `created_at` as fallback
- list response keeps the current serialized session shape plus pagination

### 2. Add heatmap endpoint

Add a dedicated aggregate endpoint rather than overloading the list payload:

`GET /api/<root_id>/sessions/heatmap`

Accepted filters should match the list query except sort params.

Suggested response shape:

```json
{
  "range_start": "2026-01-01",
  "range_end": "2026-03-14",
  "total_sessions": 43,
  "max_count": 4,
  "days": [
    { "date": "2026-03-14", "count": 2 },
    { "date": "2026-03-13", "count": 0 }
  ]
}
```

This keeps the list query focused on session rows and lets the heatmap fetch remain independently cacheable.

## Proposed Query Keys And Hooks

Add canonical keys in [queryKeys.js](/Users/will/Projects/fractal-goals/client/src/hooks/queryKeys.js):

- `sessionsSearch(rootId, normalizedFilters)`
- `sessionsHeatmap(rootId, normalizedFilters)`

Recommended hooks in [useSessionQueries.js](/Users/will/Projects/fractal-goals/client/src/hooks/useSessionQueries.js):

- `useSessionsSearch(rootId, filters)`
- `useSessionsHeatmap(rootId, filters)`

Normalization requirements:

- sort selected activity IDs and goal IDs before building query keys
- convert presets into explicit `range_start` / `range_end`
- omit empty filters from the API request

This avoids cache fragmentation from equivalent filter objects.

## Data Sources For Filter Options

Use existing canonical queries where possible:

- activities: existing `queryKeys.activities(rootId)` / activities API
- goals: existing goals tree or selection query for the root

Do not add a bespoke endpoint only to populate filter dropdowns unless the existing goals/activity queries become too heavy in practice.

Goal option derivation should happen in a shared helper:

- load activities and goals once
- collect the set of goal IDs referenced by activity `associated_goal_ids`
- map those IDs back to goal objects for display

This keeps filter-option assembly out of the page component.

## UI State Model

Split state into:

- UI-only state: sidebar open/closed, expanded accordion sections, in-progress custom date edits
- Applied query state: completion, sort, range, activity IDs, goal IDs
- Selection state: selected session ID

Recommendation:

- store applied query state in URL search params so refresh/back-forward preserves the user’s session query
- continue storing sidebar collapsed state in local storage per root

The selected session should remain independent from the filter query so the page can clear or preserve it intentionally when filters change.

## Implementation Outline

### Frontend

1. Replace `SessionNotesSidebar` usage in [Sessions.jsx](/Users/will/Projects/fractal-goals/client/src/pages/Sessions.jsx) with a filter-focused sidebar component.
2. Remove page-level filtering/sorting memo logic and move canonical query assembly into hooks.
3. Add search-param synchronization for applied filters.
4. Add a dedicated heatmap component with internal scroll and reverse-chronological week rows.
5. Reuse existing activity and goal data sources for filter options.

### Backend

1. Extend the sessions list endpoint query parsing and service-layer filtering.
2. Add a heatmap aggregate endpoint in [sessions_api.py](/Users/will/Projects/fractal-goals/blueprints/sessions_api.py).
3. Implement filtered list and daily aggregate query helpers in [session_service.py](/Users/will/Projects/fractal-goals/services/session_service.py).
4. Keep serializers unchanged unless the sidebar needs new lightweight fields that are not already present.

## Risks And Decisions

### 1. Client-only filtering is the wrong default

The current page already paginates at 10 rows. Once time range, activity, goal, and heatmap aggregation are added, client-only filtering over whatever pages happen to be loaded becomes incorrect.

Decision:

- make the backend the canonical query owner

### 2. Goal filtering semantics must stay narrow

The request is specifically about goals associated to the session via activity. Mixing this with direct session-goal attachments would produce confusing results.

Decision:

- `goal_ids` filter only through activity associations in phase 1

### 3. Heatmap orientation must fit the sidebar

A standard left-to-right yearly heatmap does not fit the current narrow right panel well.

Decision:

- use week rows in a vertically scrollable, reverse-chronological stack

## Scope Boundary

In scope:

- sidebar redesign
- completion filter relocation
- sort control relocation
- time-range filter
- activity filter
- activity-associated goal filter
- heatmap summary for the active query scope
- query-first API/hook changes needed to make the above correct

Out of scope:

- restoring the notes timeline elsewhere on the sessions page
- free-text search
- day-cell click-to-filter interactions
- changes to session-card contents

## Verification

1. Frontend hook tests for filter normalization, query-key stability, and URL/search-param mapping.
2. Frontend component tests for sidebar control behavior, collapse behavior, and heatmap rendering with reverse-chronological week ordering.
3. Backend service tests for:
   - completion filtering
   - date-range filtering
   - activity filtering
   - goal-through-activity filtering
   - sort field/order behavior
4. Backend endpoint tests for the new heatmap response shape and filtered counts.
5. Manual verification on the sessions page:
   - change range and confirm both list and heatmap update
   - filter by activity and confirm only matching sessions remain
   - filter by goal and confirm matches come only from activity associations
   - toggle sort field/order and confirm stable pagination behavior
   - collapse and reopen the sidebar and confirm per-root persistence still works
