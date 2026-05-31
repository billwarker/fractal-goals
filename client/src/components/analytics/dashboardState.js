import { DEFAULT_GLOBAL_FILTERS, normalizeGlobalFilters } from './analyticsGlobalFilters';
import { GRID_COLUMNS, GRID_ROWS, migrateSplitLayoutToGrid } from './ProfileWindowLayout';
import {
    normalizeSelectedVisualization,
    normalizeVisualizationState,
    normalizeVisualizationStateByKey,
} from './visualizations/state';

export const ANALYTICS_DASHBOARD_VERSION = 3;

function normalizeLayoutBounds(bounds) {
    const columns = Math.round(Number(bounds?.columns));
    const rows = Math.round(Number(bounds?.rows));
    return {
        columns: Number.isFinite(columns) && columns > 0 ? columns : GRID_COLUMNS,
        rows: Number.isFinite(rows) && rows > 0 ? rows : GRID_ROWS,
    };
}

export function getDefaultWindowState() {
    return {
        selectedCategory: null,
        selectedVisualization: null,
        selectedActivity: null,
        selectedModeIds: [],
        selectedGoal: null,
        visualizationState: {},
        visualizationStateByKey: {},
    };
}

export function getDefaultGlobalFilters() {
    return normalizeGlobalFilters(DEFAULT_GLOBAL_FILTERS);
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function collectWindowIds(node, target = []) {
    if (!isPlainObject(node)) {
        return target;
    }

    if (node.type === 'window' && typeof node.id === 'string' && node.id) {
        target.push(node.id);
        return target;
    }

    if (node.type === 'grid') {
        (node.panels || []).forEach((panel) => {
            if (typeof panel?.id === 'string' && panel.id) {
                target.push(panel.id);
            }
        });
    }

    if (node.type === 'split') {
        collectWindowIds(node.first, target);
        collectWindowIds(node.second, target);
    }
    return target;
}

function normalizeLayoutNode(node) {
    if (!isPlainObject(node) || typeof node.type !== 'string') {
        return null;
    }

    return migrateSplitLayoutToGrid(node);
}

function normalizeWindowState(state) {
    const normalizedState = {
        ...getDefaultWindowState(),
        ...(isPlainObject(state) ? state : {}),
    };
    normalizedState.selectedVisualization = normalizeSelectedVisualization(
        normalizedState.selectedCategory,
        normalizedState.selectedVisualization
    );
    return {
        ...normalizedState,
        visualizationState: normalizeVisualizationState(normalizedState),
        visualizationStateByKey: normalizeVisualizationStateByKey(normalizedState),
    };
}

export function createDashboardLayoutPayload({ layout, windowStates, selectedWindowId, globalFilters, layoutBounds }) {
    const normalizedLayout = normalizeLayoutNode(layout) || { type: 'grid', panels: [{ id: 'window-1', x: 0, y: 0, w: 96, h: 48 }] };
    const windowIds = collectWindowIds(normalizedLayout);
    const normalizedStates = Object.fromEntries(
        windowIds.map((windowId) => [
            windowId,
            normalizeWindowState(windowStates?.[windowId]),
        ])
    );

    return {
        version: ANALYTICS_DASHBOARD_VERSION,
        layout: normalizedLayout,
        window_states: normalizedStates,
        selected_window_id: windowIds.includes(selectedWindowId) ? selectedWindowId : windowIds[0] || 'window-1',
        global_filters: normalizeGlobalFilters(globalFilters),
        layout_bounds: normalizeLayoutBounds(layoutBounds),
    };
}

export function sanitizeDashboardLayoutPayload(payload) {
    if (!isPlainObject(payload)) {
        return null;
    }
    if (![1, 2, ANALYTICS_DASHBOARD_VERSION].includes(payload.version)) {
        return null;
    }
    const normalizedLayout = normalizeLayoutNode(payload.layout);
    if (!normalizedLayout || !isPlainObject(payload.window_states)) {
        return null;
    }

    const windowIds = collectWindowIds(normalizedLayout);
    if (windowIds.length === 0) {
        return null;
    }

    const windowStates = Object.fromEntries(
        windowIds.map((windowId) => [
            windowId,
            normalizeWindowState(payload.window_states[windowId]),
        ])
    );

    return {
        layout: normalizedLayout,
        windowStates,
        selectedWindowId: windowIds.includes(payload.selected_window_id)
            ? payload.selected_window_id
            : windowIds[0],
        globalFilters: normalizeGlobalFilters(payload.global_filters),
        layoutBounds: payload.layout_bounds ? normalizeLayoutBounds(payload.layout_bounds) : null,
    };
}

export function getHighestWindowIndex(layout) {
    const ids = collectWindowIds(layout);
    return ids.reduce((max, id) => {
        const match = /^window-(\d+)$/.exec(id);
        return match ? Math.max(max, Number(match[1])) : max;
    }, 1);
}
