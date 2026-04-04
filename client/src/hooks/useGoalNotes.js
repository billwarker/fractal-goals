/**
 * useGoalNotes — hook for notes directly attached to a goal.
 * Provides CRUD + pin/unpin mutations, invalidating both goalNotes and allNotes caches.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fractalNotesApi } from '../utils/api/fractalNotesApi';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';

export function useGoalNotes(rootId, goalId, { includeDescendants = false } = {}) {
    const queryClient = useQueryClient();
    const noteKey = queryKeys.goalNotes(rootId, goalId, includeDescendants);

    const { data: notes = [], isLoading, error } = useQuery({
        queryKey: noteKey,
        queryFn: async () => {
            const res = await fractalNotesApi.getGoalNotes(rootId, goalId, { includeDescendants });
            return res.data || [];
        },
        enabled: !!rootId && !!goalId,
        staleTime: 30000,
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: noteKey });
        queryClient.invalidateQueries({ queryKey: ['all-notes', rootId] });
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
        pinNote: (noteId) => pinNoteMutation.mutateAsync(noteId),
        unpinNote: (noteId) => unpinNoteMutation.mutateAsync(noteId),
    };
}
