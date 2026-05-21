const DEFAULT_VISUALIZATION_STATE = {
    'goals:stats': {},
    'goals:completionTimeline': {},
    'goals:timeDistribution': { durationMode: 'activity', inheritanceMode: 'direct' },
    'goals:completionRateByLevel': {},
    'goals:goalAging': {},
    'goals:goalMomentum': {},
    'goals:staleGoals': {},
    'goals:goalDetail': { chart: 'duration' },
    'sessions:stats': {},
    'sessions:durationTrend': {},
    'sessions:sectionPie': {},
    'sessions:heatmap': { months: 12 },
    'sessions:streaks': {},
    'sessions:weeklyChart': {},
    'sessions:completionRate': {},
    'sessions:startDistribution': {},
    'sessions:durationHistogram': {},
    'sessions:plannedVsActual': {},
    'sessions:consistency': {},
    'activities:scatterPlot': { setsHandling: 'top', selectedSplit: 'all', metricX: null, metricY: null },
    'activities:lineGraph': { setsHandling: 'top', selectedSplit: 'all', metric: null, metricY2: null },
    'activities:activityFrequency': { metric: 'instances', showGroups: false, limit: 15 },
    'activities:timeByActivity': {},
    'activities:personalBest': {},
    'activities:metricVolume': {},
    'activities:groupMix': {},
};

function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}

export function getVisualizationKey(category, id) {
    return category && id ? `${category}:${id}` : null;
}

export function getVisualizationStateDefaults(category, id) {
    return { ...(DEFAULT_VISUALIZATION_STATE[getVisualizationKey(category, id)] || {}) };
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
    return {
        ...getVisualizationStateDefaults(state.selectedCategory, state.selectedVisualization),
        ...getLegacyVisualizationState(state),
        ...(state.visualizationState || {}),
    };
}

export function getLegacyFlatUpdates(category, id, updates = {}) {
    const key = getVisualizationKey(category, id);
    switch (key) {
        case 'goals:timeDistribution':
            return {
                ...(hasOwn(updates, 'durationMode') ? { goalTimeDurationMode: updates.durationMode } : {}),
                ...(hasOwn(updates, 'inheritanceMode') ? { goalTimeInheritanceMode: updates.inheritanceMode } : {}),
            };
        case 'goals:goalDetail':
            return hasOwn(updates, 'chart') ? { selectedGoalChart: updates.chart } : {};
        case 'sessions:heatmap':
            return hasOwn(updates, 'months') ? { heatmapMonths: updates.months } : {};
        case 'activities:scatterPlot':
            return {
                ...(hasOwn(updates, 'setsHandling') ? { setsHandling: updates.setsHandling } : {}),
                ...(hasOwn(updates, 'selectedSplit') ? { selectedSplit: updates.selectedSplit } : {}),
                ...(hasOwn(updates, 'metricX') ? { selectedMetricX: updates.metricX } : {}),
                ...(hasOwn(updates, 'metricY') ? { selectedMetricY: updates.metricY } : {}),
            };
        case 'activities:lineGraph':
            return {
                ...(hasOwn(updates, 'setsHandling') ? { setsHandling: updates.setsHandling } : {}),
                ...(hasOwn(updates, 'selectedSplit') ? { selectedSplit: updates.selectedSplit } : {}),
                ...(hasOwn(updates, 'metric') ? { selectedMetric: updates.metric } : {}),
                ...(hasOwn(updates, 'metricY2') ? { selectedMetricY2: updates.metricY2 } : {}),
            };
        case 'activities:activityFrequency':
            return {
                ...(hasOwn(updates, 'metric') ? { activityTotalsMetric: updates.metric } : {}),
                ...(hasOwn(updates, 'showGroups') ? { activityTotalsShowGroups: updates.showGroups } : {}),
                ...(hasOwn(updates, 'limit') ? { activityTotalsLimit: updates.limit } : {}),
            };
        default:
            return {};
    }
}
