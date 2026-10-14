# Mobile Session Detail width — delivery audit

Date: 2026-10-14

## Delivered behavior

Session Detail retains its section/activity/circuit/round/member/set hierarchy with a single
12px mobile page gutter. Structural levels share horizontal edges; leaf content has an 8px
inset. Background bands, headings, numbering, vertical gaps, and horizontal separators express
depth without narrowing descendants. Desktop container spacing remains unchanged.

Mobile metric names, value fields, and units use three bounded columns with a minimum 96px
value width. Previous results and planned values share a wrapping supporting row underneath. The existing compact container
breakpoint also handles narrow desktop panes. Long derived summary values wrap within the
workspace. Circuit cascades use the editor's optional `valueAction` slot, retaining one control
and the desktop input/metadata/action order. Notes no longer add a second structural inset.

Selected activities, circuits, rounds, members, and sets use a pointer-transparent perimeter
above descendant backgrounds. Full-width metric content cannot cover the selection edges.
Delete-button clearance applies only beside the title, leaving timers their full width.

## Validation

- 172 component tests across 39 Session Detail and circuit test files passed.
- Final browser run: 3 passed, 1 intentionally skipped. The width fixture runs once on the
  desktop project and checks 320, 375, 390, 768, 769, and 1280px; the existing circuit-tag
  workflow runs on both desktop and iPhone-configured Chromium projects.
- Browser assertions cover shared structural edges, no horizontal overflow, minimum input
  widths, long labels/units, splits, multiple sets, three circuit rounds, planned values,
  previous-value hints, metric editing and persisted cascading, notes, set selection,
  completion, and tags. Screenshot pixels verify all four selected-member edges.
- Dark-theme screenshots were inspected, including the selected member with its full-width
  metric background. Selection preserves width and does not intercept input.
- Production build, bundle budgets, lint, typecheck, responsive audit, and diff whitespace
  checks passed.

## Quality assessment and distance to S+

The scoped implementation meets the agreed S+ acceptance criteria. There is no known remaining
feature gap. CSS remains scoped to the main Session Detail workspace; shared consumers elsewhere
retain their styling. No duplicate mobile component, duplicated cascade control, negative-margin
compensation, or overflow clipping was introduced. Existing desktop grouping remains intentional,
not a competing implementation. The UI contract and project index reflect the new invariant.

Repository-wide S+ remains blocked by existing maintainability audit failures: import order in
`useSessionDetailController.js` and `AppUpdatePrompt.jsx`, line budgets in `CreateSession.jsx` and
`core.test.js`, and the legacy badge-selector budget (185 versus 184). The unchanged files were
checked against HEAD; this change adds zero badge selectors. Those unrelated failures were not
folded into this mobile-layout change.

Commit message: `fix: flatten mobile session spacing and preserve selection perimeters`

## Follow-up: one mobile timer row

Start, Stop, and Duration now occupy one row for both standalone activities and circuits.
Timestamp columns share the available width; Duration has a 64px minimum. All controls are
36px high and their top edges align. Actions remain below. Full timestamp values, editing,
validation, and persistence are unchanged; titles expose complete timestamps and narrow inputs
retain native horizontal text scrolling. The UI contract and index were updated.

Validation: 17 timer/component tests passed, as did the six-width browser regression, production
build, lint, typecheck, responsive audit, and whitespace checks. Browser assertions check all
four timer rows at every mobile width for aligned controls, non-overlapping columns, duration
width, and control height. The 320px screenshot was inspected. Desktop spacing remains unchanged.

Scoped quality assessment: S+ acceptance met; no known timer-row implementation gap remains.
The repository-wide maintainability debt recorded above is unchanged.

Follow-up commit message: `fix: align mobile session timer fields in one row`

## Follow-up: circuit identity and final metric presentation

Circuit member names align to the left content edge, including headers without right-side
controls. The controls selector targets the second child rather than the last child, so it
cannot right-align a lone identity block.

The final requested metric presentation keeps the name outside the field, the numeric value
inside, and units plus progress/planned-value hints in a wrapping row underneath. Embedded
unit/name decorations and their wrapper/styles were removed. Numeric and allowed-value inputs
retain accessible metric names and unit descriptions in both filled and empty states. The
single-row timers and selection perimeter overlays remain intact.

Validation: all 174 component tests passed. Browser run: 3 passed, 1 intentionally skipped;
the width fixture checks all six viewports, including left header alignment, external labels,
and units/hints beneath fields. Desktop/touch tag workflows, painted selection edges, editing,
cascading, notes, and completion passed. Production build, lint, typecheck, responsive audit,
and whitespace checks passed. The final selected-member screenshot was inspected.

Scoped quality assessment: the final requested presentation meets S+ acceptance; no known
implementation gap remains. Existing repository-wide maintainability failures are unchanged.
The UI reference and index describe the final layout.

Follow-up commit message: `fix: align circuit names left and keep metric hints below fields`


## Follow-up: three-column metric rows

Mobile metric rows now have three external columns: name, input, and unit. Their vertical
centers align; names and units wrap inside bounded columns. Progress and planned-value hints
remain underneath in a separate wrapping row. Empty hint rows take no space. Cascade controls
use the next available row, preserving the three-column alignment even when shown. Desktop
metadata grouping remains unchanged. The shared editor renders one unit and one hint group;
there are no duplicated controls or embedded-unit decorations.

Validation: 174 component tests, three browser tests (one intentional project skip), production
build, lint, typecheck, responsive audit, and whitespace checks passed. Browser assertions cover
all six viewport widths, column order, unit/input vertical alignment, hints below the field,
minimum input width, no overflow, and existing selection/edit/cascade/tag/completion behavior.
The selected-member screenshot was inspected. The UI contract and index reflect this final
presentation.

Scoped quality assessment: S+ acceptance met with no known implementation gap. Existing
repository-wide maintainability debt remains unchanged.

Follow-up commit message: `fix: use three-column mobile metric rows`
