import { useQuery } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

export const DEFAULT_GOAL_TIMELINE_TYPES = [
    'activity',
    'target',
    'child_goal',
];

export function useGoalTimeline(rootId, goalId, options = {}) {
    const {
        types = DEFAULT_GOAL_TIMELINE_TYPES,
        includeChildren = true,
        limit = 50,
    } = options;
    const enabled = Boolean(rootId && goalId);

    const query = useQuery({
        queryKey: queryKeys.goalTimeline(rootId, goalId, types, includeChildren, limit),
        enabled,
        retry: false,
        queryFn: async () => {
            const response = await fractalApi.getGoalTimeline(rootId, goalId, { types, includeChildren, limit });
            return response.data || { entries: [], available_types: [] };
        },
    });

    return {
        entries: enabled ? (query.data?.entries || []) : [],
        availableTypes: enabled ? (query.data?.available_types || []) : [],
        pagination: query.data?.pagination || null,
        isLoading: enabled ? query.isLoading : false,
        error: query.error,
        refetch: query.refetch,
    };
}

export default useGoalTimeline;
