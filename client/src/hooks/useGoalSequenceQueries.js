import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { refreshGoalReadModels } from '../utils/goalTreeCache';
import { formatError } from '../utils/mutationNotify';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';

/**
 * A goal's sequence: its steps, the step completing it would begin (`next_step`), and the step
 * its completion began (`next_step_begun_by_this`).
 */
export function useGoalSequence(rootId, goalId, { enabled = true } = {}) {
    return useQuery({
        queryKey: queryKeys.goalSequence(rootId, goalId),
        queryFn: async () => (await fractalApi.getGoalSequence(rootId, goalId)).data,
        enabled: Boolean(enabled && rootId && goalId),
        staleTime: 15 * 1000,
    });
}

/** Create, reorder or dissolve a sequence; every goal read model refreshes, since pauses change. */
export function useSequenceTrackMutations(rootId) {
    const queryClient = useQueryClient();
    const [isSaving, setIsSaving] = useState(false);
    const run = useCallback(async (request, successMessage) => {
        setIsSaving(true);
        try {
            const response = await request();
            await refreshGoalReadModels(queryClient, queryKeys, rootId);
            if (successMessage) notify.success(successMessage);
            return response.data;
        } catch (error) {
            notify.error(`Couldn’t update the sequence: ${formatError(error)}`);
            throw error;
        } finally {
            setIsSaving(false);
        }
    }, [queryClient, rootId]);
    return {
        isSaving,
        createTrack: (parentGoalId, goalIds) => run(
            () => fractalApi.createSequenceTrack(rootId, parentGoalId, goalIds), 'Sequence created',
        ),
        setSteps: (trackId, goalIds) => run(() => fractalApi.setSequenceSteps(rootId, trackId, goalIds), null),
        dissolveTrack: (trackId) => run(() => fractalApi.deleteSequenceTrack(rootId, trackId), 'Sequence removed'),
    };
}

/**
 * The completion views' sequence checkboxes. Completing a sequenced goal offers "Begin next goal in
 * sequence"; un-completing one offers "Pause next goal in sequence … again". Both default to on and
 * reset whenever the view changes.
 */
export function useSequenceCompletionChoice({ rootId, goalId, goal, viewState, readOnly = false }) {
    const inSequence = Boolean(goal?.sequence_track_id ?? goal?.attributes?.sequence_track_id);
    const confirming = viewState === 'complete-confirm' || viewState === 'uncomplete-confirm';
    const { data } = useGoalSequence(rootId, goalId, { enabled: !readOnly && inSequence && confirming });
    const [beginNext, setBeginNext] = useState(true);
    const [pauseNext, setPauseNext] = useState(true);
    // Reset while rendering when the view changes, so a new confirmation always starts checked.
    const [seenViewState, setSeenViewState] = useState(viewState);
    if (seenViewState !== viewState) {
        setSeenViewState(viewState);
        setBeginNext(true);
        setPauseNext(true);
    }
    const nextStep = viewState === 'complete-confirm' ? data?.next_step || null : null;
    const resumedStep = viewState === 'uncomplete-confirm' ? data?.next_step_begun_by_this || null : null;
    return {
        nextStep,
        beginNext,
        setBeginNext,
        resumedStep,
        pauseNext,
        setPauseNext,
        completionOptions: nextStep ? { beginNext } : null,
        uncompletionOptions: resumedStep ? { pauseNext } : null,
    };
}
