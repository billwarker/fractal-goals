import { conditionName, getGoalCondition } from '../../utils/goalConditions';

export const DEFAULT_CHART_KEY = 'condition_progress';
const STORAGE_PREFIX = 'fractal-goals:goal-chart:';
export const CHART_CHANGE_EVENT = 'fractal-goals:goal-chart-change';

export const viewChartKey = (dashboardId) => `view:${dashboardId}`;

/**
 * A goal's charts in display order: the attached saved views, which someone chose, then the threshold
 * chart (when the goal has one).
 */
export function buildGoalChartItems(payload, goal) {
    const items = (payload?.charts || []).map((chart) => ({
        key: viewChartKey(chart.dashboard_id),
        kind: 'view',
        dashboardId: chart.dashboard_id,
        name: chart.name,
        layout: chart.layout,
    }));
    if (payload?.default_chart === DEFAULT_CHART_KEY) {
        const condition = getGoalCondition(goal);
        items.push({
            key: DEFAULT_CHART_KEY,
            kind: 'default',
            name: condition ? `Progress toward ${conditionName(condition, goal)}` : 'Progress toward the goal',
        });
    }
    return items;
}

/** The chart last shown for a goal, per viewer; storage can be unavailable. */
export function readRememberedChart(goalId) {
    try {
        return window.localStorage.getItem(`${STORAGE_PREFIX}${goalId}`);
    } catch {
        return null;
    }
}

export function rememberChart(goalId, key) {
    // Goal details and the expanded chart show the same goal's charts; keep them on one chart.
    window.dispatchEvent(new CustomEvent(CHART_CHANGE_EVENT, { detail: { goalId, key } }));
    try {
        window.localStorage.setItem(`${STORAGE_PREFIX}${goalId}`, key);
    } catch {
        // Remembering is a convenience.
    }
}
