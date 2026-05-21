import React from 'react';

import {
    ActivityGroupMixChart,
    ActivityMetricVolumeChart,
    ActivityPersonalBestTrend,
    ActivityTimeByActivity,
} from '../../AnalyticsExtraCharts';
import LineGraph from '../../LineGraph';
import ScatterPlot from '../../ScatterPlot';
import styles from '../../ProfileWindow.module.css';
import EmptyControls from '../shared/EmptyControls';
import ActivityMetricControls from './ActivityMetricControls';
import { ACTIVITY_TOTALS_VISUALIZATION } from './ActivityTotals';

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

function ActivityLineGraphChart({ context }) {
    if (!context.effectiveSelectedActivity) {
        return <div className={styles.emptyState}>Select an activity in the filters panel</div>;
    }
    return (
        <div className={styles.vizContainerHidden}>
            <LineGraph
                selectedActivity={context.effectiveSelectedActivity}
                activityInstances={context.scopedData.activityInstances}
                activities={context.scopedData.activities}
                selectedMetric={context.visualizationState.metric}
                setSelectedMetric={(metric) => context.updateVisualizationState({ metric })}
                selectedMetricY2={context.visualizationState.metricY2}
                setSelectedMetricY2={(metricY2) => context.updateVisualizationState({ metricY2 })}
                setsHandling={context.visualizationState.setsHandling || 'top'}
                selectedSplit={context.visualizationState.selectedSplit || 'all'}
                chartRef={context.chartRef}
                selectedDateRange={context.dateRange}
                onDateRangeChange={context.onGlobalDateRangeChange}
                showMetricSelectors={false}
            />
        </div>
    );
}

function ActivityTimeByActivityVisualizationChart({ context }) {
    return <div className={styles.vizContainerHidden}><ActivityTimeByActivity activities={context.scopedData.activities} activityInstances={context.scopedData.activityInstances} chartRef={context.chartRef} /></div>;
}

function ActivityPersonalBestChart({ context }) {
    if (!context.effectiveSelectedActivity) {
        return <div className={styles.emptyState}>Select an activity in the filters panel</div>;
    }
    return <div className={styles.vizContainerHidden}><ActivityPersonalBestTrend selectedActivity={context.effectiveSelectedActivity} activities={context.scopedData.activities} activityInstances={context.scopedData.activityInstances} chartRef={context.chartRef} /></div>;
}

function ActivityMetricVolumeVisualizationChart({ context }) {
    if (!context.effectiveSelectedActivity) {
        return <div className={styles.emptyState}>Select an activity in the filters panel</div>;
    }
    return <div className={styles.vizContainerHidden}><ActivityMetricVolumeChart selectedActivity={context.effectiveSelectedActivity} activities={context.scopedData.activities} activityInstances={context.scopedData.activityInstances} chartRef={context.chartRef} /></div>;
}

function ActivityGroupMixVisualizationChart({ context }) {
    return <div className={styles.vizContainerHidden}><ActivityGroupMixChart activities={context.scopedData.activities} activityGroups={context.data.activityGroups} activityInstances={context.scopedData.activityInstances} chartRef={context.chartRef} /></div>;
}

export const ACTIVITY_VISUALIZATIONS = [
    {
        id: 'scatterPlot',
        category: 'activities',
        name: 'Scatter Plot',
        iconType: 'activities:scatterPlot',
        defaultState: { setsHandling: 'top', selectedSplit: 'all', metricX: null, metricY: null },
        selectionRequirements: { activity: true },
        Chart: ActivityScatterPlotChart,
        Controls: ActivityMetricControls,
    },
    {
        id: 'lineGraph',
        category: 'activities',
        name: 'Line Graph',
        iconType: 'activities:lineGraph',
        defaultState: { setsHandling: 'top', selectedSplit: 'all', metric: null, metricY2: null },
        selectionRequirements: { activity: true },
        Chart: ActivityLineGraphChart,
        Controls: ActivityMetricControls,
    },
    ACTIVITY_TOTALS_VISUALIZATION,
    {
        id: 'timeByActivity',
        category: 'activities',
        name: 'Time Per Activity',
        iconType: 'activities:timeByActivity',
        defaultState: {},
        selectionRequirements: {},
        Chart: ActivityTimeByActivityVisualizationChart,
        Controls: EmptyControls,
    },
    {
        id: 'personalBest',
        category: 'activities',
        name: 'Personal Best',
        iconType: 'activities:personalBest',
        defaultState: {},
        selectionRequirements: { activity: true },
        Chart: ActivityPersonalBestChart,
        Controls: ActivityMetricControls,
    },
    {
        id: 'metricVolume',
        category: 'activities',
        name: 'Metric Volume',
        iconType: 'activities:metricVolume',
        defaultState: {},
        selectionRequirements: { activity: true },
        Chart: ActivityMetricVolumeVisualizationChart,
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
