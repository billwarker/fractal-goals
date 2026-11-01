import React from 'react';

import GroupByControl from '../../shared/GroupByControl';
import useGroupLookups from '../../shared/useGroupLookups';
import ActivityTotalsChart, { ACTIVITY_TOTALS_GROUPS } from './ActivityTotalsChart';
import ActivityTotalsControls from './ActivityTotalsControls';
import styles from '../../../ProfileWindow.module.css';

function ActivityTotalsVisualizationChart({ context }) {
    const { groupBy, lookups, overlap } = useGroupLookups(context, ACTIVITY_TOTALS_GROUPS);
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
                groupBy={groupBy}
                lookups={lookups}
                overlap={overlap}
            />
        </div>
    );
}

function ActivityTotalsVisualizationControls({ context }) {
    return (
        <>
            <ActivityTotalsControls
                visualizationState={context.visualizationState}
                updateVisualizationState={context.updateVisualizationState}
            />
            <GroupByControl context={context} dimensions={ACTIVITY_TOTALS_GROUPS} />
        </>
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
