import { useQuery } from '@tanstack/react-query';
import { fractalApi } from '../../utils/api';
import { queryKeys } from '../../hooks/queryKeys';
import { useTimezone } from '../../contexts/TimezoneContext';

export default function useGoalAnalyticsRead({ rootId, selectedCategory, selectedVisualization, selectedGoal,
    resolvedGlobalFilters, goalAnalytics, effectiveDateRange, hasActiveDateRange, grain = 'auto', rollup = null }) {
    const { timezone } = useTimezone();
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
        // Chart buckets are calendar days, weeks or months in the user's timezone.
        grain: needsGoalChart ? grain : undefined,
        timezone: needsGoalChart ? timezone : undefined,
        // Time Spent Per Goal stacks series the server rolls up from the evidence itself.
        ...(selectedVisualization === 'timeDistribution' ? {
            rollup: 'true',
            rollup_rank: Number.isInteger(rollup?.rank) ? rollup.rank : undefined,
            focus_goal_id: rollup?.focusGoalId || undefined,
            duration_mode: rollup?.durationMode || 'activity',
        } : {}),
    };
    const scopedGoalQuery = useQuery({
        queryKey: queryKeys.goalAnalytics(rootId, goalReadOptions),
        queryFn: async () => (await fractalApi.getGoalAnalytics(rootId, goalReadOptions)).data,
        enabled: Boolean(selectedCategory === 'goals' && rootId && goalAnalytics?.metadata?.aggregated
            && (hasActiveDateRange || resolvedGlobalFilters.hasActivityFilter || goalReadOptions.charts)),
    });
    return scopedGoalQuery;
}
