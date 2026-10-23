import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { showActionToast } from '../components/atoms/ActionToast';
import { fractalApi } from '../utils/api';
import { refreshGoalReadModels } from '../utils/goalTreeCache';
import { formatError } from '../utils/mutationNotify';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';

const readGoal = (node) => ({
    name: node.name ?? node.attributes?.name,
    completed: Boolean(node.completed ?? node.attributes?.completed),
    source: node.completion_state?.source ?? node.attributes?.completion_state?.source ?? null,
    trackId: node.sequence_track_id ?? node.attributes?.sequence_track_id ?? null,
});

function snapshot(tree) {
    const goals = new Map();
    const visit = (node) => {
        if (!node) return;
        const id = node.id ?? node.attributes?.id;
        if (id != null) goals.set(String(id), readGoal(node));
        (node.children || []).forEach(visit);
    };
    visit(tree);
    return goals;
}

/**
 * When logging evidence completes a sequenced goal through its condition, the server begins the
 * next step. This offers Undo for that begin: the step waits, paused, again (the goal stays
 * complete). It watches the goal tree across refetches, so only completions seen happening now
 * count, never ones already complete when the page loaded.
 */
export default function useSequenceAdvanceUndo({ rootId, goalTree }) {
    const queryClient = useQueryClient();
    const previousRef = useRef(null);

    useEffect(() => {
        if (!rootId || !goalTree) return;
        const current = snapshot(goalTree);
        const previous = previousRef.current;
        previousRef.current = current;
        if (!previous) return;

        current.forEach((goal, id) => {
            const before = previous.get(id);
            if (!before || before.completed || !goal.completed || goal.source !== 'condition' || !goal.trackId) return;
            fractalApi.getGoalSequence(rootId, id).then(({ data }) => {
                const begun = data?.next_step_begun_by_this;
                if (!begun) return;
                showActionToast({
                    message: `${goal.name} is complete, so ${begun.name} has begun.`,
                    actionLabel: 'Undo',
                    onAction: async () => {
                        try {
                            await fractalApi.holdSequenceStep(rootId, begun.id);
                            await refreshGoalReadModels(queryClient, queryKeys, rootId);
                        } catch (error) {
                            notify.error(`Couldn’t pause ${begun.name}: ${formatError(error)}`);
                        }
                    },
                });
            }).catch(() => {
                // The completion stands; without the sequence there's nothing to offer.
            });
        });
    }, [goalTree, queryClient, rootId]);
}
