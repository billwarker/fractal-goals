/**
 * useSessionNotes - Hook for managing session notes
 * 
 * Provides CRUD operations for notes attached to a session or its activities.
 * Fetches both current session notes and previous notes for activity definitions.
 */

import { useState, useEffect, useCallback } from 'react';
import { fractalApi } from '../utils/api';

/**
 * @param {string} rootId - ID of the fractal
 * @param {string} sessionId - ID of the current session
 * @param {string|null} activityDefinitionId - Optional activity definition ID for fetching previous notes
 */
export function useSessionNotes(rootId, sessionId, activityDefinitionId = null) {
    const [notes, setNotes] = useState([]);
    const [previousNotes, setPreviousNotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Fetch all notes for the session
    useEffect(() => {
        if (!rootId || !sessionId) {
            setLoading(false);
            return;
        }

        const fetchNotes = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await fractalApi.getSessionNotes(rootId, sessionId);
                setNotes(response.data || []);
            } catch (err) {
                console.error('Failed to fetch session notes:', err);
                setError(err.message || 'Failed to fetch notes');
            } finally {
                setLoading(false);
            }
        };

        fetchNotes();
    }, [rootId, sessionId]);

    // Fetch previous notes for the selected activity definition
    useEffect(() => {
        if (!rootId || !activityDefinitionId) {
            setPreviousNotes([]);
            return;
        }

        const fetchPreviousNotes = async () => {
            try {
                const response = await fractalApi.getActivityDefinitionNotes(
                    rootId,
                    activityDefinitionId,
                    { limit: 10, excludeSession: sessionId }
                );
                setPreviousNotes(response.data || []);
            } catch (err) {
                console.error('Failed to fetch previous notes:', err);
                // Don't set error for previous notes - it's supplementary
            }
        };

        fetchPreviousNotes();
    }, [rootId, activityDefinitionId, sessionId]);

    /**
     * Add a new note
     * @param {Object} noteData - {context_type, context_id, session_id, activity_instance_id, activity_definition_id, set_index, content}
     */
    const addNote = useCallback(async (noteData) => {
        if (!rootId) {
            throw new Error('Root ID is required');
        }

        try {
            const response = await fractalApi.createNote(rootId, noteData);
            const newNote = response.data;

            // Optimistically update local state
            setNotes(prev => [newNote, ...prev]);

            return newNote;
        } catch (err) {
            console.error('Failed to add note:', err);
            throw err;
        }
    }, [rootId]);

    /**
     * Update a note's content
     * @param {string} noteId - ID of the note to update
     * @param {string} content - New content
     */
    const updateNote = useCallback(async (noteId, content) => {
        if (!rootId) {
            throw new Error('Root ID is required');
        }

        try {
            const response = await fractalApi.updateNote(rootId, noteId, { content });
            const updatedNote = response.data;

            // Update local state
            setNotes(prev =>
                prev.map(n => n.id === noteId ? updatedNote : n)
            );

            return updatedNote;
        } catch (err) {
            console.error('Failed to update note:', err);
            throw err;
        }
    }, [rootId]);

    /**
     * Delete a note
     * @param {string} noteId - ID of the note to delete
     */
    const deleteNote = useCallback(async (noteId) => {
        if (!rootId) {
            throw new Error('Root ID is required');
        }

        try {
            await fractalApi.deleteNote(rootId, noteId);

            // Remove from local state
            setNotes(prev => prev.filter(n => n.id !== noteId));
        } catch (err) {
            console.error('Failed to delete note:', err);
            throw err;
        }
    }, [rootId]);

    /**
     * Refresh notes from the server
     */
    const refreshNotes = useCallback(async () => {
        if (!rootId || !sessionId) return;

        try {
            const response = await fractalApi.getSessionNotes(rootId, sessionId);
            setNotes(response.data || []);
        } catch (err) {
            console.error('Failed to refresh notes:', err);
        }
    }, [rootId, sessionId]);

    return {
        notes,
        previousNotes,
        loading,
        error,
        addNote,
        updateNote,
        deleteNote,
        refreshNotes
    };
}

export default useSessionNotes;
