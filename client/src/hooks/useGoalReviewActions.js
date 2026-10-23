import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { fractalNotesApi } from '../utils/api/fractalNotesApi';
import { refreshGoalReadModels } from '../utils/goalTreeCache';
import { formatError } from '../utils/mutationNotify';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';

/**
 * Goal review actions: write a review (a goal_review note, which restarts the cadence), or turn
 * reviews back on. Each refreshes the goal trees,
 * whose `review` field carries the schedule.
 */
export default function useGoalReviewActions(rootId, goalId) {
    const queryClient = useQueryClient();
    const [isSaving, setIsSaving] = useState(false);

    const run = useCallback(async (request, failure, success) => {
        setIsSaving(true);
        try {
            await request();
            await Promise.all([
                refreshGoalReadModels(queryClient, queryKeys, rootId),
                queryClient.invalidateQueries({ queryKey: queryKeys.allNotesRoot(rootId) }),
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
        writeReview: (content) => run(() => fractalNotesApi.createNote(rootId, {
            content, context_type: 'goal', context_id: goalId, goal_id: goalId, note_kind: 'goal_review',
        }), 'Couldn’t save the review', 'Review saved'),
        setReviewsOn: (on) => run(
            () => fractalApi.updateGoal(rootId, goalId, { review_disabled: !on }),
            'Couldn’t change reviews',
            on ? 'Reviews turned on' : 'Reviews turned off',
        ),
    };
}
