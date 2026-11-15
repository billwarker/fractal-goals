import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { fractalNotesApi } from '../utils/api/fractalNotesApi';
import { refreshGoalReadModels } from '../utils/goalTreeCache';
import { formatError } from '../utils/mutationNotify';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';

/**
 * A completed goal's note, written after the fact (a threshold or its children may complete a goal
 * with no chance to write one), or the prompt for it dismissed for this completion.
 */
export default function useGoalCompletionNoteActions(rootId, goalId) {
    const queryClient = useQueryClient();
    const [isSaving, setIsSaving] = useState(false);

    const run = useCallback(async (request, failure, success) => {
        setIsSaving(true);
        try {
            await request();
            await Promise.all([
                refreshGoalReadModels(queryClient, queryKeys, rootId),
                queryClient.invalidateQueries({ queryKey: queryKeys.allNotesRoot(rootId) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.goalNotesRoot(rootId) }),
            ]);
            if (success) notify.success(success);
            return true;
        } catch (error) {
            notify.error(`${failure}: ${formatError(error)}`);
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [queryClient, rootId]);

    return {
        isSaving,
        writeNote: (content, attachments = []) => run(() => fractalNotesApi.createNote(rootId, {
            // Notes need text; attached evidence alone gets a plain label.
            content: content.trim() || 'Completion evidence',
            context_type: 'goal', context_id: goalId, goal_id: goalId, note_kind: 'goal_completion',
            ...(attachments.length ? { attachments } : {}),
        }), 'Couldn’t save the completion note', 'Completion note saved'),
        dismissPrompt: () => run(
            () => fractalApi.updateGoal(rootId, goalId, { completion_note_dismissed: true }),
            'Couldn’t dismiss the prompt',
        ),
    };
}
