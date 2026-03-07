import { useQuery } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';

export function useSessionNotes(rootId, sessionId) {
    const isReady = Boolean(rootId && sessionId);

    const { data: notes = [], isLoading, error } = useQuery({
        queryKey: ['session-notes', rootId, sessionId],
        queryFn: async () => {
            const res = await fractalApi.getSessionNotes(rootId, sessionId);
            return res.data || [];
        },
        enabled: isReady,
        staleTime: 2 * 60 * 1000,
    });

    return { notes, isLoading, error };
}
