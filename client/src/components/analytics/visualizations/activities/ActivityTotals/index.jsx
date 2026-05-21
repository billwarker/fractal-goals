import React from 'react';

import ActivityTotalsChart from './ActivityTotalsChart';
import ActivityTotalsControls from './ActivityTotalsControls';
import styles from '../../../ProfileWindow.module.css';

function ActivityTotalsVisualizationChart({ context }) {
    return (
        <div className={styles.vizContainerHidden}>
            <ActivityTotalsChart
                activities={context.scopedData.activities}
                activityInstances={context.scopedData.activityInstances}
                chartRef={context.chartRef}
                metric={context.visualizationState.metric || 'instances'}
                activityGroups={context.data.activityGroups}
                showGroupNames={Boolean(context.visualizationState.showGroups)}
                limit={context.visualizationState.limit || 15}
            />
        </div>
    );
}

function ActivityTotalsVisualizationControls({ context }) {
    return (
        <ActivityTotalsControls
            visualizationState={context.visualizationState}
            updateVisualizationState={context.updateVisualizationState}
        />
    );
}

export const ACTIVITY_TOTALS_VISUALIZATION = {
    id: 'activityFrequency',
    category: 'activities',
    name: 'Activity Totals',
    iconType: 'activities:activityFrequency',
    defaultState: {
        metric: 'instances',
        showGroups: false,
        limit: 15,
    },
    selectionRequirements: {},
    Chart: ActivityTotalsVisualizationChart,
    Controls: ActivityTotalsVisualizationControls,
};

export { ActivityTotalsChart, ActivityTotalsControls };
