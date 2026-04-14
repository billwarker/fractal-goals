import { useQuery } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

/**
 * Fetches the progress comparison for an activity instance (live or persisted).
 * @param {string} rootId - the fractal root ID
 * @param {string} instanceId - the activity instance ID
 * @param {object} options
 * @param {boolean} [options.enabled=true] - whether to run the query
 */
export function useProgressComparison(rootId, instanceId, { enabled = true } = {}) {
    const isReady = Boolean(rootId && instanceId);

    const { data: progressComparison = null, isLoading, error } = useQuery({
        queryKey: queryKeys.progressComparison(instanceId),
        queryFn: async () => {
            const res = await fractalApi.getActivityInstanceProgress(rootId, instanceId);
            return res.data || null;
        },
        enabled: isReady && enabled,
        staleTime: 30 * 1000,
    });

    return { progressComparison, isLoading, error };
}

export default useProgressComparison;
