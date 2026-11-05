import React, { useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../../hooks/queryKeys';
import { fractalApi } from '../../utils/api';
import ChartGoalSurface from '../analytics/ChartGoalSurface';
import { ChartDensityContext } from '../analytics/ChartJSWrapper';
import { canSetGoalFromChart } from '../analytics/chartGoalTargets';
import ScatterPlot from '../analytics/ScatterPlot';
import { MetricTrendsChart } from '../analytics/visualizations/activities/MetricTrends';
import { conditionLine } from '../../utils/goalConditionSeries';
import ConditionProgressChart from '../goalDetail/ConditionProgressChart';
import { trendMetricIds } from './progressChartSettings';

/**
 * The Analytics chart a goal can be set from on this series, and how it reads the series, or null: a
 * goal's chart plotting a running total or two rules, or a trend of two metrics, can't name a single
 * goal from one point.
 */
export function progressGoalChart(series) {
    const settings = series?.chart_settings;
    const setsHandling = settings?.set_aggregation || 'top';
    if (settings?.kind === 'scatter') return { id: 'scatterPlot', setsHandling };
    if (settings?.kind === 'goal') {
        const line = conditionLine(series.chart?.condition);
        return line ? { id: 'metricTrends', metrics: [line.metricId], setsHandling: line.setsHandling } : null;
    }
    if (settings?.kind !== 'activity_trend' && settings?.kind !== 'metric_trend') return null;
    const metrics = trendMetricIds(settings);
    return canSetGoalFromChart('metricTrends', series.activity_definition, metrics) ? { id: 'metricTrends', metrics, setsHandling } : null;
}

/** A chart on the goal surface, taking what it adds from the context. */
function GoalSurfaceChart({ context }) {
    const { Chart, props } = context.progressChart;
    return <Chart {...props} chartRef={context.chartRef} goalLines={context.goalConditionLines} onOpenGoal={context.onOpenGoal} />;
}

/**
 * The Progress pane's chart for a series payload, drawn with the same charts as Analytics: goal
 * progress (the condition chart with its threshold), an activity or metric trend (Metric Trends),
 * or a scatter (Metric Scatter Plot). The current session stands out; a hovered past session
 * becomes the active point. With `goalSurface` ({ annotating, onAnnotatingChange, chartToSave }), goals
 * can be set from the chart as on the Analytics page.
 */
export default function ProgressChartView({ rootId, series, density = 'compact', hoverInstanceId = null, goalSurface = null }) {
    const surfaceChartRef = useRef(null);
    const settings = series.chart_settings;
    const activity = series.activity_definition;
    const activityId = activity?.id;
    const activityInstances = useMemo(() => ({ [activityId]: series.instances || [] }), [activityId, series.instances]);
    const activities = useMemo(() => (activity ? [activity] : []), [activity]);
    // In-scope goals are marked on the charts, as in Analytics.
    const { data: goalLines = [] } = useQuery({
        queryKey: queryKeys.goalConditionLines(rootId, activityId),
        queryFn: async () => (await fractalApi.getActivityGoalConditions(rootId, activityId)).data?.goals || [],
        enabled: Boolean(rootId && activityId),
        staleTime: 60 * 1000,
    });
    if (!settings || !activity) return null;
    const shared = {
        highlightInstanceId: series.current_instance_id,
        hoverInstanceId,
    };
    const setsHandling = settings.set_aggregation || 'top';

    let chart = null;
    if (settings.kind === 'goal' && series.chart?.condition) {
        chart = (
            <ConditionProgressChart
                condition={series.chart.condition}
                instances={series.instances}
                activity={activity}
                density={density}
                goalLines={goalLines}
                goalId={series.chart.goal_id}
                {...shared}
            />
        );
    } else if (settings.kind === 'scatter') {
        chart = (
            <ScatterPlot
                selectedActivity={activity}
                activities={activities}
                activityInstances={activityInstances}
                selectedMetricX={settings.x_metric_id}
                selectedMetricY={settings.y_metric_id}
                setsHandling={setsHandling === 'average' ? 'average' : 'top'}
                goalLines={goalLines}
                hideTitle
                {...shared}
            />
        );
    } else if (settings.kind === 'activity_trend' || settings.kind === 'metric_trend') {
        chart = (
            <MetricTrendsChart
                activity={activity}
                activityInstances={activityInstances}
                metrics={trendMetricIds(settings)}
                setsHandling={setsHandling}
                goalLines={goalLines}
                hideTitle
                {...shared}
            />
        );
    }
    const goalChart = goalSurface ? progressGoalChart(series) : null;
    if (goalChart) {
        chart = (
            <ChartGoalSurface
                Chart={GoalSurfaceChart}
                rootId={rootId}
                annotating={goalSurface.annotating}
                onAnnotatingChange={goalSurface.onAnnotatingChange}
                chartToSave={goalSurface.chartToSave}
                context={{
                    visualization: { id: goalChart.id },
                    chartRef: surfaceChartRef,
                    effectiveSelectedActivity: activity,
                    scopedData: { activities, activityInstances },
                    visualizationState: { setsHandling: goalChart.setsHandling },
                    globalFilters: null,
                    progressChart: { Chart: chart.type, props: chart.props },
                }}
            />
        );
    }
    return <ChartDensityContext.Provider value={density}>{chart}</ChartDensityContext.Provider>;
}
