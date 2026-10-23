import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../../hooks/queryKeys';
import { fractalApi } from '../../utils/api';
import { ChartDensityContext } from '../analytics/ChartJSWrapper';
import ScatterPlot from '../analytics/ScatterPlot';
import { MetricTrendsChart } from '../analytics/visualizations/activities/MetricTrends';
import ConditionProgressChart from '../goalDetail/ConditionProgressChart';
import { trendMetricIds } from './progressChartSettings';

/**
 * The Progress pane's chart for a series payload, drawn with the same charts as Analytics: goal
 * progress (the condition chart with its threshold), an activity or metric trend (Metric Trends),
 * or a scatter (Metric Scatter Plot). The current session stands out; a hovered past session
 * becomes the active point.
 */
export default function ProgressChartView({ rootId, series, density = 'compact', hoverInstanceId = null }) {
    const settings = series.chart_settings;
    const activity = series.activity_definition;
    const activityId = activity?.id;
    const activityInstances = useMemo(() => ({ [activityId]: series.instances || [] }), [activityId, series.instances]);
    const activities = useMemo(() => (activity ? [activity] : []), [activity]);
    const usesGoalLines = settings?.kind !== 'goal';
    // In-scope goals draw as reference lines on the trend and scatter charts, as in Analytics.
    const { data: goalLines = [] } = useQuery({
        queryKey: queryKeys.goalConditionLines(rootId, activityId),
        queryFn: async () => (await fractalApi.getActivityGoalConditions(rootId, activityId)).data?.goals || [],
        enabled: Boolean(rootId && activityId && usesGoalLines),
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
    return <ChartDensityContext.Provider value={density}>{chart}</ChartDensityContext.Provider>;
}
