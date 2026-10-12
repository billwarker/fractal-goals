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

Goal Details has one Timeline section beneath targets, combining a lifetime calendar with
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
line-height token. Description and targets
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
