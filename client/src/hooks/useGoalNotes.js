/**
 * useGoalNotes — hook for notes directly attached to a goal.
 * Provides CRUD + pin/unpin mutations, invalidating both goalNotes and allNotes caches.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fractalNotesApi } from '../utils/api/fractalNotesApi';
import notify from '../utils/notify';
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
        onError: (err) => notify.error('Failed to create note'),
    });

    const updateNoteMutation = useMutation({
        mutationFn: ({ noteId, content }) => fractalNotesApi.updateNote(rootId, noteId, { content }),
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

    const pinNoteMutation = useMutation({
        mutationFn: (noteId) => fractalNotesApi.pinNote(rootId, noteId),
        onSuccess: () => { invalidate(); },
        onError: () => notify.error('Failed to pin note'),
    });

    const unpinNoteMutation = useMutation({
        mutationFn: (noteId) => fractalNotesApi.unpinNote(rootId, noteId),
        onSuccess: () => { invalidate(); },
        onError: () => notify.error('Failed to unpin note'),
    });

    return {
        notes,
        isLoading,
        error,
        createNote: (data) => createNoteMutation.mutateAsync(data),
        updateNote: (noteId, content) => updateNoteMutation.mutateAsync({ noteId, content }),
        deleteNote: (note) => deleteNoteMutation.mutateAsync(note),
        deleteGoalCompletionNotes: () => deleteGoalCompletionNotesMutation.mutateAsync(),
        pinNote: (noteId) => pinNoteMutation.mutateAsync(noteId),
        unpinNote: (noteId) => unpinNoteMutation.mutateAsync(noteId),
    };
}
