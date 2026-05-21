import {
    getVisualizationDefaultState,
    getVisualizationKey,
} from './registry';

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function getLegacyVisualizationState(state = {}) {
    const key = getVisualizationKey(state.selectedCategory, state.selectedVisualization);
    switch (key) {
        case 'goals:timeDistribution':
            return {
                durationMode: state.goalTimeDurationMode || 'activity',
                inheritanceMode: state.goalTimeInheritanceMode || 'direct',
            };
        case 'goals:goalDetail':
            return { chart: state.selectedGoalChart || 'duration' };
        case 'sessions:heatmap':
            return { months: state.heatmapMonths || 12 };
        case 'activities:scatterPlot':
            return {
                setsHandling: state.setsHandling || 'top',
                selectedSplit: state.selectedSplit || 'all',
                metricX: state.selectedMetricX || null,
                metricY: state.selectedMetricY || null,
            };
        case 'activities:lineGraph':
            return {
                setsHandling: state.setsHandling || 'top',
                selectedSplit: state.selectedSplit || 'all',
                metric: state.selectedMetric || null,
                metricY2: state.selectedMetricY2 || null,
            };
        case 'activities:activityFrequency':
            return {
                metric: state.activityTotalsMetric || 'instances',
                showGroups: Boolean(state.activityTotalsShowGroups),
                limit: state.activityTotalsLimit || 15,
            };
        default:
            return {};
    }
}

export function normalizeVisualizationState(state = {}) {
    const key = getVisualizationKey(state.selectedCategory, state.selectedVisualization);
    if (!key) return {};

    const stateByKey = isPlainObject(state.visualizationStateByKey)
        ? state.visualizationStateByKey
        : {};
    const keyedState = isPlainObject(stateByKey[key]) ? stateByKey[key] : {};
    const unkeyedState = isPlainObject(stateByKey[key])
        ? {}
        : isPlainObject(state.visualizationState) ? state.visualizationState : {};

    return {
        ...getVisualizationDefaultState(state.selectedCategory, state.selectedVisualization),
        ...getLegacyVisualizationState(state),
        ...keyedState,
        ...unkeyedState,
    };
}

export function normalizeVisualizationStateByKey(state = {}) {
    const stateByKey = isPlainObject(state.visualizationStateByKey)
        ? state.visualizationStateByKey
        : {};
    const key = getVisualizationKey(state.selectedCategory, state.selectedVisualization);

    if (!key) {
        return { ...stateByKey };
    }

    return {
        ...stateByKey,
        [key]: normalizeVisualizationState(state),
    };
}

export function getVisualizationStateUpdate(state = {}, updates = {}) {
    const key = getVisualizationKey(state.selectedCategory, state.selectedVisualization);
    const nextActiveState = {
        ...normalizeVisualizationState(state),
        ...updates,
    };

    if (!key) {
        return { visualizationState: nextActiveState };
    }

    return {
        visualizationState: nextActiveState,
        visualizationStateByKey: {
            ...(isPlainObject(state.visualizationStateByKey) ? state.visualizationStateByKey : {}),
            [key]: nextActiveState,
        },
    };
}

export function getVisualizationSelectionUpdate(state = {}, nextVisualizationId) {
    const category = state.selectedCategory;
    const key = getVisualizationKey(category, nextVisualizationId);
    const stateByKey = isPlainObject(state.visualizationStateByKey)
        ? state.visualizationStateByKey
        : normalizeVisualizationStateByKey(state);
    const nextActiveState = key && isPlainObject(stateByKey[key])
        ? stateByKey[key]
        : getVisualizationDefaultState(category, nextVisualizationId);

    return {
        selectedVisualization: nextVisualizationId,
        visualizationState: nextActiveState,
        visualizationStateByKey: key
            ? { ...stateByKey, [key]: nextActiveState }
            : stateByKey,
    };
}
