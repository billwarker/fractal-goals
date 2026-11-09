/**
 * useSessionNotes - Hook for managing session notes
 * 
 * Provides CRUD and pin operations for notes attached to a session or its activities, plus the
 * notes pinned to the next instance of this session's activities (`carriedNotes`).
 */

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutbox } from '../offline/OutboxContext';
import { SESSION_OP } from '../offline/opKinds';
import { fractalApi } from '../utils/api';
import { fractalNotesApi } from '../utils/api/fractalNotesApi';
import { formatError } from '../utils/mutationNotify';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';

// Quick bars pass attachments in the serialized shape (for optimistic notes); the API takes ids and descriptions.
const EMPTY_CARRIED = { pending: [], delivered: [] };

const noteRequest = ({ attachments = [], ...data }) => (
    attachments.length
        ? { ...data, attachments: attachments.map((item) => ({ asset_id: item.asset_id || item.id, alt_text: item.alt_text || '' })) }
        : data
);

/**
 * @param {string} rootId - ID of the fractal
 * @param {string} sessionId - ID of the current session
 */
export function useSessionNotes(rootId, sessionId) {
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
                    { method: 'post', url: `/${rootId}/notes`, body: { ...noteRequest(data), id } },
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
            // `patch` is the cached note's change; the body is what the server takes.
            updatePins: async (noteId, body, patch) => {
                await enqueue(
                    SESSION_OP.NOTE_UPDATE,
                    { method: 'put', url: `/${rootId}/notes/${noteId}`, body },
                    { noteId, patch },
                    { entityIds: [noteId], coalesceKey: `note:${noteId}:${Object.keys(body)[0]}` },
                );
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

    // Notes pinned to the next instance of this session's activities, and those it already used.
    const { data: carriedNotes = EMPTY_CARRIED } = useQuery({
        queryKey: queryKeys.sessionCarriedNotes(rootId, sessionId),
        queryFn: async () => (await fractalNotesApi.getCarriedNotes(rootId, sessionId)).data || EMPTY_CARRIED,
        enabled: !!rootId && !!sessionId,
        staleTime: 60000,
    });

    const addNoteMutation = useMutation({
        mutationFn: (noteData) => fractalApi.createNote(rootId, noteRequest(noteData)),
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

    const pinsMutation = useMutation({
        mutationFn: ({ noteId, body }) => fractalApi.updateNote(rootId, noteId, body),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionNotesKey }),
        onError: (error) => {
            notify.error(`Failed to update the pin: ${formatError(error)}`);
        },
    });
    const updatePins = (noteId, body, patch) => {
        // A carried note belongs to an earlier session: dismissing it only changes this session's strip.
        queryClient.setQueryData(queryKeys.sessionCarriedNotes(rootId, sessionId), (old) => (old && patch.carry_forward === null
            ? { ...old, pending: old.pending.filter((note) => note.id !== noteId) }
            : old));
        return offlineNotes
            ? offlineNotes.updatePins(noteId, body, patch)
            : pinsMutation.mutateAsync({ noteId, body });
    };

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
        carriedNotes,
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
        // NoteCard hands over the whole note, as it does for the Notes page and goal notes.
        deleteNote: (note) => (offlineNotes ? offlineNotes.deleteNote(note.id) : deleteNoteMutation.mutateAsync(note.id)),
        setCarryForward: (noteId, on) => updatePins(
            noteId, { carry_forward: on }, { carry_forward: on ? 'pending' : null },
        ),
        refreshNotes
    };
}

export default useSessionNotes;
