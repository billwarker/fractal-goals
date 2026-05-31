import {
    getVisualizationDefaultState,
    getVisualizationKey,
} from './registry';

const VISUALIZATION_ID_ALIASES = {
    sessions: {
        durationTrend: 'sessionTrends',
        weeklyChart: 'sessionTrends',
        consistency: 'sessionTrends',
        heatmap: 'sessionTrends',
        completionRate: 'sessionTrends',
        plannedVsActual: 'sessionTrends',
    },
    activities: {
        lineGraph: 'metricTrends',
        timeByActivity: 'activityFrequency',
        personalBest: 'metricTrends',
        metricVolume: 'metricTrends',
    },
};

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeSelectedVisualization(category, visualization) {
    return VISUALIZATION_ID_ALIASES[category]?.[visualization] || visualization;
}

export function getLegacyVisualizationState(state = {}) {
    const selectedVisualization = normalizeSelectedVisualization(state.selectedCategory, state.selectedVisualization);
    const key = getVisualizationKey(state.selectedCategory, selectedVisualization);
    switch (key) {
        case 'goals:timeDistribution':
            return {
                durationMode: state.goalTimeDurationMode || 'activity',
                inheritanceMode: state.goalTimeInheritanceMode || 'direct',
            };
        case 'goals:goalDetail':
            return { chart: state.selectedGoalChart || 'duration' };
        case 'activities:scatterPlot':
            return {
                setsHandling: state.setsHandling || 'top',
                selectedSplit: state.selectedSplit || 'all',
                metricX: state.selectedMetricX || null,
                metricY: state.selectedMetricY || null,
            };
        case 'activities:metricTrends':
            return {
                setsHandling: state.setsHandling || 'top',
                selectedSplit: state.selectedSplit || 'all',
                metrics: [
                    state.selectedMetric?.id || state.selectedMetric || null,
                    state.selectedMetricY2?.id || state.selectedMetricY2 || null,
                ].filter(Boolean),
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
    const selectedVisualization = normalizeSelectedVisualization(state.selectedCategory, state.selectedVisualization);
    const key = getVisualizationKey(state.selectedCategory, selectedVisualization);
    if (!key) return {};

    const stateByKey = isPlainObject(state.visualizationStateByKey)
        ? state.visualizationStateByKey
        : {};
    const keyedState = isPlainObject(stateByKey[key]) ? stateByKey[key] : {};
    const unkeyedState = isPlainObject(stateByKey[key])
        ? {}
        : isPlainObject(state.visualizationState) ? state.visualizationState : {};

    return {
        ...getVisualizationDefaultState(state.selectedCategory, selectedVisualization),
        ...getLegacyVisualizationState(state),
        ...keyedState,
        ...unkeyedState,
    };
}

export function normalizeVisualizationStateByKey(state = {}) {
    const stateByKey = isPlainObject(state.visualizationStateByKey)
        ? state.visualizationStateByKey
        : {};
    const selectedVisualization = normalizeSelectedVisualization(state.selectedCategory, state.selectedVisualization);
    const key = getVisualizationKey(state.selectedCategory, selectedVisualization);

    if (!key) {
        return { ...stateByKey };
    }

    return {
        ...stateByKey,
        [key]: normalizeVisualizationState(state),
    };
}

export function getVisualizationStateUpdate(state = {}, updates = {}) {
    const selectedVisualization = normalizeSelectedVisualization(state.selectedCategory, state.selectedVisualization);
    const key = getVisualizationKey(state.selectedCategory, selectedVisualization);
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
    const selectedVisualization = normalizeSelectedVisualization(category, nextVisualizationId);
    const key = getVisualizationKey(category, selectedVisualization);
    const stateByKey = isPlainObject(state.visualizationStateByKey)
        ? state.visualizationStateByKey
        : normalizeVisualizationStateByKey(state);
    const nextActiveState = key && isPlainObject(stateByKey[key])
        ? stateByKey[key]
        : getVisualizationDefaultState(category, selectedVisualization);

    return {
        selectedVisualization,
        visualizationState: nextActiveState,
        visualizationStateByKey: key
            ? { ...stateByKey, [key]: nextActiveState }
            : stateByKey,
    };
}
