import { DEFAULT_GLOBAL_FILTERS, normalizeGlobalFilters } from './analyticsGlobalFilters';

export const ANALYTICS_DASHBOARD_VERSION = 2;
const DEFAULT_SPLIT_POSITION = 50;
const MIN_SPLIT_POSITION = 25;
const MAX_SPLIT_POSITION = 75;

export function getDefaultWindowState() {
    return {
        selectedCategory: null,
        selectedVisualization: null,
        selectedActivity: null,
        selectedMetricX: null,
        selectedMetricY: null,
        selectedMetric: null,
        selectedMetricY2: null,
        setsHandling: 'top',
        selectedSplit: 'all',
        selectedModeIds: [],
        selectedGoal: null,
        selectedGoalChart: 'duration',
        goalTimeDurationMode: 'activity',
        goalTimeInheritanceMode: 'direct',
        heatmapMonths: 12,
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

    if (node.type === 'split') {
        collectWindowIds(node.first, target);
        collectWindowIds(node.second, target);
    }
    return target;
}

function normalizeSplitPosition(position) {
    const numericPosition = typeof position === 'string'
        ? Number(position)
        : position;

    if (!Number.isFinite(numericPosition)) {
        return DEFAULT_SPLIT_POSITION;
    }

    return Math.min(MAX_SPLIT_POSITION, Math.max(MIN_SPLIT_POSITION, numericPosition));
}

function normalizeLayoutNode(node) {
    if (!isPlainObject(node) || typeof node.type !== 'string') {
        return null;
    }

    if (node.type === 'window') {
        if (typeof node.id !== 'string' || node.id.length === 0) {
            return null;
        }
        return {
            type: 'window',
            id: node.id,
        };
    }

    if (node.type !== 'split') {
        return null;
    }

    const first = normalizeLayoutNode(node.first);
    const second = normalizeLayoutNode(node.second);

    if (!first || !second) {
        return null;
    }

    if (node.direction !== 'vertical' && node.direction !== 'horizontal') {
        return null;
    }

    return {
        type: 'split',
        direction: node.direction,
        position: normalizeSplitPosition(node.position),
        first,
        second,
    };
}

function normalizeWindowState(state) {
    return {
        ...getDefaultWindowState(),
        ...(isPlainObject(state) ? state : {}),
    };
}

export function createDashboardLayoutPayload({ layout, windowStates, selectedWindowId, globalFilters }) {
    const normalizedLayout = normalizeLayoutNode(layout) || { type: 'window', id: 'window-1' };
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
    };
}

export function sanitizeDashboardLayoutPayload(payload) {
    if (!isPlainObject(payload)) {
        return null;
    }
    if (![1, ANALYTICS_DASHBOARD_VERSION].includes(payload.version)) {
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
    };
}

export function getHighestWindowIndex(layout) {
    const ids = collectWindowIds(layout);
    return ids.reduce((max, id) => {
        const match = /^window-(\d+)$/.exec(id);
        return match ? Math.max(max, Number(match[1])) : max;
    }, 1);
}
