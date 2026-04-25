import { useQueries } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

export function useAnalyticsPageData(rootId) {
    const [analyticsSummaryQuery, goalAnalyticsQuery, activitiesQuery, activityGroupsQuery] = useQueries({
        queries: [
            {
                queryKey: queryKeys.analyticsSummary(rootId),
                queryFn: async () => {
                    const response = await fractalApi.getSessionAnalyticsSummary(rootId, { limit: 50 });
                    return response.data || { sessions: [], activity_instances: {} };
                },
                enabled: Boolean(rootId),
            },
            {
                queryKey: queryKeys.goalAnalytics(rootId),
                queryFn: async () => {
                    const response = await fractalApi.getGoalAnalytics(rootId);
                    return response.data || null;
                },
                enabled: Boolean(rootId),
            },
            {
                queryKey: queryKeys.activities(rootId),
                queryFn: async () => {
                    const response = await fractalApi.getActivities(rootId);
                    return response.data || [];
                },
                enabled: Boolean(rootId),
            },
            {
                queryKey: queryKeys.activityGroups(rootId),
                queryFn: async () => {
                    const response = await fractalApi.getActivityGroups(rootId);
                    return response.data || [];
                },
                enabled: Boolean(rootId),
            },
        ],
    });

    return {
        sessions: analyticsSummaryQuery.data?.sessions || [],
        goalAnalytics: goalAnalyticsQuery.data || null,
        activities: activitiesQuery.data || [],
        activityGroups: activityGroupsQuery.data || [],
        activityInstances: analyticsSummaryQuery.data?.activity_instances || {},
        loading: analyticsSummaryQuery.isLoading || goalAnalyticsQuery.isLoading || activitiesQuery.isLoading || activityGroupsQuery.isLoading,
        error: analyticsSummaryQuery.error || goalAnalyticsQuery.error || activitiesQuery.error || activityGroupsQuery.error || null,
    };
}
