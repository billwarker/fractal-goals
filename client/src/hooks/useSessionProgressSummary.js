import { useQuery } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

/**
 * Fetches all ProgressRecords for a session.
 * @param {string} rootId - the fractal root ID
 * @param {string} sessionId - the session ID
 */
export function useSessionProgressSummary(rootId, sessionId) {
    const isReady = Boolean(rootId && sessionId);

    const { data: progressSummary = null, isLoading, error } = useQuery({
        queryKey: queryKeys.sessionProgressSummary(sessionId),
        queryFn: async () => {
            const res = await fractalApi.getSessionProgressSummary(rootId, sessionId);
            return res.data || null;
        },
        enabled: isReady,
        staleTime: 60 * 1000,
    });

    return { progressSummary, isLoading, error };
}

export default useSessionProgressSummary;
