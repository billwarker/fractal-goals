import { useMemo } from 'react';

/** Resolve chart choices once for both its controls and selection dialogs. */
export default function useAnalyticsChartControls({ rootId, selectedWindowState, selectedVisualizationMeta,
    visualizationState, profileActivities, profileGoals, resolvedGlobalScope, activityInstances, updateSelectedWindow, updateVisualizationState }) {
    const selectedActivity = selectedWindowState?.selectedActivity || null;
    const selectedActivityDef = useMemo(() => {
        if (selectedActivity?.id) {
            return profileActivities.find((activity) => activity.id === selectedActivity.id) || null;
        }
        if (
            selectedVisualizationMeta?.selectionRequirements?.activity
            && resolvedGlobalScope.hasActivityFilter
            && profileActivities.length === 1
        ) {
            return profileActivities[0];
        }
        return null;
    }, [profileActivities, resolvedGlobalScope.hasActivityFilter, selectedActivity, selectedVisualizationMeta]);
    const selectedGoal = selectedWindowState?.selectedGoal || null;
    const selectedGoalDef = useMemo(() => {
        if (selectedGoal?.id) {
            return profileGoals.find((goal) => goal.id === selectedGoal.id) || null;
        }
        if (resolvedGlobalScope.filters.goals.goalIds.length === 1) {
            const goalId = resolvedGlobalScope.filters.goals.goalIds[0];
            return profileGoals.find((goal) => goal.id === goalId) || null;
        }
        if (
            selectedVisualizationMeta?.selectionRequirements?.goal
            && (resolvedGlobalScope.hasGoalFilter || resolvedGlobalScope.hasActivityFilter)
            && profileGoals.length === 1
        ) {
            return profileGoals[0];
        }
        return null;
    }, [
        profileGoals,
        resolvedGlobalScope.filters.goals.goalIds,
        resolvedGlobalScope.hasActivityFilter,
        resolvedGlobalScope.hasGoalFilter,
        selectedGoal,
        selectedVisualizationMeta,
    ]);
    const metricDefinitions = selectedActivityDef?.metric_definitions || [];
    const multiplicativeMetrics = metricDefinitions.filter((metric) => metric.is_multiplicative !== false);
    const metricOptions = [
        ...metricDefinitions,
        ...(multiplicativeMetrics.length > 1
            ? [{ id: '__product__', name: multiplicativeMetrics.map((metric) => metric.name).join(' x '), unit: 'Product' }]
            : []),
    ];
    const selectedMetricId = visualizationState?.metric?.id || visualizationState?.metric || metricOptions[0]?.id || '';
    const selectedMetricY2Id = visualizationState?.metricY2?.id || visualizationState?.metricY2 || '';
    const selectedMetricXId = visualizationState?.metricX?.id || visualizationState?.metricX || metricDefinitions[0]?.id || '';
    const selectedMetricYId = visualizationState?.metricY?.id || visualizationState?.metricY || metricDefinitions[1]?.id || '';
    const selectedPanelUsesScopedChoices = selectedWindowState?.selectedVisualization
        && (selectedVisualizationMeta?.selectionRequirements?.goal || selectedVisualizationMeta?.selectionRequirements?.activity);
    const hasScopedChoices = resolvedGlobalScope.hasGoalFilter || resolvedGlobalScope.hasActivityFilter;
    const activityInstanceCounts = useMemo(() => Object.fromEntries(
        profileActivities.map((activity) => [activity.id, (activityInstances[activity.id] || []).length])
    ), [profileActivities, activityInstances]);

    return { rootId, metricDefinitions, metricOptions, profileActivities, profileGoals, selectedActivityDef,
        selectedGoalDef, selectedMetricId, selectedMetricXId, selectedMetricYId, selectedMetricY2Id,
        selectedWindowState, selectedVisualizationMeta, updateSelectedWindow, updateVisualizationState,
        visualization: selectedVisualizationMeta, visualizationState, activityInstanceCounts,
        selectedPanelUsesScopedChoices, hasScopedChoices };
}
