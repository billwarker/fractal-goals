import { useMemo } from 'react';
import { useQueries, useInfiniteQuery } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

export function useAnalyticsPageData(rootId, { needsSessionEvidence = true } = {}) {
    const analyticsSummaryQuery = useInfiniteQuery({
        queryKey: [...queryKeys.analyticsSummary(rootId), 'paged'],
        initialPageParam: 0,
        queryFn: async ({ pageParam }) => {
            const response = await fractalApi.getSessionAnalyticsSummary(rootId, { limit: 50, instance_offset: pageParam, instance_limit: 500 });
            return response.data || { sessions: [], activity_instances: {} };
        },
        getNextPageParam: (page) => page.evidence_pagination?.next_offset ?? undefined,
        enabled: Boolean(rootId) && needsSessionEvidence,
    });
    const [goalAnalyticsQuery, activitiesQuery, activityGroupsQuery] = useQueries({
        queries: [
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

    const pages = analyticsSummaryQuery.data?.pages;
    const instances = useMemo(() => {
        const result = {};
        (pages || []).forEach((page) => Object.entries(page.activity_instances || {}).forEach(([id, rows]) => {
            result[id] = [...(result[id] || []), ...rows];
        }));
        return result;
    }, [pages]);
    return {
        sessions: pages?.[0]?.sessions || [],
        evidenceLoading: analyticsSummaryQuery.isLoading,
        evidenceError: analyticsSummaryQuery.error,
        retryEvidence: analyticsSummaryQuery.refetch,
        hasMoreEvidence: analyticsSummaryQuery.hasNextPage,
        loadingMoreEvidence: analyticsSummaryQuery.isFetchingNextPage,
        loadMoreEvidence: analyticsSummaryQuery.fetchNextPage,
        goalAnalytics: goalAnalyticsQuery.data || null,
        activities: activitiesQuery.data || [],
        activityGroups: activityGroupsQuery.data || [],
        activityInstances: instances,
        loading: analyticsSummaryQuery.isLoading || goalAnalyticsQuery.isLoading || activitiesQuery.isLoading || activityGroupsQuery.isLoading,
        error: analyticsSummaryQuery.error || goalAnalyticsQuery.error || activitiesQuery.error || activityGroupsQuery.error || null,
    };
}
