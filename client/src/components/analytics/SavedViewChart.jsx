import React, { useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { queryKeys } from '../../hooks/queryKeys';
import { readSavedView, useGoalChartData } from '../../hooks/useGoalCharts';
import { fractalApi } from '../../utils/api';
import { ChartDensityContext } from './ChartJSWrapper';
import useVisualizationContext from './useVisualizationContext';
import { normalizeVisualizationState } from './visualizations/state';
import styles from './SavedViewChart.module.css';

const NOOP = () => {};

/**
 * A saved analytics view's chart, read-only, outside the Analytics page (goal details, the
 * expanded goal chart). Data is bounded (see useGoalChartData) and the chart context comes from
 * the same useVisualizationContext as the Analytics page, so the chart matches what was saved.
 * `density` 'compact' gives the simplified form for small spaces.
 */
export default function SavedViewChart({ rootId, layout, density = 'full', data: providedData = null }) {
    const chartRef = useRef(null);
    const { getGoalColor } = useGoalLevels();
    const saved = useMemo(() => readSavedView(layout), [layout]);
    const loaded = useGoalChartData(rootId, providedData ? null : saved);
    const data = providedData || loaded.data;
    const windowState = useMemo(() => saved?.windowState || {}, [saved]);
    const derived = useVisualizationContext({ data, windowState, globalFilters: saved?.globalFilters || null });
    const activityId = derived.effectiveSelectedActivity?.id || null;
    const { data: goalLines = [] } = useQuery({
        queryKey: queryKeys.goalConditionLines(rootId, activityId),
        queryFn: async () => (await fractalApi.getActivityGoalConditions(rootId, activityId)).data?.goals || [],
        enabled: Boolean(rootId && activityId),
        staleTime: 60 * 1000,
    });

    const context = useMemo(() => ({
        data,
        scopedData: {
            activities: derived.scopedActivities,
            activityInstances: derived.filteredActivityInstances,
            goals: derived.filteredGoalAnalyticsGoals,
            goalSummary: derived.filteredGoalSummary,
            sessions: derived.filteredSessions,
        },
        globalFilters: derived.resolvedGlobalFilters,
        dateRange: derived.effectiveDateRange,
        windowState,
        updateWindowState: NOOP,
        visualization: derived.selectedVisualizationMeta,
        visualizationState: normalizeVisualizationState(windowState),
        updateVisualizationState: NOOP,
        chartRef,
        effectiveSelectedActivity: derived.effectiveSelectedActivity,
        effectiveSelectedGoal: derived.effectiveSelectedGoal,
        getGoalTypeColor: getGoalColor,
        onGlobalDateRangeChange: NOOP,
        goalConditionLines: goalLines,
        density,
    }), [data, density, derived, getGoalColor, goalLines, windowState]);

    const Chart = derived.selectedVisualizationMeta?.Chart;
    if (!providedData && loaded.isLoading) return <div className={styles.status} role="status">Loading chart…</div>;
    if (!providedData && loaded.isError) {
        return (
            <div className={styles.status} role="alert">
                This chart couldn’t load. <button type="button" className={styles.retry} onClick={loaded.retry}>Retry</button>
            </div>
        );
    }
    if (!Chart) return <div className={styles.status}>This view has no chart.</div>;
    return (
        <ChartDensityContext.Provider value={density}>
            <div className={styles.chart} data-density={density}>
                <Chart context={context} />
            </div>
        </ChartDensityContext.Provider>
    );
}
