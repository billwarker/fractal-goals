import React, { createContext, useContext, useState, useCallback } from 'react';
import { fractalApi } from '../utils/api';

const SessionsContext = createContext();

export function SessionsProvider({ children }) {
    const [sessions, setSessions] = useState([]);
    const [currentSession, setCurrentSession] = useState(null); // For detail view or active session
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Fetch all sessions for a fractal
    const fetchSessions = useCallback(async (rootId) => {
        if (!rootId) return;

        try {
            setLoading(true);
            setError(null);
            const res = await fractalApi.getSessions(rootId);
            setSessions(res.data);
        } catch (err) {
            console.error('Failed to fetch sessions:', err);
            setError('Failed to load sessions');
        } finally {
            setLoading(false);
        }
    }, []);

    // Create a new session
    const createSession = useCallback(async (rootId, sessionData) => {
        try {
            setError(null);
            const res = await fractalApi.createSession(rootId, sessionData);
            // Refresh list
            await fetchSessions(rootId);
            return res.data;
        } catch (err) {
            console.error('Failed to create session:', err);
            setError('Failed to create session');
            throw err;
        }
    }, [fetchSessions]);

    // Update an existing session
    const updateSession = useCallback(async (rootId, sessionId, updates) => {
        try {
            setError(null);
            const res = await fractalApi.updateSession(rootId, sessionId, updates);
            // Refresh list
            await fetchSessions(rootId);
            return res.data;
        } catch (err) {
            console.error('Failed to update session:', err);
            setError('Failed to update session');
            throw err;
        }
    }, [fetchSessions]);

    // Delete a session
    const deleteSession = useCallback(async (rootId, sessionId) => {
        try {
            setError(null);
            await fractalApi.deleteSession(rootId, sessionId);
            // Refresh list
            await fetchSessions(rootId);
        } catch (err) {
            console.error('Failed to delete session:', err);
            setError('Failed to delete session');
            throw err;
        }
    }, [fetchSessions]);

    // Get a specific session by ID (from local state if available, or fetch?)
    // For now, simple lookup
    const getSessionById = useCallback((sessionId) => {
        return sessions.find(s => s.id === sessionId);
    }, [sessions]);

    const value = {
        sessions,
        currentSession,
        setCurrentSession, // Allow manual setting of active session
        loading,
        error,
        fetchSessions,
        createSession,
        updateSession,
        deleteSession,
        getSessionById
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
