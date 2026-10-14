/**
 * useSessionNotes - Hook for managing session notes
 * 
 * Provides CRUD operations for notes attached to a session or its activities.
 * Fetches both current session notes and previous notes for activity definitions.
 */

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutbox } from '../offline/OutboxContext';
import { SESSION_OP } from '../offline/opKinds';
import { fractalApi } from '../utils/api';
import { formatError } from '../utils/mutationNotify';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';

/**
 * @param {string} rootId - ID of the fractal
 * @param {string} sessionId - ID of the current session
 * @param {string|null} activityDefinitionId - Optional activity definition ID for fetching previous notes
 */
export function useSessionNotes(rootId, sessionId, activityDefinitionId = null) {
    const queryClient = useQueryClient();
    const outbox = useOutbox();
    const sessionNotesKey = queryKeys.sessionNotes(rootId, sessionId);

    // Session notes are written device-first when offline sync is on.
    const offlineNotes = useMemo(() => {
        if (!outbox || !rootId || !sessionId) return null;
        const enqueue = (kind, request, meta, options = {}) => {
            const op = {
                scope: sessionId,
                kind,
                ...request,
                ...options,
                meta: { rootId, sessionId, ...meta },
            };
            return outbox.submit(op);
        };
        return {
            addNote: async (data) => {
                const id = crypto.randomUUID();
                const { buildPlaceholderNote } = await import('../offline/sessionOps');
                const note = buildPlaceholderNote({
                    id,
                    data: { ...data, session_id: data.session_id || sessionId },
                    session: queryClient.getQueryData(queryKeys.session(rootId, sessionId)) || null,
                });
                await enqueue(
                    SESSION_OP.NOTE_CREATE,
                    { method: 'post', url: `/${rootId}/notes`, body: { ...data, id } },
                    { note },
                    { creates: [id], entityIds: data.activity_instance_id ? [data.activity_instance_id] : [] },
                );
                return { data: note };
            },
            updateNote: async (noteId, content) => {
                await enqueue(
                    SESSION_OP.NOTE_UPDATE,
                    { method: 'put', url: `/${rootId}/notes/${noteId}`, body: { content } },
                    { noteId },
                    { entityIds: [noteId], coalesceKey: `note:${noteId}:content` },
                );
                return { data: { id: noteId, content } };
            },
            deleteNote: async (noteId) => {
                await enqueue(
                    SESSION_OP.NOTE_DELETE,
                    { method: 'delete', url: `/${rootId}/notes/${noteId}` },
                    { noteId },
                    { entityIds: [noteId], supersedes: [noteId] },
                );
            },
        };
    }, [outbox, queryClient, rootId, sessionId]);

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
            // Update the session-notes cache immediately after a confirmed save.
            if (newNote.session_id === sessionId) {
                queryClient.setQueryData(sessionNotesKey, (old = []) => [newNote, ...old]);
            }
            // Also invalidate to be sure
            queryClient.invalidateQueries({ queryKey: sessionNotesKey });
            notify.success('Note added');
        },
        onError: (error) => {
            notify.error(`Failed to add note: ${formatError(error)}`);
        },
    });

    const updateNoteMutation = useMutation({
        mutationFn: ({ noteId, content }) => fractalApi.updateNote(rootId, noteId, { content }),
        onSuccess: (response) => {
            const updatedNote = response.data;
            queryClient.setQueryData(sessionNotesKey, (old = []) =>
                old.map(n => n.id === updatedNote.id ? updatedNote : n)
            );
            queryClient.invalidateQueries({ queryKey: sessionNotesKey });
            notify.success('Note updated');
        },
        onError: (error) => {
            notify.error(`Failed to update note: ${formatError(error)}`);
        },
    });

    const deleteNoteMutation = useMutation({
        mutationFn: (noteId) => fractalApi.deleteNote(rootId, noteId),
        onSuccess: (_, noteId) => {
            queryClient.setQueryData(sessionNotesKey, (old = []) =>
                old.filter(n => n.id !== noteId)
            );
            queryClient.invalidateQueries({ queryKey: sessionNotesKey });
            notify.success('Note deleted');
        },
        onError: (error) => {
            notify.error(`Failed to delete note: ${formatError(error)}`);
        },
    });

    return {
        notes,
        previousNotes,
        previousSessionNotes,
        loading: notesLoading || prevSessionLoading,
        error: notesError,
        addNote: (data) => (
            offlineNotes && (!data.session_id || data.session_id === sessionId)
                ? offlineNotes.addNote(data)
                : addNoteMutation.mutateAsync(data)
        ),
        updateNote: (id, content) => (
            offlineNotes ? offlineNotes.updateNote(id, content) : updateNoteMutation.mutateAsync({ noteId: id, content })
        ),
        deleteNote: (id) => (offlineNotes ? offlineNotes.deleteNote(id) : deleteNoteMutation.mutateAsync(id)),
        refreshNotes
    };
}

export default useSessionNotes;
