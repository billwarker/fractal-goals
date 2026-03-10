import { useQueryClient } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';
import useSessionNotes from './useSessionNotes';

export function useSessionDetailNotes({
    rootId,
    sessionId,
    selectedActivity,
    updateGoal,
}) {
    const queryClient = useQueryClient();
    const sessionNotesHook = useSessionNotes(rootId, sessionId, selectedActivity?.activity_definition_id);
    const sessionGoalsViewKey = queryKeys.sessionGoalsView(rootId, sessionId);
    const sessionKey = queryKeys.session(rootId, sessionId);
    const fractalTreeKey = queryKeys.fractalTree(rootId);
    const goalsKey = queryKeys.goals(rootId);
    const goalsForSelectionKey = queryKeys.goalsForSelection(rootId);

    const handleUpdateNote = async (noteId, content) => {
        const note = sessionNotesHook.notes.find((item) => item.id === noteId);
        await sessionNotesHook.updateNote(noteId, content);
        if (note?.is_nano_goal) {
            notify.success(`Updated Nano Goal: ${content}`);
        }
    };

    const handleDeleteNote = async (noteOrId) => {
        const note = typeof noteOrId === 'object'
            ? noteOrId
            : sessionNotesHook.notes.find((item) => item.id === noteOrId);
        if (!note) return;

        try {
            if (note.is_nano_goal && note.nano_goal_id) {
                await updateGoal({ goalId: note.nano_goal_id, updates: { isDeleting: true } });
                await fractalApi.deleteGoal(rootId, note.nano_goal_id);
                queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey });
                queryClient.invalidateQueries({ queryKey: sessionKey });
                queryClient.invalidateQueries({ queryKey: fractalTreeKey });
                queryClient.invalidateQueries({ queryKey: goalsKey });
                queryClient.invalidateQueries({ queryKey: goalsForSelectionKey });
            }

            await sessionNotesHook.deleteNote(note.id);

            if (note.is_nano_goal) {
                notify.success(`Deleted Nano Goal: ${note.content || 'Untitled'}`);
            }
        } catch (error) {
            console.error('Failed to delete note/goal', error);
            notify.error('Failed to delete');
        }
    };

    return {
        ...sessionNotesHook,
        updateNote: handleUpdateNote,
        deleteNote: handleDeleteNote,
    };
}

export default useSessionDetailNotes;
