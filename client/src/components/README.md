# Component Primitive Map

Use these shared primitives before adding local UI controls:

- `atoms/Button.jsx` - text buttons and icon+text command buttons.
- `atoms/IconButton.jsx` - icon-only controls; `aria-label` is required.
- `atoms/CloseButton.jsx` - dismissing dialogs, panels, sheets, and overlays.
- `atoms/RemoveButton.jsx` - removing chips, rows, widgets, or collection items.
- `atoms/DeleteButton.jsx` - labeled destructive delete actions.
- `atoms/Badge.jsx` - badges, pills, chips, tags, compact status labels, and type labels.
- `atoms/Input.jsx`, `atoms/Select.jsx`, `atoms/TextArea.jsx`, `atoms/Checkbox.jsx`, `atoms/Radio.jsx` - form controls.
- `atoms/Tooltip.jsx` - hover/focus help for compact icon controls.
- `atoms/Spinner.jsx` - the only spinner animation primitive.
- `common/LoadingState.jsx` - page, panel, and list loading states; composes `Spinner`.
- `common/EmptyState.jsx` - empty list, no data, and no result states.
- `common/SectionHeader.jsx`, `common/SidePaneHeader.jsx` - title/action rows.
- `common/MetaField.jsx` - label/value metadata rows.
- `common/ViewToggleTabs.jsx` - segmented view and mode switching.

Prefer extending these primitives over adding new `.badge`, `.pill`, `.closeButton`,
or local spinner implementations.
