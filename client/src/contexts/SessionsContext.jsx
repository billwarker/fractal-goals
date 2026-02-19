import React, { createContext, useContext, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';

const SessionsContext = createContext();

export function SessionsProvider({ children }) {
    const queryClient = useQueryClient();

    const fetchAllSessions = useCallback(async (rootId, pageSize = 100) => {
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
    }, []);

    // 1. Queries
    const useSessionsQuery = (rootId) => useQuery({
        queryKey: ['sessions', rootId],
        queryFn: async () => {
            if (!rootId) return [];
            const res = await fractalApi.getSessions(rootId, { limit: 50 });
            return res.data.sessions || res.data;
        },
        enabled: !!rootId
    });

    const useAllSessionsQuery = (rootId) => useQuery({
        queryKey: ['sessions', rootId, 'all'],
        queryFn: () => fetchAllSessions(rootId),
        enabled: !!rootId,
        staleTime: 60_000
    });

    const useSessionDetailQuery = (rootId, sessionId) => useQuery({
        queryKey: ['session', rootId, sessionId],
        queryFn: async () => {
            if (!rootId || !sessionId) return null;
            const res = await fractalApi.getSession(rootId, sessionId);
            return res.data;
        },
        enabled: !!rootId && !!sessionId
    });

    // 2. Mutations
    const createSessionMutation = useMutation({
        mutationFn: ({ rootId, sessionData }) => fractalApi.createSession(rootId, sessionData),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['sessions', variables.rootId] });
        }
    });

    const updateSessionMutation = useMutation({
        mutationFn: ({ rootId, sessionId, updates }) => fractalApi.updateSession(rootId, sessionId, updates),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['sessions', variables.rootId] });
            queryClient.invalidateQueries({ queryKey: ['session', variables.rootId, variables.sessionId] });
        }
    });

    const deleteSessionMutation = useMutation({
        mutationFn: ({ rootId, sessionId }) => fractalApi.deleteSession(rootId, sessionId),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['sessions', variables.rootId] });
        }
    });

    // 3. Glue/Backwards Compatibility
    // Because some components use 'sessions' from state, we'll keep a reference 
    // but encourage use of useSessionsQuery hooks.
    const fetchSessions = useCallback((rootId) => {
        queryClient.invalidateQueries({ queryKey: ['sessions', rootId] });
    }, [queryClient]);

    const value = {
        sessions: [], // Components should transition to useSessionsQuery(rootId).data
        currentSession: null,
        setCurrentSession: () => { }, // No-op, managed by Query
        loading: false,
        error: null,
        fetchSessions,
        createSession: (rootId, sessionData) => createSessionMutation.mutateAsync({ rootId, sessionData }),
        updateSession: (rootId, sessionId, updates) => updateSessionMutation.mutateAsync({ rootId, sessionId, updates }),
        deleteSession: (rootId, sessionId) => deleteSessionMutation.mutateAsync({ rootId, sessionId }),
        getSessionById: (_rootId, _sessionId) => {
            // This is a bridge, might not work exactly as before
            return null;
        },
        // New Query-specific hooks
        useSessionsQuery,
        useAllSessionsQuery,
        useSessionDetailQuery
    };

    return (
        <SessionsContext.Provider value={value}>
            {children}
        </SessionsContext.Provider>
    );
}

// Custom hook
export function useSessions() {
    const context = useContext(SessionsContext);
    if (!context) {
        throw new Error('useSessions must be used within a SessionsProvider');
    }
    return context;
}

export default SessionsContext;
