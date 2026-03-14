import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
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

function normalizeSessionSearchFilters(filters = {}) {
    const normalized = {
        completed: filters.completed || 'all',
        sort_by: filters.sort_by || 'session_start',
        sort_order: filters.sort_order || 'desc',
        timezone: filters.timezone || 'UTC',
    };

    if (filters.range_start) {
        normalized.range_start = filters.range_start;
    }
    if (filters.range_end) {
        normalized.range_end = filters.range_end;
    }

    if (filters.duration_operator && filters.duration_minutes !== undefined) {
        normalized.duration_operator = filters.duration_operator;
        normalized.duration_minutes = filters.duration_minutes;
    }

    if (filters.heatmap_metric) {
        normalized.heatmap_metric = filters.heatmap_metric;
    }

    if (Array.isArray(filters.activity_ids) && filters.activity_ids.length > 0) {
        normalized.activity_ids = [...filters.activity_ids].filter(Boolean).sort();
    }

    if (Array.isArray(filters.goal_ids) && filters.goal_ids.length > 0) {
        normalized.goal_ids = [...filters.goal_ids].filter(Boolean).sort();
    }

    return normalized;
}

export function useSessionsSearch(rootId, filters = {}, pageSize = 10) {
    const isReady = Boolean(rootId);
    const normalizedFilters = normalizeSessionSearchFilters(filters);

    return useInfiniteQuery({
        queryKey: queryKeys.sessionsSearch(rootId, normalizedFilters),
        queryFn: async ({ pageParam = 0 }) => {
            const res = await fractalApi.getSessions(rootId, {
                ...normalizedFilters,
                limit: pageSize,
                offset: pageParam,
            });
            return res.data;
        },
        initialPageParam: 0,
        getNextPageParam: (lastPage) => {
            if (!lastPage?.pagination?.has_more) return undefined;
            return (lastPage.pagination.offset || 0) + (lastPage.pagination.limit || pageSize);
        },
        placeholderData: (previousData) => previousData,
        enabled: isReady,
        staleTime: 60 * 1000,
    });
}

export function useSessionsHeatmap(rootId, filters = {}) {
    const isReady = Boolean(rootId);
    const normalizedFilters = normalizeSessionSearchFilters(filters);

    return useQuery({
        queryKey: queryKeys.sessionsHeatmap(rootId, normalizedFilters),
        queryFn: async () => {
            const res = await fractalApi.getSessionsHeatmap(rootId, normalizedFilters);
            return res.data;
        },
        placeholderData: (previousData) => previousData,
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
