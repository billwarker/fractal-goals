import { useInfiniteQuery } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

export function useGoalTimelinePages(rootId, goalId, { includeChildren, timezone, metric, date, calendarDate, enabled = true }) {
    return useInfiniteQuery({
        queryKey: queryKeys.goalTimelinePages(rootId, goalId, includeChildren, timezone, metric, date, calendarDate),
        enabled: Boolean(rootId && goalId && enabled),
        initialPageParam: null,
        queryFn: async ({ pageParam }) => {
            const response = await fractalApi.getGoalActivityHeatmap(rootId, goalId, {
                includeChildren, timezone, metric, date, view: 'entries', cursor: pageParam, limit: 20,
            });
            return response.data;
        },
        getNextPageParam: (page) => page.pagination.next_cursor || undefined,
        staleTime: 60_000,
        retry: false,
    });
}
