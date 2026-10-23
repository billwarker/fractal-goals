# UI behaviour contracts — reference

> Detailed, user-visible behaviour contracts moved out of `index.md` on 2026-10-12 so the
> index stays an architectural map. Update the matching section here when the UI contract
> changes; keep `index.md` to ownership, invariants, and links.

## Mobile page footer and sidebars

Programs, Sessions, Notes, and Analytics share `components/layout/MobilePageFooter.jsx`: a fixed,
full-width secondary HeaderButton, portalled outside page animations with safe-area spacing.
`--mobile-page-footer-height` is the shared content-clearance token. Programs opens its sidebar;
Sessions and Notes open filters; Analytics opens its sidebar in Dashboard mode. Notes switches the footer to Show Associator while composing.
Mobile openers leave the header; desktop retains header controls. Sheets sit above the footer.
Mobile sidebars across Programs, Sessions, Notes, Analytics, Session Detail, and Create Session's
goals panel use `--mobile-sidebar-height`: 82% of the dynamic viewport, capped at 760px and the
space below navigation. Sheets use border-box sizing so borders and safe-area padding stay
inside that height, and share the slide-up/backdrop entrance with reduced-motion support.

## Goal Details and Timeline

Goal Details has one Timeline section beneath the Completion summary, combining a lifetime calendar with
cursor-paginated event cards. There is no separate Timeline tab. Cell intensity always uses
completed-activity counts. A compact intensity/marker legend sits on one line below the calendar,
followed by a summary showing hovered/focused or selected day details, otherwise lifetime work
totals. The date-range/timezone line is omitted; aggregation still uses the selected timezone.
Include children remains in the Timeline header. The event list retains all canonical evidence, and child scope applies to both views. Selecting a date filters the same list;
Details keeps the goal header and Details/Activities/Notes tabs fixed. Goal names stay on one line;
overflowing names pan between both ends with reading pauses and pause on hover/focus. Reduced-motion
users can scroll the title manually. The goal-level icon and
close control stay fixed outside the title viewport; the metadata row omits the redundant goal-level
badge before the SMART indicator. The SMART wrapper uses flex alignment so the chip shares the
vertical center of the status and date metadata without inline baseline spacing. SMART and status
chips share 76px width and 12px text; their height matches the metadata text line using the base
line-height token. Description and the Completion summary
scroll away naturally, then the complete Timeline calendar block (heading, child scope, heatmap,
legend and summary) sticks directly below the measured goal header while events continue beneath.
The sticky block uses the containing detail surface background, matching both modal and panel themes.
Its opaque background overlaps the header by 1px; the header offset retains fractional precision
to prevent underlying content showing through a seam at the sticky boundary.
Scrolling back reveals the overview without changing selection or loaded pages. The original header owns the sole close control. There are no Expand/Restore
buttons or separate collapse state. The footer remains available; summaries omit recorded minutes.
The goal modal subtracts the navigation overlap from its visual-viewport height to keep its footer
inside the screen, including when the keyboard changes the visible viewport. Footer actions use one
row of equal-width buttons filling the available horizontal space, with 44px minimum height.
The longest visible label sets the minimum width shared by all buttons.
The row pans horizontally when it overflows on either modal or panel surfaces. Goal calendar
cells use 20px visuals on touch devices, with 24px hit areas covering the gaps; session calendars
retain their existing sizing.

Goal detail content retains 24px horizontal insets (16px in narrow panels), with horizontal panning
contained within the calendar and vertical scrolling owned by the modal/panel body. Published landing
snapshots use the same list and local pagination without authenticated fetches or a lifetime heatmap.
See [Goal Timeline](goal-activity-heatmap.md).

## Goal completion conditions

The edit form's "How does this goal complete?" field is a three-way tab set (Activity threshold,
All child goals, Manually). "All child goals" is hidden for levels that cannot have children unless
the goal already uses it. Choosing Activity threshold seeds a draft on the first activity linked
to the goal, then the first in the fractal. Threshold kind tabs (Single session, Cumulative,
Consistency) keep the measure and rules that still apply. Total yield is disabled unless the
activity has two or more multiplied metrics. New rules default to "at most" for lower-is-better
metrics. A live sentence preview uses the same wording as every read surface. Field errors match
server validation and render as alerts beside their inputs. Start date and Deadline share one row,
and activity outside that window doesn't count.

The details view's Completion section shows the sentence, a progress bar (sets, sessions, totals or
child goals) and the completion source once complete. When the condition is
met on an open, unpaused goal it shows "Your logged activity already meets this. Mark complete".
Mark Complete is always in the footer; completing an unmet condition says it is a manual override.
Read-only landing views use the published snapshot, without fetching. There is no separate
evidence view: a threshold's sessions are charted by the goal's "Progress toward…" chart (goal
details) and by the Session Detail Progress pane's Goal progress chart, and Session Detail lists no
threshold cards (removed 2026-10 with the Progress pane charts).

## Creating goals from hierarchies

The Program calendar Goals pane, the Days tab Goals pane and Session Detail share one interaction
on desktop and mobile: selecting a goal's icon scopes it, and the scoped goal shows a visible "+"
right after its name. There is no hover affordance. "+" is never offered on completed or paused
goals, on the lowest level, or in read-only views (past plans, landing demos). It opens the full
goal modal in create mode, with a level picker covering every lower level when there is more than
one. Children only: siblings are added from their parent. The Program pane explains the
interaction until a goal is scoped. Its icon scope is local to the pane, while Days and Session
Detail reuse their activity-picker scope.

After creation the new goal is inserted into the cached goal trees (`utils/goalTreeCache.js`)
before the shared refetch, so every hierarchy and the goal flow tree show it at once. The new row
flashes once and scrolls into view (an outline under reduced motion), and the scope is kept.
With a session or plan activity selected, the goal is linked to that activity and starts as an
activity threshold on it, seeded from the selected instance in a session. Without one, a
session-created goal joins the session's goals, and a Days-pane goal stays in that pane for the
visit, since both views otherwise show only goals their scope or activities reach. A child of a
program goal is in the program's focus automatically, because focus includes live descendants.
The Program calendar Goals pane hides completed goals by default (a "Show completed" toggle),
keeping a completed goal while it still leads to open work.

## Goal due dates on the Program calendar

Goal due dates read as inline text, "Due: 2.4mo" (`GoalDueText`, `utils/goalDueFormat.js`, the
user's timezone): "Today", then days ("5d"), months ("2.4mo") and years ("8.2y"), negative once
overdue ("-3d"). The text is green, amber within 7 days and red when overdue. The full date is in
the tooltip and assistive text. Goals without a due date, and completed goals, show none.

The Program calendar page's Goals pane shows it in a right-aligned column right of the tree,
level with each goal's first line (`GoalHierarchyList` `getGoalRightSlot`). Open goals without a due date
read "No deadline" there, muted and italic. The goal flow tree
shows it in each goal's metadata line after its age. The Days pane and Session Detail show none.

Calendar cells show non-draggable "Due: [icon] [name]" badges ("Done:" on a completed goal's
completion date). "Due:"/"Done:" is the same size as the goal name, and "Due:" takes the Goals
pane's colours (green, amber within 7 days, red overdue). They open the goal, and busy cells collapse into FullCalendar's "+N more"
popover. On desktop with a fine pointer, open goals in the Goals pane can be dragged onto a day
to set their due date (FullCalendar `Draggable` and external `drop`). The drop saves at once and
shows a toast with Undo. The toast lists soft-rule warnings: outside the program, outside the
level's horizon (from the goal's start date), after the parent's due date, or child goals due
later. Mobile has no drag; due dates are edited in the goal modal, whose deadline field shows
the same warnings instead of blocking dates after the parent's.

## Goal sequences

Goal Details → Options → Sequence orders a goal with its siblings: goals that share its parent and
its level. Goals under different parents never share a sequence, even at the same level. Steps and
siblings are cards with the goal's level icon and name. A draft list takes ↑/↓, remove and a sibling
card's "+ Add". Steps reorder by drag (a mouse drags from anywhere on the card except its buttons;
touch drags from the ⠿ grip) or by ↑/↓. The flow tree previews the draft as it changes (step badges and arrows), and nothing
is saved until the footer's Create sequence (or Save sequence) beside Cancel. Break entire sequence
(the DeleteButton atom) sits at the bottom of the content for an existing sequence. Completed siblings are listed
faded and can't be added; completed steps read faded too. While the view is open, the Goals page
flow tree shows the goal's ancestors, the goal and its same-level siblings, with no children. When
the Goals page is scoped to a program, siblings outside it stay sequenceable but carry an
"Outside program" badge, and a note counts them, because the scoped tree doesn't show them. A goal
outside a sequence can also join a sibling's sequence as its last step. The first incomplete step
is active, and later steps wait, paused with reason `sequence`. Pause/Resume stays the only manual
activation control: resuming a later step starts it out of order, and pausing the active step
leaves the others alone.

Completing a step shows "Begin next goal in sequence: X" (checked). Un-completing it shows "Pause
next goal in sequence: X again" (checked) when its completion began X. Condition and child-goal
completions apply the defaults. When logging evidence in Session Detail completes a step through its
condition and the sequence begins the next, a toast says so with Undo, which re-pauses that step as
waiting (`POST /goals/<id>/sequence-hold`). The completed goal stays complete. Options → Delete confirms in the modal on every page, typing
"delete" when descendants go too, and shows "Begin next goal in sequence: X" for the active step.
Move, Convert Level, and a parent change through a goal update take a goal out of its sequence. A goal the sequence held resumes, the rest
renumber, and a sequence left with one goal ends. Copies never join.

Hierarchy lists put the step number before the name and keep a sequence's steps together in
order. Paused goals read muted with "Paused · waiting on X" (or "Paused"). The goal flow tree shows
each step's number in a small badge left of its icon. The tree layout draws one straight dashed
arrow per consecutive pair, from one step's badge to the next, with the arrowhead touching the next
badge's edge. The arrow sits in the edge layer beneath goal names and metadata, is never used for
layout, and the initial view fits the badges.

## Goal reviews (SMART's R)

SMART's R is **Reviewed**. Relevance statements are retired: migration `c6d7e8f9a0b1` turned each
one into a goal note ("Why this matters (was this goal's relevance statement)"). Reviewed levels
(Ultimate, Long and Mid Term by default; "Review goals at this level" in Goal Characteristics
settings) review their goals on a cadence. R is met while reviews are on, a cadence applies (the
goal's or the level's) and no review is due. A due review takes R away until a review is written, so a goal stays SMART only by reviewing it periodically. Levels that don't review goals,
and completed goals, count R as met.

Goal Details shows the schedule directly under the description, with no heading of its own: "Review every 3
months · next Jan 12", "· deferred to …", "· review due", "Reviews off" or "No review cadence". In
edit mode, "Review (SMART)" holds a "Review this goal" checkbox (saved as `review_disabled`); when
checked, "every [n] [unit]" follows on the same line, with "Use level default".

When a review is due, a "Review due" banner at the top of the goal's details offers one action,
**Review**: a `goal_review` note starting from the goal's description, progress since the last review,
child goals complete and the due status. Saving it restarts the cadence (and clears any deferral set
through the API). Reviews are turned off in edit mode; when they're off, the top of the details offers
"Turn on". The Notes page filters Goal Reviews and Goal Completions, and cards badge both kinds. The
Program calendar shows "Review: [icon] [name]" badges on the next review of goals in the displayed
program's lineage (its goals and their ancestors).

Creating a goal starts its due date at the chosen level's default horizon. It follows the level while
untouched and never replaces a date the user typed or cleared.

## Goals from analytics

Right-click (desktop) or long-press for 500 ms (touch) a point on Metric Trends, Metric Progress,
Metric Scatter Plot or Activity Totals for "Set goal here…", with the condition it suggests:

- Metric Trends: the nearest metric's value as a one-session rule.
- Scatter: both axes' values as two rules met in one session.
- Metric Progress: "this much better than the latest session" (the latest value moved by the
  clicked percentage in the metric's better direction).
- Activity Totals: "N sessions" (a consistency goal). Time totals say they can't become a
  condition yet.

Operators follow each metric's `higher_is_better`. The goal modal opens in create mode with that
condition, under the analytics goal filter's goal (or the fractal root). Metric Trends and Scatter
draw existing goals on the selected activity as dashed reference lines (amber open, green done),
from `GET /goals/conditions?activity_id=` (50 at most, open goals first).

## Goal charts

Goal details' Details tab has an **Analytics** section above Completion, showing the goal's charts
one at a time (`GoalChartsCarousel`). Its header holds "Analytics", ‹ n of m ›, **+ Add chart**
and, on attached views, **Remove** (named "Remove from goal"). The chart's name sits on its own
line directly above the chart; on the Goals page, clicking the chart (or Enter on it) expands it,
and an expand icon (two outward arrows) in its top-right corner says so. Expandable compact charts
share `ExpandableChartFrame` (with the `ExpandIcon` atom): the Progress pane's chart uses the same
card, icon, hover/focus treatment and "Showing in place of …" + Collapse placeholder.
← → cycle charts while focus is in the section; an `aria-live` line announces the chart. The
order is the threshold chart ("Progress toward <condition>", activity-threshold goals only, can't
be removed), then attached views in order. The last chart shown is remembered per goal on this device.

- **Which views attach:** single-chart activity, goal and session views. Query views stay in
  Analytics and are listed disabled with the reason, as are empty views.
- **Compact charts:** goal details always use the simplified chart: no title, legend or axis
  titles, at most 4 x and 3 y ticks, unlabelled reference lines and a one-line caption. Metric
  Trends plots its first metric ("+N more" in the caption); Activity Totals shows the top 5.
  Elsewhere charts go compact below 480 × 260 px.
- **Threshold goals:** the chart is the goal's progress, so Completion's heading and progress bar
  aren't shown; "Mark complete" still appears when the condition is met.
  Read-only published pages keep the Completion section.
- **Expand** (Goals page only) replaces the flow tree and its controls (options pane,
  type-to-zoom) with the chart at full size, fading like the tree (200 ms): the tree fades out,
  then the chart fades in, and the reverse on collapse. The chart draws on the page's background
  grid: no gridlines of its own, axis lines in the tick colour, plot edges on grid lines, with
  points and ticks snapped to grid lines when that costs at most 10% of the space. Its controls
  stay in goal details, where the chart's place shows "Showing in place of the goal tree." and
  **Collapse**. Escape, Collapse, closing the goal or selecting another brings the tree back. On mobile the goal details step
  aside; the chart keeps a pager and "Back to goal".
- **Analytics:** with a saved view open, **Add to goal…** picks the goals it shows on (current
  goals checked); it's disabled for query views. Deleting a view names the goals it's on.

## Session Detail mobile hierarchy

At viewport widths up to 768px, Session Detail's main workspace has one 12px page gutter.
Sections retain their outer surface. Activity/circuit, round, member, set, and split containers
use shared horizontal edges, background bands, and horizontal separators rather than cumulative
padding or nested rounded boxes. Only leaf headings, timers, notes, and metric/set rows have an
8px inset; adding a structural level must not reduce descendants' usable width.

Mobile metric rows use three columns: name, value field, and unit. All three align vertically
on the same row; long names/units wrap within their columns. Inputs retain accessible metric
names and units and a minimum 96px width. Progress and planned values occupy a wrapping
full-width supporting row underneath; empty hint rows do not take space.
On mobile, cascade actions sit below the hint row without moving the name/value/unit alignment.
Desktop keeps its existing action grouping. Circuit member identity blocks stay
left-aligned whether or not right-side tag/goal controls are present.
Delete-button space is reserved only beside the item title;
timers below it use the full content width. Start, Stop, and Duration occupy one mobile row,
with equal timestamp columns and a narrower duration column (minimum 64px). Controls are 36px
high and actions remain on the row below. Timestamp inputs preserve their full values and scroll
horizontally while editing; their titles expose the full timestamps. Selection uses a pointer-transparent perimeter
overlay painted above child backgrounds, so full-width metrics cannot obscure its side edges.

The contract is scoped by `data-session-detail-content` on the main workspace. Desktop and
shared components outside that workspace retain their existing layout. The compact metric grid
also applies within the existing 760px container breakpoint in narrow desktop panes; desktop
container spacing remains unchanged. Browser regression
coverage lives in `client/e2e/session-detail-width.spec.js`.

## Session Detail one-off goal links

Session Detail captures its goal-icon scope when opening create/copy definition drafts; copied
selections and the captured scoped goal are merged and remain editable. Existing-definition editing
keeps its current associations. Actual activity instances, including circuit members and completed
sessions, expose reversible one-off links through the scoped goal's icon only when that instance
is selected and a goal is scoped. Circuit run/round selection does not expose member link buttons.
Action and association explanations appear in a hover/focus tooltip. The icon shows the hierarchy's scoped
ring only when the instance is directly associated with the current scoped goal. It sits in the
activity header beside the pencil/options controls, sharing their 28px button and 14px symbol
sizing. Circuit member controls also live in their headers. Linked buttons retain the neutral
background/border styling and expose their association through the ring and accessible pressed state.
`useActivityInstanceGoalAssociation` owns
cache updates and evidence invalidation. Duplication starts with no one-off links.

## Plan editors and planned-value hints

Plan editors (`components/prescriptions/`) scope like the session page: click an item, then
optionally a set or round; the scoped target gets the note composer (`PlanNoteComposer`) and tag
picker (`PlanTagEditor`, `ActivityTagEditor` in controlled mode). The session card shows a
"(plan 100)" hint beside the "(last …)" progress hint, in the same style, coloured met/under by
`utils/sessionPrescription.js`.

In the Programs Days workspace, past plans and logged sessions also allow circuit round
and member selection without editing recorded values. Round and member highlights use
green borders without a green fill. Selecting a member scopes its activity goals;
the member border replaces its top divider without moving the shared metric columns.
Selecting the round clears member goal scope. Clicking a selected member returns to its
round; clicking a selected round returns to its circuit; card background clears selection.
Logged session headers link the session name badge to Session Detail, place the shared
completion checkmark beside completed session badges, and show session start,
end in the user's selected timezone, and active duration (excluding pauses).
Metadata groups naturally sized fields with moderate gaps, centered in the space beside the badge.
On small screens it aligns left and wraps, with an em dash for unavailable values.

## Tag pickers and the tag manager

Every tag picker (session instance and set tags, plan tags, circuit and round scopes, the Timeline's
"Specific tags") offers the whole fractal catalog, grouped by `utils/tagPickerOptions.js`: families
in their order, then "Other tags"; archived tags appear only while already assigned. A single-select
family is labelled and uses radio inputs, and choosing one of its tags replaces the sibling.
Selected tags stay in place rather than moving to a separate group. The create box never makes a
copy: an exact (normalized) match turns its button into "Add", or "Restore" for an archived tag,
with a status line saying why.

The Manage Activity Tags modal lists families as sections, with the empty families still shown, and
offers ↑/↓ ordering within the whole family, even while filtered. Families have their own editor
(name, "Single select"). The tag editor flags a name collision while typing: "Edit it" or "Restore it",
or "Merge into it" while renaming. "Merge…" on any row picks a target and previews the combined usage.
Row actions carry the tag's name in their accessible labels.

## Progress pane

The Session Detail side pane's **Progress** view (formerly Timeline) belongs to one activity
instance: the focused one, else the session's first instance of the chosen activity.

- **Compare with** (Same tags · Specific tags · All history): Specific tags shows the tags used on
  this activity as chips, grouped by tag family; single-select families keep one.
- **Within**: two independent checkboxes, Same template and Same program day, as aligned rows
  (checkbox, label, name), with no pill borders. A checkbox is disabled when the session lacks a
  template or program day. Both combine with the tag choice.
- "Compare with" is a section label above the widget, styled like "Select Activity". The widget's
  one-line toggle row names the scope ("Same day | Same template", "Same template", "Same day" or
  "Any session") with the count ("1 of 8", full wording on hover). Expanded, Within comes first,
  then the tag choice. Collapsed, a thin divider separates the row from the compared tags, shown
  as tag badges (or "All history" / "Untagged sessions").
- Every change saves immediately on that instance, re-basing its ▲/▼ hints, and is remembered
  for the activity in that template/program day: its next instances there start from it. Choosing Same tags with both toggles off is the reset.
- The count reads "N of M past sessions match", and the list shows only matching sessions. Sets
  carry no "compared with" accent. The newest match sits
  under "Last session" (the session this one's hints compare with), the rest under "Earlier
  sessions". Hovering a past session (or focusing into it) highlights its card and makes its
  point the active one on the pane's chart and the expanded chart (with its tooltip on the
  expanded chart).
- The activity select stays fixed above the scrolling pane. Once the "Compare with" widget has
  scrolled out of view, a one-line bar (scope, compared tags, count) docks at the top of the
  history. It takes no layout space, so the history never jumps; activating it scrolls back to
  the widget and opens it.
- A compact chart sits directly under the activity select, above "Compare with". It plots the
  matching sessions ending with this one (highlighted) as one of: **Goal progress** (the in-scope
  goal condition with its threshold), **Activity trend** (one metric, or yield, over time),
  **Scatter** (metric X vs metric Y, a point per session) or **Metric trend** (two metrics over
  time). The default is goal progress when a goal applies, else a scatter for activities with two
  or more tracked metrics, else a trend. Its heading names what it shows ("Reps vs Distance",
  "Yield over time"). Like the goal detail charts, the whole
  card is the control: it highlights on hover and focus, and clicking it (or Enter/Space)
  **expands** it. The mini chart has no tooltips of its own.
- **Expanded** (like the Goals page's expanded goal chart): the session content fades out
  (200 ms), then the chart fades in at full detail in its place, drawn on the page grid. The
  content stays mounted underneath, hidden and inert, so its state and scroll survive. The
  chart's header names the activity and chart, the scope and compared tags, **Open in Analytics**
  (the same chart with the tag, template and program-day filters) and **Back to session**. It
  follows the pane live: changing the comparison cross-fades it (the old chart fades out in
  200 ms, stays out until the new series loads, then fades in; the compact chart does the same), and choosing another activity
  switches to that activity's chart. The pane card holds the chart's **controls**: Chart (the
  available kinds), Plot (a metric or Yield) / X and Y axes / the two metrics, and Sets (Top set,
  Average, plus Total for yield), then "Showing in place of the session." and **Collapse**. Each
  change saves at once (queued offline), is remembered for the activity in this session's
  template/program day (or activity-wide for sessions with neither) and cross-fades the chart.
  Open in Analytics opens the same kind: a scatter as Metric Scatter Plot, trends as Metric Trends. Escape, Collapse, Back to session or another pane mode brings the session back. On
  mobile the pane sheet steps aside while the chart shows and returns when it closes.
- While an instance uses an override, its card summary says so, so changed hints are never
  unexplained.

## Analytics tag, template and program-day filters

The Analytics filter sidebar's Global Scope has Tags (chips by family, an "Exact tag set" switch,
"Any tags" to clear), Session template and Program day sections; options come from the loaded
history. They apply to activity instances (tags) and sessions (template, program day), are saved
with views and dashboards, and a Progress pane link (`?activity=&viz=&metrics=&metricX=&metricY=&sets=&tags=&tagMatch=&template=&programDay=`)
opens one pre-configured panel and then clears itself. Metric Trends can plot the activity's
**Yield** (a chip when the activity has two or more multiplicative tracked metrics), with Sets
offering Total for it. Every activity chart combines sets the same way (`utils/setAggregation.js`):
Top set follows the metric's direction (lower-is-better metrics take their lowest), so the
scatter's top set is one real set chosen by its Y metric.
