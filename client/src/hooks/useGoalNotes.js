/**
 * useGoalNotes — hook for notes directly attached to a goal.
 * Provides CRUD + next-time pin mutations, invalidating both goalNotes and allNotes caches.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fractalNotesApi } from '../utils/api/fractalNotesApi';
import notify from '../utils/notify';
import { useOutbox } from '../offline/OutboxContext';
import { loadRecordOps, shouldQueueRecord } from '../offline/recordQueue';
import { queryKeys } from './queryKeys';

export function useGoalNotes(
    rootId,
    goalId,
    {
        includeDescendants = false,
        includeGoalNotes = true,
        includeActivityInstanceNotes = true,
    } = {}
) {
    const queryClient = useQueryClient();
    const outbox = useOutbox();
    const filters = {
        includeDescendants,
        includeGoalNotes,
        includeActivityInstanceNotes,
    };
    const noteKey = queryKeys.goalNotes(rootId, goalId, filters);

    const { data: notes = [], isLoading, error } = useQuery({
        queryKey: noteKey,
        queryFn: async () => {
            const res = await fractalNotesApi.getGoalNotes(rootId, goalId, filters);
            return res.data || [];
        },
        enabled: !!rootId && !!goalId,
        staleTime: 30000,
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: noteKey });
        queryClient.invalidateQueries({ queryKey: queryKeys.allNotesRoot(rootId) });
    };

    const createNoteMutation = useMutation({
        mutationFn: (data) => fractalNotesApi.createNote(rootId, data),
        onSuccess: () => { invalidate(); },
        onError: () => notify.error('Failed to create note'),
    });

    const updateNoteMutation = useMutation({
        mutationFn: ({ noteId, content, base }) => fractalNotesApi.updateNote(rootId, noteId, {
            content, ...(base === undefined ? {} : { _base: { content: base } }),
        }),
        onSuccess: () => { invalidate(); },
        onError: () => notify.error('Failed to update note'),
    });

    const deleteNoteMutation = useMutation({
        mutationFn: (note) => fractalNotesApi.deleteNote(rootId, note.id),
        onSuccess: () => { invalidate(); },
        onError: () => notify.error('Failed to delete note'),
    });

    const deleteGoalCompletionNotesMutation = useMutation({
        mutationFn: async () => {
            const res = await fractalNotesApi.getGoalNotes(rootId, goalId, { includeDescendants: false });
            const completionNotes = (res.data || []).filter((note) => note.note_kind === 'goal_completion');
            await Promise.all(completionNotes.map((note) => fractalNotesApi.deleteNote(rootId, note.id)));
        },
        onSuccess: () => { invalidate(); },
        onError: () => notify.error('Failed to remove completion note'),
    });

    const carryForwardMutation = useMutation({
        mutationFn: ({ noteId, on }) => fractalNotesApi.setCarryForward(rootId, noteId, on),
        onSuccess: () => { invalidate(); },
        onError: () => notify.error('Failed to change the pin'),
    });

    const queued = () => shouldQueueRecord(outbox, rootId);

    return {
        notes,
        isLoading,
        error,
        createNote: (data) => (queued()
            ? loadRecordOps().then((ops) => ops.queueNoteCreate(outbox, rootId, data))
            : createNoteMutation.mutateAsync(data)),
        updateNote: (noteId, content) => (queued()
            ? loadRecordOps().then((ops) => ops.queueNoteUpdate(
                outbox, rootId, notes.find((note) => note.id === noteId) || { id: noteId }, content,
            ))
            : updateNoteMutation.mutateAsync({
                noteId, content, base: notes.find((note) => note.id === noteId)?.content,
            })),
        deleteNote: (note) => (queued()
            ? loadRecordOps().then((ops) => ops.queueNoteDelete(outbox, rootId, note))
            : deleteNoteMutation.mutateAsync(note)),
        deleteGoalCompletionNotes: () => deleteGoalCompletionNotesMutation.mutateAsync(),
        // Pin an activity or session note to its next time (or undo it).
        setCarryForward: (noteId, on) => carryForwardMutation.mutateAsync({ noteId, on }),
    };
}
