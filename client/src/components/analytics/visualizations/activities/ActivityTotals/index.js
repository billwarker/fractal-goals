import ActivityTotalsChart from './ActivityTotalsChart';
import ActivityTotalsControls from './ActivityTotalsControls';

export const ACTIVITY_TOTALS_VISUALIZATION = {
    id: 'activityFrequency',
    category: 'activities',
    name: 'Activity Totals',
    iconType: 'activities:activityFrequency',
    defaultState: {
        activityTotalsMetric: 'instances',
        activityTotalsShowGroups: false,
        activityTotalsLimit: 15,
    },
    Chart: ActivityTotalsChart,
    Controls: ActivityTotalsControls,
};

export { ActivityTotalsChart, ActivityTotalsControls };
