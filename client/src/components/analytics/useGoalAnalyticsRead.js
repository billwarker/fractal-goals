import { useQuery } from '@tanstack/react-query';
import { fractalApi } from '../../utils/api';
import { queryKeys } from '../../hooks/queryKeys';

export default function useGoalAnalyticsRead({ rootId, selectedCategory, selectedVisualization, selectedGoal,
    resolvedGlobalFilters, goalAnalytics, effectiveDateRange, hasActiveDateRange }) {
    const needsGoalChart = selectedCategory === 'goals' && ['goalDetail', 'timeDistribution'].includes(selectedVisualization);
    const chartGoalId = selectedVisualization === 'goalDetail'
        ? selectedGoal?.id || (resolvedGlobalFilters.hasGoalFilter && resolvedGlobalFilters.goalIds.size === 1
            ? [...resolvedGlobalFilters.goalIds][0] : resolvedGlobalFilters.hasActivityFilter && goalAnalytics?.goals?.length === 1 ? goalAnalytics.goals[0].id : null)
        : null;
    const goalReadOptions = {
        range_start: effectiveDateRange?.start ? new Date(`${effectiveDateRange.start}T00:00:00`).toISOString() : undefined,
        range_end: effectiveDateRange?.end ? new Date(`${effectiveDateRange.end}T23:59:59.999`).toISOString() : undefined,
        activity_filter: resolvedGlobalFilters.hasActivityFilter ? 'true' : undefined,
        activity_ids: resolvedGlobalFilters.hasActivityFilter ? [...resolvedGlobalFilters.activityIds].sort() : undefined,
        charts: needsGoalChart && (selectedVisualization !== 'goalDetail' || Boolean(chartGoalId)) ? 'true' : undefined,
        chart_goal_id: needsGoalChart ? chartGoalId : undefined,
    };
    const scopedGoalQuery = useQuery({
        queryKey: queryKeys.goalAnalytics(rootId, goalReadOptions),
        queryFn: async () => (await fractalApi.getGoalAnalytics(rootId, goalReadOptions)).data,
        enabled: Boolean(selectedCategory === 'goals' && rootId && goalAnalytics?.metadata?.aggregated
            && (hasActiveDateRange || resolvedGlobalFilters.hasActivityFilter || goalReadOptions.charts)),
    });
    return scopedGoalQuery;
}
