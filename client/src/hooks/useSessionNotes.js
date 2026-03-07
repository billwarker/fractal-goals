/**
 * useSessionNotes - Hook for managing session notes
 * 
 * Provides CRUD operations for notes attached to a session or its activities.
 * Fetches both current session notes and previous notes for activity definitions.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

/**
 * @param {string} rootId - ID of the fractal
 * @param {string} sessionId - ID of the current session
 * @param {string|null} activityDefinitionId - Optional activity definition ID for fetching previous notes
 */
export function useSessionNotes(rootId, sessionId, activityDefinitionId = null) {
    const queryClient = useQueryClient();
    const sessionNotesKey = queryKeys.sessionNotes(rootId, sessionId);

    // Query for current session notes
    const {
        data: notes = [],
        isLoading: notesLoading,
        error: notesError,
        refetch: refreshNotes
    } = useQuery({
        queryKey: sessionNotesKey,
        queryFn: async () => {
            const res = await fractalApi.getSessionNotes(rootId, sessionId);
            return res.data || [];
        },
        enabled: !!rootId && !!sessionId,
        staleTime: 30000, // 30 seconds
    });

    // Query for previous session notes
    const {
        data: previousSessionNotes = [],
        isLoading: prevSessionLoading
    } = useQuery({
        queryKey: queryKeys.previousSessionNotes(rootId, sessionId),
        queryFn: async () => {
            const res = await fractalApi.getPreviousSessionNotes(rootId, sessionId);
            return res.data || [];
        },
        enabled: !!rootId && !!sessionId,
        staleTime: 60000, // 1 minute
    });

    // Query for previous notes for the selected activity definition
    const {
        data: previousNotes = [],
    } = useQuery({
        queryKey: queryKeys.activityDefinitionNotes(rootId, activityDefinitionId),
        queryFn: async () => {
            const res = await fractalApi.getActivityDefinitionNotes(
                rootId,
                activityDefinitionId,
                { limit: 10, excludeSession: sessionId }
            );
            return res.data || [];
        },
        enabled: !!rootId && !!activityDefinitionId,
        staleTime: 60000,
    });

    const addNoteMutation = useMutation({
        mutationFn: (noteData) => fractalApi.createNote(rootId, noteData),
        onSuccess: (response) => {
            const newNote = response.data;
            // Optimistically update current session notes if applicable
            if (newNote.session_id === sessionId) {
                queryClient.setQueryData(sessionNotesKey, (old = []) => [newNote, ...old]);
            }
            // Also invalidate to be sure
            queryClient.invalidateQueries({ queryKey: sessionNotesKey });
        }
    });

    const updateNoteMutation = useMutation({
        mutationFn: ({ noteId, content }) => fractalApi.updateNote(rootId, noteId, { content }),
        onSuccess: (response) => {
            const updatedNote = response.data;
            queryClient.setQueryData(sessionNotesKey, (old = []) =>
                old.map(n => n.id === updatedNote.id ? updatedNote : n)
            );
            queryClient.invalidateQueries({ queryKey: sessionNotesKey });
        }
    });

    const deleteNoteMutation = useMutation({
        mutationFn: (noteId) => fractalApi.deleteNote(rootId, noteId),
        onSuccess: (_, noteId) => {
            queryClient.setQueryData(sessionNotesKey, (old = []) =>
                old.filter(n => n.id !== noteId)
            );
            queryClient.invalidateQueries({ queryKey: sessionNotesKey });
        }
    });

    return {
        notes,
        previousNotes,
        previousSessionNotes,
        loading: notesLoading || prevSessionLoading,
        error: notesError,
        addNote: (data) => addNoteMutation.mutateAsync(data),
        updateNote: (id, content) => updateNoteMutation.mutateAsync({ noteId: id, content }),
        deleteNote: (id) => deleteNoteMutation.mutateAsync(id),
        refreshNotes
    };
}

export default useSessionNotes;
