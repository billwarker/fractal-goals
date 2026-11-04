import { fractalApi } from '../../../utils/api';
import { createAnalyticsViewPayload } from '../dashboardState';

/**
 * Puts the chart a goal was set from on that goal: the open saved view itself when it's unedited, else
 * this chart saved as a new view named after the goal. Only the chart's own window is saved, so a
 * dashboard panel stays a single chart.
 */
export default async function saveChartToGoal({ rootId, goalId, goalName, reusableViewId, windowState, globalFilters }) {
    let viewId = reusableViewId;
    if (!viewId) {
        const response = await fractalApi.createAnalyticsView(rootId, {
            name: goalName,
            kind: 'view',
            layout: createAnalyticsViewPayload({ windowState, globalFilters }),
            suffix_name_on_conflict: true,
        });
        viewId = response.data.data.id;
    }
    await fractalApi.attachGoalChart(rootId, goalId, viewId);
}
