import { getGridLayoutExtent, rescaleGridLayout } from './ProfileWindowLayout';

// The columns the Analytics filter pane takes from the grid while open.
const FILTER_PANE_COLUMNS = 20;

/**
 * A loaded layout fitted to the dashboard's current grid: rescaled from the bounds it was saved at,
 * or (for layouts saved without bounds) widened when it looks saved with the filter pane open and
 * the pane is now closed.
 */
export default function fitLayoutToBounds(layout, { savedBounds = null, bounds = null, isFiltersPaneOpen = false } = {}) {
    if (!bounds) return layout;
    if (savedBounds?.columns && savedBounds?.rows) {
        return rescaleGridLayout(layout, savedBounds, bounds);
    }

    const extent = getGridLayoutExtent(layout);
    const missingColumns = bounds.columns - extent.columns;
    const looksLikeClosedFilterPaneGap = !isFiltersPaneOpen
        // (down to the 16 columns the pane took before it matched the other pages' sidebars)
        && missingColumns >= FILTER_PANE_COLUMNS - 6
        && missingColumns <= FILTER_PANE_COLUMNS + 4;
    if (!looksLikeClosedFilterPaneGap) return layout;

    return rescaleGridLayout(layout, { columns: extent.columns, rows: bounds.rows }, bounds);
}
