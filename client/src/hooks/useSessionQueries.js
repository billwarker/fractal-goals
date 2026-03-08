import { useQuery } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

async function fetchAllSessions(rootId, pageSize = 100) {
    if (!rootId) return [];

    let offset = 0;
    const all = [];

    while (true) {
        const res = await fractalApi.getSessions(rootId, { limit: pageSize, offset });
        const pageSessions = res.data?.sessions || [];
        all.push(...pageSessions);

        if (!res.data?.pagination?.has_more) break;

        offset = (res.data.pagination.offset || 0) + (res.data.pagination.limit || pageSize);
    }

    return all;
}

export function useSessions(rootId) {
    const isReady = Boolean(rootId);

    return useQuery({
        queryKey: queryKeys.sessions(rootId),
        queryFn: async () => {
            const res = await fractalApi.getSessions(rootId, { limit: 50 });
            return res.data.sessions || res.data;
        },
        enabled: isReady,
        staleTime: 60 * 1000,
    });
}

export function useAllSessions(rootId) {
    const isReady = Boolean(rootId);

    return useQuery({
        queryKey: queryKeys.sessionsAll(rootId),
        queryFn: () => fetchAllSessions(rootId),
        enabled: isReady,
        staleTime: 60 * 1000,
    });
}

export function useSessionDetail(rootId, sessionId) {
    const isReady = Boolean(rootId && sessionId);

    return useQuery({
        queryKey: queryKeys.session(rootId, sessionId),
        queryFn: async () => {
            const res = await fractalApi.getSession(rootId, sessionId);
            return res.data;
        },
        enabled: isReady,
    });
}

export function useSessionNotes(rootId, sessionId) {
    const isReady = Boolean(rootId && sessionId);

    const { data: notes = [], isLoading, error } = useQuery({
        queryKey: queryKeys.sessionNotes(rootId, sessionId),
        queryFn: async () => {
            const res = await fractalApi.getSessionNotes(rootId, sessionId);
            return res.data || [];
        },
        enabled: isReady,
        staleTime: 2 * 60 * 1000,
    });

    return { notes, isLoading, error };
}
