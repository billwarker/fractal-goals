import React, { useMemo } from 'react';

import { instanceMatchesScope, resolveAnalyticsGlobalFilters, sessionMatchesScope } from './analyticsGlobalFilters';
import { summarizeFilteredGoals } from './filteredGoalSummary';
import useGoalAnalyticsRead from './useGoalAnalyticsRead';
import { getVisualization } from './visualizations/registry';

/**
 * Everything a visualization needs from one window's state: the resolved global filters, the
 * activities, sessions, instances and goal analytics they leave in scope, and the effective
 * activity and goal the chart is about. The Analytics page's ProfileWindow, the Goals page's
 * analytics panel and goal charts all build their chart context from this, so they agree.
 *
 * @param {{ data: object, windowState: object, globalDateRange?: object | null, globalFilters?: object | null }} input
 */
export default function useVisualizationContext({ data, windowState, globalDateRange = null, globalFilters = null }) {
    const { sessions = [], goalAnalytics, activities = [], activityGroups = [], activityInstances = {}, rootId } = data;
    const { selectedCategory, selectedVisualization, selectedActivity, selectedGoal } = windowState || {};

    const effectiveDateRange = globalDateRange;
    const resolvedGlobalFilters = useMemo(() => resolveAnalyticsGlobalFilters({
        filters: globalFilters,
        goalAnalytics,
        activities,
        activityGroups,
        activityInstances,
    }), [activities, activityGroups, activityInstances, globalFilters, goalAnalytics]);
    const scopedActivities = useMemo(() => (
        resolvedGlobalFilters.hasActivityFilter
            ? activities.filter((activity) => resolvedGlobalFilters.activityIds.has(activity.id))
            : activities
    ), [activities, resolvedGlobalFilters.activityIds, resolvedGlobalFilters.hasActivityFilter]);
    const selectedVisualizationMeta = getVisualization(selectedCategory, selectedVisualization);
    const effectiveSelectedActivity = useMemo(() => {
        if (selectedActivity?.id && scopedActivities.some((activity) => activity.id === selectedActivity.id)) {
            return scopedActivities.find((activity) => activity.id === selectedActivity.id);
        }
        if (
            selectedVisualizationMeta?.selectionRequirements?.activity
            && resolvedGlobalFilters.hasActivityFilter
            && scopedActivities.length === 1
        ) {
            return scopedActivities[0];
        }
        return null;
    }, [resolvedGlobalFilters.hasActivityFilter, scopedActivities, selectedActivity, selectedVisualizationMeta]);
    const hasActiveDateRange = Boolean(effectiveDateRange?.start || effectiveDateRange?.end);

    const isDateInRange = React.useCallback((value) => {
        if (!hasActiveDateRange) return true;
        const date = value ? new Date(value) : null;
        if (!date || Number.isNaN(date.getTime())) return false;
        const start = effectiveDateRange?.start ? new Date(`${effectiveDateRange.start}T00:00:00`) : null;
        const end = effectiveDateRange?.end ? new Date(`${effectiveDateRange.end}T23:59:59`) : null;
        if (start && date < start) return false;
        if (end && date > end) return false;
        return true;
    }, [effectiveDateRange, hasActiveDateRange]);

    const scopedGoalQuery = useGoalAnalyticsRead({ rootId, selectedCategory, selectedVisualization, selectedGoal,
        resolvedGlobalFilters, goalAnalytics, effectiveDateRange, hasActiveDateRange });
    const scopedGoalAnalytics = scopedGoalQuery.data || goalAnalytics;

    const filteredSessions = useMemo(() => {
        const dateFiltered = sessions.filter((session) => {
            const rawDate = session.session_start || session.created_at;
            return isDateInRange(rawDate) && sessionMatchesScope(session, resolvedGlobalFilters.filters);
        });
        if (!resolvedGlobalFilters.hasActivityFilter) {
            return dateFiltered;
        }
        return dateFiltered.filter((session) => resolvedGlobalFilters.sessionIds.has(session.id));
    }, [isDateInRange, resolvedGlobalFilters.filters, resolvedGlobalFilters.hasActivityFilter, resolvedGlobalFilters.sessionIds, sessions]);

    const sessionsById = useMemo(() => new Map(sessions.map((session) => [session.id, session])), [sessions]);

    const filteredActivityInstances = useMemo(() => {
        return Object.fromEntries(Object.entries(activityInstances || {}).map(([activityId, instances]) => [
            activityId,
            (instances || []).filter((instance) => {
                if (resolvedGlobalFilters.hasActivityFilter && !resolvedGlobalFilters.activityIds.has(activityId)) {
                    return false;
                }
                if (!instanceMatchesScope(instance, sessionsById.get(instance.session_id), resolvedGlobalFilters.filters)) {
                    return false;
                }
                const rawDate = instance.session_date || instance.created_at;
                return isDateInRange(rawDate);
            }),
        ]));
    }, [activityInstances, isDateInRange, resolvedGlobalFilters.activityIds, resolvedGlobalFilters.filters, resolvedGlobalFilters.hasActivityFilter, sessionsById]);

    const filteredGoalAnalyticsGoals = useMemo(() => {
        const goals = scopedGoalAnalytics?.goals || [];
        const scopedGoals = resolvedGlobalFilters.hasGoalFilter
            ? goals.filter((goal) => resolvedGlobalFilters.goalIds.has(goal.id))
            : goals;
        const allowedActivityNames = resolvedGlobalFilters.hasActivityFilter
            ? new Set(scopedActivities.map((activity) => activity.name))
            : null;

        if (scopedGoalAnalytics?.metadata?.aggregated) {
            return scopedGoals.map((goal) => ({ ...goal, completed: Boolean(goal.completed && isDateInRange(goal.completed_at)) }));
        }
        return scopedGoals.map((goal) => {
            const activityDurations = (goal.activity_durations_by_date || []).filter((item) => (
                isDateInRange(item.date)
                && (!allowedActivityNames || allowedActivityNames.has(item.activity_name))
            ));
            const sessionDurations = allowedActivityNames
                ? Object.values(activityDurations.reduce((byDate, item) => {
                    const key = item.date || 'Unknown';
                    byDate[key] = byDate[key] || { date: item.date, duration_seconds: 0, session_name: 'Filtered activities' };
                    byDate[key].duration_seconds += item.duration_seconds || 0;
                    return byDate;
                }, {}))
                : (goal.session_durations_by_date || []).filter((item) => isDateInRange(item.date));
            const activityBreakdownByName = new Map();

            activityDurations.forEach((item) => {
                const name = item.activity_name || 'Unknown';
                const current = activityBreakdownByName.get(name) || {
                    activity_id: name,
                    activity_name: name,
                    instance_count: 0,
                    total_duration_seconds: 0,
                };
                current.instance_count += 1;
                current.total_duration_seconds += item.duration_seconds || 0;
                activityBreakdownByName.set(name, current);
            });

            return {
                ...goal,
                completed: Boolean(goal.completed && isDateInRange(goal.completed_at)),
                session_durations_by_date: sessionDurations,
                activity_durations_by_date: activityDurations,
                activity_breakdown: hasActiveDateRange || allowedActivityNames
                    ? Array.from(activityBreakdownByName.values())
                    : goal.activity_breakdown,
                total_duration_seconds: sessionDurations.reduce((sum, item) => sum + (item.duration_seconds || 0), 0),
                session_count: sessionDurations.length,
            };
        });
    }, [scopedGoalAnalytics, hasActiveDateRange, isDateInRange, resolvedGlobalFilters.goalIds, resolvedGlobalFilters.hasActivityFilter, resolvedGlobalFilters.hasGoalFilter, scopedActivities]);

    const filteredGoalSummary = useMemo(() => summarizeFilteredGoals(filteredGoalAnalyticsGoals, goalAnalytics?.summary?.avg_goal_age_days),
        [filteredGoalAnalyticsGoals, goalAnalytics?.summary?.avg_goal_age_days]);

    const effectiveSelectedGoal = useMemo(() => {
        if (selectedGoal?.id && filteredGoalAnalyticsGoals.some((goal) => goal.id === selectedGoal.id)) {
            return filteredGoalAnalyticsGoals.find((goal) => goal.id === selectedGoal.id);
        }
        if (resolvedGlobalFilters.filters.goals.goalIds.length === 1) {
            const goalId = resolvedGlobalFilters.filters.goals.goalIds[0];
            return filteredGoalAnalyticsGoals.find((goal) => goal.id === goalId) || null;
        }
        if (
            selectedVisualizationMeta?.selectionRequirements?.goal
            && (resolvedGlobalFilters.hasGoalFilter || resolvedGlobalFilters.hasActivityFilter)
            && filteredGoalAnalyticsGoals.length === 1
        ) {
            return filteredGoalAnalyticsGoals[0];
        }
        return null;
    }, [
        filteredGoalAnalyticsGoals,
        resolvedGlobalFilters.filters.goals.goalIds,
        resolvedGlobalFilters.hasActivityFilter,
        resolvedGlobalFilters.hasGoalFilter,
        selectedGoal,
        selectedVisualizationMeta,
    ]);

    return {
        effectiveDateRange,
        hasActiveDateRange,
        resolvedGlobalFilters,
        scopedActivities,
        selectedVisualizationMeta,
        effectiveSelectedActivity,
        scopedGoalQuery,
        filteredSessions,
        filteredActivityInstances,
        filteredGoalAnalyticsGoals,
        filteredGoalSummary,
        effectiveSelectedGoal,
    };
}
