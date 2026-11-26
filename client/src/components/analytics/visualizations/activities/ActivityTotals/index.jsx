import React from 'react';

import lazyChart from '../../../lazyChart';
import GroupByControl from '../../shared/GroupByControl';
import useGroupLookups from '../../shared/useGroupLookups';
import ActivityTotalsControls from './ActivityTotalsControls';
import styles from '../../../ProfileWindow.module.css';

const ActivityTotalsChart = lazyChart(() => import('./ActivityTotalsChart'));
const ACTIVITY_TOTALS_GROUPS = ['activityGroup', 'tag', 'template', 'programDay'];

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
    groupByDimensions: ACTIVITY_TOTALS_GROUPS,
};

export { ActivityTotalsChart, ActivityTotalsControls };
