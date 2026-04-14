import { useQuery } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

/**
 * Fetches paginated ProgressRecord history for an activity definition.
 * @param {string} rootId - the fractal root ID
 * @param {string} activityDefId - the activity definition ID
 * @param {object} options
 * @param {number} [options.limit=20]
 * @param {number} [options.offset=0]
 * @param {string|null} [options.excludeSessionId=null]
 */
export function useProgressHistory(rootId, activityDefId, { limit = 20, offset = 0, excludeSessionId = null } = {}) {
    const isReady = Boolean(rootId && activityDefId);

    const { data: progressHistory = null, isLoading, error } = useQuery({
        queryKey: [...queryKeys.progressHistory(activityDefId, excludeSessionId), limit, offset],
        queryFn: async () => {
            const res = await fractalApi.getActivityProgressHistory(rootId, activityDefId, {
                limit,
                offset,
                exclude_session: excludeSessionId,
            });
            return res.data || null;
        },
        enabled: isReady,
        staleTime: 60 * 1000,
    });

    return { progressHistory, isLoading, error };
}

export default useProgressHistory;
