# Unified Goal Timeline

Goal Details displays a Timeline section beneath targets, combining the lifetime calendar and
paginated event cards, including goals whose activity tracking is disabled. The standalone Timeline
tab is removed. Every local date from creation through completion (or today for an active
or reopened goal) is represented. Descendant evidence is enabled by default.

## Evidence and intensity

The canonical timeline projection supplies completed activities, activity/group association changes,
target creation/achievement, and goal creation/completion/reopening/pause/resume events. Notes are
not independently part of that timeline. Shared activity instances count once, including when
several descendants associate the same definition. Existing parent-inherited activity rules apply.
Deleted entities and root/owner scope follow the canonical history loaders.

The calendar always uses fixed bands: 0, 1, 2–3, 4–6, 7+ completed activities per day.
There are no intensity-mode toggles. Untimed completed work counts normally. No duration or
achievement score is inferred. The compact heat legend and dot/diamond/outline keys share one line below
the chart. Work days and completed activities sit beneath the legend by default. Recorded minutes are omitted from both lifetime and daily summaries. Hover or keyboard focus temporarily shows exact daily details; a selected day remains displayed when the pointer/focus leaves the chart. Hover/focus takes precedence over selection, then falls back to it or lifetime totals. The date-range/timezone line is omitted without changing local-day aggregation. Include
children remains in the Timeline header. Native cell tooltips and accessible labels retain exact daily details; the standing
hover/focus instruction and preview row are omitted for goal calendars.
A dot marks other evidence on an otherwise unheated day; a diamond marks target/goal achievement.
Intensity bands and the legend use the goal's original level colour, including completed goals.
Zero-work cells remain neutral; active bands mix increasing amounts of that colour with the theme's
card background, ending at the exact level colour.
The current goal's paused dates have an inset outline; child pauses do not mark the parent paused.
Resumption dates are considered active. Calendar and list share event timestamps, attributing an
activity to its completion day rather than distributing its duration across midnight.

## Ownership and interaction

- `GoalTimelineService._project_timeline` is the shared private evidence projection. The legacy
  bounded endpoint retains its 200-entry maximum; the unified section can page through all history.
- `GET /api/<root>/goals/<goal>/activity-heatmap` accepts `timezone` (IANA name) and
  `include_children`. It returns every date and exact daily counts/durations, plus summary totals.
  `view=entries` adds `metric=activities|events|duration`, `limit` (default 20, maximum 100 per page),
  and an opaque `cursor`. There is no total-history cap. Adding `date=YYYY-MM-DD` scopes the same
  paginated list to that local day. The date-only compatibility response remains untruncated.
  Cursors include timestamp and ID so equal timestamps and new events cannot shift existing pages.
- Summary reads skip rich activity/set/metric serialization. Page reads load rich activity/target
  data only for selected IDs; day boundaries account for timezone offsets and DST.
- `CalendarHeatmap` is the shared calendar renderer, replacing the session-specific grid.
  Goal calendars run continuously across all years, with month/year labels along one horizontal axis.
  Nearby year labels combine to avoid collisions. The calendar initially shows its latest dates,
  scrolls back through its entire lifetime, and retains readable cells. Goal touch calendars use
  20px visual cells with non-overlapping 24px hit areas across their 4px gaps; session calendars
  retain their existing 24px visual touch cells.
  There is no day/event maximum. Session summaries keep their existing count/time logic.
  The modal/panel keeps fixed horizontal margins: its content scrolls vertically, while only the
  calendar scrolls horizontally. Calendar overscroll is contained so it cannot pan an ancestor.
  Header, tabs, detail content, heatmap and footer share 24px horizontal insets, reduced to 16px
  in narrow panels/mobile. The redundant nested goal-view scroll container was removed.
- The calendar has one keyboard tab stop. Arrow keys navigate by day/week across year boundaries; Home/End reach the first/
  last date; Enter selects a day. Hover/focus shows exact counts. Day inspection focuses its
  heading; closing it restores the selected cell focus.
- The list retains all canonical timeline events, including the evidence behind dots and milestones,
  while heat remains activity-based. Include children filters both projections. A selected day scopes
  the same list; Close day returns to the lifetime list. The removed recorded-minute link and its
  unreachable frontend time-graph loader/query are retired; backend duration APIs remain compatible.
- Details uses its existing single vertical scroll container. The goal header and tabs remain sticky; description and
  targets scroll away. The complete Timeline calendar block (heading, child scope, chart, legend and
  summary) sticks directly beneath the measured header while events scroll underneath. Its opaque
  background inherits the modal/panel content background, so it does not create a differently shaded
  block in standalone modals and still masks scrolled event cards. Its measured
  height also supplies scroll margins so day headings and event controls remain reachable. The original header owns the only close control. Mobile footer actions stay in one horizontally
  pannable row, with 44px-high buttons and contained overscroll; the fixed footer never wraps. The
  modal height subtracts navigation overlap from the visual viewport, preventing the bottom actions
  from extending below the screen and preserving viewport tracking when the keyboard opens. Scrolling back reveals the overview. No Expand/Restore
  control, separate collapse state, nested event scroller or scroll-triggered focus jump remains.
  Header resize and mobile inset changes update the Timeline offset; other tabs and edit flows retain
  their existing sticky header. Event wheel/touch/keyboard
  interaction still records timeline onboarding exploration. Loaded pages and selected dates survive scrolling.
- Event cards and session links retain the canonical timeline renderer. Loading/error/retry
  and zero-work states preserve the rest of Goal Details. Changing goal/timezone/child scope clears
  day selection. A local-date clock extends open calendars across midnight without polling
  unchanged history. Lifetime summaries and day queries share the timeline invalidation root;
  goal/target/association, session, timer and circuit mutations refresh affected projections.
- Read-only landing snapshots use the same filtered cards and local pagination without authenticated
  reads. They omit the calendar and identify their evidence as an incomplete published snapshot.

## Verification and production audit

Backend regression coverage includes uncapped evidence, descendant scope, deduplication, ownership,
completion/reopening, pauses, local-day/DST boundaries, invalid options, rich data loading, cursor
exhaustion over 200 entries, equal timestamps, and newly inserted events between pages. Precise
serialized timestamps preserve sub-second lifetime boundaries and calendar/list count agreement.

Frontend coverage includes fixed activity bands, original level colours, compact legends, scope/day filters,
pagination and retry without discarding loaded cards, cache invalidation, local midnight, snapshots,
keyboard navigation and focus restoration. Production browser checks exercise desktop/mobile themes,
fixed insets, calendar-only panning, load more, sticky timeline scrolling and scroll-back without losing pages.
The removed Timeline tab, old standalone view/filter CSS, old frontend timeline hook/API adapter and
separate day-evidence component are retired. The public bounded history endpoint remains compatible
for existing callers and landing snapshot projection.

Verification passed: production build, frontend lint/types, 1,533 full-suite frontend tests before
the final UI refinements, 36 focused calendar/feed/modal/header tests for sticky scrolling, followed by 27 focused tests
after the full-calendar sticky refinement, then 46 focused regressions for the mobile footer/grid
refinement, and
41 goal history/heatmap backend regressions plus 26 landing/query-budget regressions. All four desktop/mobile goal-timeline and production smoke browser checks pass after the final
mobile footer/grid refinement. Browser coverage validates footer panning and complete visibility,
20px cells and taps within their expanded 24px hit areas, fixed margins, pagination and sticky scrolling.
Browser assertions also verify the sticky calendar matches its containing modal/panel background
in both dark and light themes. The responsive audit now enforces the requested one-row scrollable mobile action layout instead of
the retired two-row layout.

The feature audit found no remaining implementation blocker. Repository-wide S+ release quality
still requires the pre-existing 20 backend type errors and frontend maintainability diagnostics
to be cleared. A broader browser audit also found failures in AI handoff and program-day selection;
those workflows are outside this change and are not claimed as passing. No budgets or baselines
are weakened for this feature. No deployment is part of this work.

Suggested commit: `feat: unify goal timeline calendar and paginated event exploration`
