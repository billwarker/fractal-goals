# Component Primitive Map

Use these shared primitives before adding local UI controls:

- `atoms/Button.jsx` - text buttons and icon+text command buttons.
- `atoms/IconButton.jsx` - icon-only controls; `aria-label` is required.
- `atoms/DisclosureButton.jsx` - expand/collapse chevrons for sections, panels, and tree rows.
- `atoms/CloseButton.jsx` - dismissing dialogs, panels, sheets, and overlays.
- `atoms/RemoveButton.jsx` - removing chips, rows, widgets, or collection items.
- `atoms/DeleteButton.jsx` - labeled destructive delete actions.
- `atoms/DropdownMenu.jsx` - compact anchored option menus and menu items.
- `atoms/Badge.jsx` - badges, pills, chips, tags, compact status labels, and type labels.
- `atoms/SmartBadge.jsx` - the SMART-letters pill; `SMARTIndicator.jsx` wraps it with per-goal criterion status.
- `atoms/Input.jsx`, `atoms/Select.jsx`, `atoms/TextArea.jsx`, `atoms/Checkbox.jsx`, `atoms/Radio.jsx` - form controls.
- `atoms/Tooltip.jsx` - hover/focus help for compact icon controls.
- `atoms/Modal.jsx` - canonical titled dialogs with focus trapping, focus restoration, a persistent header/close control, and a scrolling body.
- `atoms/ModalBackdrop.jsx` - shared backdrop dismissal and visual-viewport positioning for canonical modals, specialized dialogs, and full-viewport sheets. Visual-viewport tracking is on by default; use `constrainToVisualViewport={false}` only for sheets whose geometry intentionally reserves app-owned navigation or footer space.
- `atoms/Spinner.jsx` - the only spinner animation primitive.
- `common/LoadingState.jsx` - page, panel, and list loading states; composes `Spinner`.
- `common/EmptyState.jsx` - empty list, no data, and no result states.
- `common/ActivitySummaryRail.jsx` - wrapping horizontal label/value summaries for derived activity-instance metrics across Sessions and Session Detail.
- `common/SectionHeader.jsx`, `common/SidePaneHeader.jsx` - title/action rows.
- `common/MetaField.jsx` - label/value metadata rows.
- `common/ViewToggleTabs.jsx` - segmented view and mode switching.

Prefer extending these primitives over adding new `.badge`, `.pill`, `.closeButton`,
or local spinner implementations.
