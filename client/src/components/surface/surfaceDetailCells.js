import { GRID_COLUMNS } from './gridLayout/GridLayout';

// The detail panel's width beside the tree, in grid cells, kept between 20% and 70% of the grid.
export const DEFAULT_DETAIL_PCT = 34;
const MIN_DETAIL_PCT = 20;
const MAX_DETAIL_PCT = 70;

export function clampDetailCells(cells, totalColumns) {
    const cols = Math.max(1, totalColumns || GRID_COLUMNS);
    const minCells = Math.max(1, Math.round((MIN_DETAIL_PCT / 100) * cols));
    const maxCells = Math.max(minCells, Math.round((MAX_DETAIL_PCT / 100) * cols));
    return Math.min(maxCells, Math.max(minCells, Math.round(cells)));
}

export function detailCellsFromHint(hint, totalColumns) {
    const cols = Math.max(1, totalColumns || GRID_COLUMNS);
    if (hint && typeof hint === 'object') {
        const savedCols = hint.cols || cols;
        if (hint.w && savedCols) {
            return clampDetailCells(Math.round((hint.w / savedCols) * cols), cols);
        }
    }
    return clampDetailCells(Math.round((DEFAULT_DETAIL_PCT / 100) * cols), cols);
}
