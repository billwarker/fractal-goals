import { useQuery } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { distinctQuickSessions } from '../utils/quickSessionSummary';
import { queryKeys } from './queryKeys';

export const RECENT_QUICK_SESSION_LIMIT = 5;
// Enough recent sessions to find a few distinct activity selections among repeats.
const RECENT_QUICK_SESSION_WINDOW = 30;

const selectDistinct = (sessions) => distinctQuickSessions(sessions, RECENT_QUICK_SESSION_LIMIT);

/**
 * The user's recent quick sessions, one per distinct selection of activities (the latest of
 * each), newest first, with their activities and recorded values.
 */
export function useRecentQuickSessions(rootId, { enabled = true } = {}) {
    return useQuery({
        queryKey: queryKeys.recentQuickSessions(rootId),
        queryFn: async () => {
            const res = await fractalApi.getSessions(rootId, {
                session_type: 'quick',
                limit: RECENT_QUICK_SESSION_WINDOW,
                sort_by: 'session_start',
                sort_order: 'desc',
            });
            return res.data.sessions || [];
        },
        select: selectDistinct,
        enabled: Boolean(rootId) && enabled,
        staleTime: 60 * 1000,
    });
}

/**
 * Shows a completion still waiting for signal at the top of the list, so the user sees it
 * was kept. The next fetch replaces it with the server's copy.
 */
export function addPendingQuickSession(queryClient, rootId, session) {
    queryClient.setQueryData(queryKeys.recentQuickSessions(rootId), (previous) => {
        if (!Array.isArray(previous)) return previous;
        return [session, ...previous.filter((entry) => entry.id !== session.id)].slice(0, RECENT_QUICK_SESSION_WINDOW);
    });
}

export default useRecentQuickSessions;
