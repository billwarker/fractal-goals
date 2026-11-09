/**
 * useProgramDateNotes — notes on one calendar date of a program (not on a program day): add, edit, delete.
 * The notes arrive with the day read model (`detail.notes`); writes refetch it and the Notes feed.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fractalNotesApi } from '../utils/api/fractalNotesApi';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';

// NoteQuickAdd passes attachments in the serialized shape; the API takes ids and descriptions.
const attachmentRefs = (attachments = []) => attachments.map((item) => ({
    asset_id: item.asset_id || item.id,
    alt_text: item.alt_text || '',
}));

export function useProgramDateNotes(rootId, programId) {
    const queryClient = useQueryClient();
    const invalidate = () => Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.programDayReadModelRoot(rootId, programId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.allNotesRoot(rootId) }),
    ]);

    const createMutation = useMutation({
        mutationFn: ({ date, content, attachments }) => fractalNotesApi.createNote(rootId, {
            content,
            attachments: attachmentRefs(attachments),
            context_type: 'program_date',
            context_id: programId,
            calendar_date: date,
        }),
        onSuccess: invalidate,
        onError: () => notify.error('Failed to add note'),
    });

    const updateMutation = useMutation({
        mutationFn: ({ noteId, content }) => fractalNotesApi.updateNote(rootId, noteId, { content }),
        onSuccess: invalidate,
        onError: () => notify.error('Failed to update note'),
    });

    const deleteMutation = useMutation({
        mutationFn: (note) => fractalNotesApi.deleteNote(rootId, note.id),
        onSuccess: invalidate,
        onError: () => notify.error('Failed to delete note'),
    });

    return {
        addNote: (date, content, attachments) => createMutation.mutateAsync({ date, content, attachments }),
        updateNote: (noteId, content) => updateMutation.mutateAsync({ noteId, content }),
        deleteNote: (note) => deleteMutation.mutateAsync(note),
    };
}
