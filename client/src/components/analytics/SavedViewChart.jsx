import React, { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { queryKeys } from '../../hooks/queryKeys';
import { readSavedView, useGoalChartData } from '../../hooks/useGoalCharts';
import { buildAnalyticsLink } from '../../utils/analyticsDeepLink';
import { fractalApi } from '../../utils/api';
import ChartGoalSurface from './ChartGoalSurface';
import { canSetGoalFromChart, GOAL_CHART_IDS } from './chartGoalTargets';
import { ChartDensityContext } from './ChartJSWrapper';
import { ChartError, ChartLoading } from './ChartStates';
import useVisualizationContext from './useVisualizationContext';
import { normalizeVisualizationState } from './visualizations/state';
import styles from './SavedViewChart.module.css';

const NOOP = () => {};

/** The view's activity chart on the Analytics page, or null for a chart a link can't name. */
function savedViewAnalyticsHref(rootId, visualizationId, activityId, state) {
    if (!activityId || !GOAL_CHART_IDS.has(visualizationId)) return null;
    return buildAnalyticsLink(rootId, {
        activityId,
        viz: visualizationId,
        metricIds: state.metrics || [],
        metricX: state.metricX || null,
        metricY: state.metricY || null,
        setsHandling: state.setsHandling || null,
    });
}

/**
 * A saved analytics view's chart outside the Analytics page (goal details, the
 * expanded goal chart). Data is bounded (see useGoalChartData) and the chart context comes from
 * the same useVisualizationContext as the Analytics page, so the chart matches what was saved.
 * `density` 'compact' gives the simplified form for small spaces. Read-only, unless `goalSurface`
 * ({ annotating, onAnnotatingChange, viewId, currentGoalId, onChartInfo }) makes it a goal-setting
 * surface as in Analytics; `onChartInfo` reports what the frame around it can offer.
 */
export default function SavedViewChart({ rootId, layout, density = 'full', data: providedData = null, goalSurface = null }) {
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

    const visualizationState = useMemo(() => normalizeVisualizationState(windowState), [windowState]);
    const context = useMemo(() => ({
        data,
        scopedData: {
            activities: derived.scopedActivities,
            activityInstances: derived.filteredActivityInstances,
            goals: derived.filteredGoalAnalyticsGoals,
            goalSummary: derived.filteredGoalSummary,
            sessions: derived.filteredSessions,
            chartGrain: derived.chartGrain,
            timeRollup: derived.timeRollup,
        },
        globalFilters: derived.resolvedGlobalFilters,
        dateRange: derived.effectiveDateRange,
        windowState,
        updateWindowState: NOOP,
        visualization: derived.selectedVisualizationMeta,
        visualizationState,
        updateVisualizationState: NOOP,
        chartRef,
        effectiveSelectedActivity: derived.effectiveSelectedActivity,
        effectiveSelectedGoal: derived.effectiveSelectedGoal,
        getGoalTypeColor: getGoalColor,
        onGlobalDateRangeChange: NOOP,
        goalConditionLines: goalLines,
        density,
        hideChartTitle: Boolean(goalSurface),
    }), [data, density, derived, getGoalColor, goalLines, goalSurface, visualizationState, windowState]);

    const Chart = derived.selectedVisualizationMeta?.Chart;
    const visualizationId = derived.selectedVisualizationMeta?.id;
    const canSetGoal = canSetGoalFromChart(visualizationId, derived.effectiveSelectedActivity, visualizationState.metrics);
    const analyticsHref = savedViewAnalyticsHref(rootId, visualizationId, activityId, visualizationState);
    const onChartInfo = goalSurface?.onChartInfo;
    useEffect(() => {
        onChartInfo?.({ canSetGoal, analyticsHref });
    }, [analyticsHref, canSetGoal, onChartInfo]);
    if (!providedData && loaded.isLoading) return <ChartLoading label="Loading chart…" />;
    if (!providedData && loaded.isError) return <ChartError message="This chart couldn’t load." onRetry={loaded.retry} />;
    if (!Chart) return <div className={styles.status}>This view has no chart.</div>;
    return (
        <ChartDensityContext.Provider value={density}>
            <div className={styles.chart} data-density={density}>
                {goalSurface && GOAL_CHART_IDS.has(visualizationId) ? (
                    <ChartGoalSurface
                        Chart={Chart}
                        rootId={rootId}
                        annotating={goalSurface.annotating}
                        onAnnotatingChange={goalSurface.onAnnotatingChange}
                        canSetGoal={canSetGoal}
                        currentGoalId={goalSurface.currentGoalId}
                        chartToSave={{ windowState, globalFilters: saved?.globalFilters || null, reusableViewId: goalSurface.viewId }}
                        context={context}
                    />
                ) : <Chart context={context} />}
            </div>
        </ChartDensityContext.Provider>
    );
}
