import React from 'react';

import { ActivityGroupMixChart } from '../../AnalyticsExtraCharts';
import ScatterPlot from '../../ScatterPlot';
import styles from '../../ProfileWindow.module.css';
import EmptyControls from '../shared/EmptyControls';
import ActivityMetricControls from './ActivityMetricControls';
import { ACTIVITY_TOTALS_VISUALIZATION } from './ActivityTotals';
import { ActivityTrendsChart, ActivityTrendsControls } from './ActivityTrends';
import { MetricProgressChart } from './MetricProgress';
import { MetricTrendsChart } from './MetricTrends';

function ActivityScatterPlotChart({ context }) {
    if (!context.effectiveSelectedActivity) {
        return <div className={styles.emptyState}>Select an activity in the filters panel</div>;
    }
    return (
        <div className={styles.vizContainerHidden}>
            <ScatterPlot
                selectedActivity={context.effectiveSelectedActivity}
                activityInstances={context.scopedData.activityInstances}
                activities={context.scopedData.activities}
                setsHandling={context.visualizationState.setsHandling || 'top'}
                selectedSplit={context.visualizationState.selectedSplit || 'all'}
                chartRef={context.chartRef}
                selectedMetricX={context.visualizationState.metricX}
                selectedMetricY={context.visualizationState.metricY}
            />
        </div>
    );
}

function ActivityTrendsVisualizationChart({ context }) {
    return (
        <div className={styles.vizContainerHidden}>
            <ActivityTrendsChart
                activityInstances={context.scopedData.activityInstances}
                chartRef={context.chartRef}
                metrics={context.visualizationState.metrics || ['instances', 'duration']}
            />
        </div>
    );
}

function ActivityTrendsVisualizationControls({ context }) {
    return <ActivityTrendsControls context={context} />;
}

function ActivityGroupMixVisualizationChart({ context }) {
    return <div className={styles.vizContainerHidden}><ActivityGroupMixChart activities={context.scopedData.activities} activityGroups={context.data.activityGroups} activityInstances={context.scopedData.activityInstances} chartRef={context.chartRef} /></div>;
}

function MetricTrendsVisualizationChart({ context }) {
    return (
        <div className={styles.vizContainerHidden}>
            <MetricTrendsChart
                activity={context.effectiveSelectedActivity}
                activityInstances={context.scopedData.activityInstances}
                chartRef={context.chartRef}
                metrics={context.visualizationState.metrics || []}
                setsHandling={context.visualizationState.setsHandling || 'top'}
                selectedSplit={context.visualizationState.selectedSplit || 'all'}
            />
        </div>
    );
}

function MetricProgressVisualizationChart({ context }) {
    return (
        <div className={styles.vizContainerHidden}>
            <MetricProgressChart
                activity={context.effectiveSelectedActivity}
                activityInstances={context.scopedData.activityInstances}
                chartRef={context.chartRef}
                metric={context.visualizationState.metric || null}
            />
        </div>
    );
}

export const ACTIVITY_VISUALIZATIONS = [
    {
        id: 'scatterPlot',
        category: 'activities',
        name: 'Metric Scatter Plot',
        iconType: 'activities:scatterPlot',
        defaultState: { setsHandling: 'top', selectedSplit: 'all', metricX: null, metricY: null },
        selectionRequirements: { activity: true },
        Chart: ActivityScatterPlotChart,
        Controls: ActivityMetricControls,
    },
    {
        id: 'activityTrends',
        category: 'activities',
        name: 'Activity Trends',
        iconType: 'activities:activityTrends',
        defaultState: { metrics: ['instances', 'duration'] },
        selectionRequirements: {},
        Chart: ActivityTrendsVisualizationChart,
        Controls: ActivityTrendsVisualizationControls,
    },
    ACTIVITY_TOTALS_VISUALIZATION,
    {
        id: 'metricTrends',
        category: 'activities',
        name: 'Metric Trends',
        iconType: 'activities:metricTrends',
        defaultState: { setsHandling: 'top', selectedSplit: 'all', metrics: [] },
        selectionRequirements: { activity: true },
        Chart: MetricTrendsVisualizationChart,
        Controls: ActivityMetricControls,
    },
    {
        id: 'metricProgress',
        category: 'activities',
        name: 'Metric Progress',
        iconType: 'activities:metricProgress',
        defaultState: { metric: null },
        selectionRequirements: { activity: true },
        Chart: MetricProgressVisualizationChart,
        Controls: ActivityMetricControls,
    },
    {
        id: 'groupMix',
        category: 'activities',
        name: 'Group Mix',
        iconType: 'activities:groupMix',
        defaultState: {},
        selectionRequirements: {},
        Chart: ActivityGroupMixVisualizationChart,
        Controls: EmptyControls,
    },
];
