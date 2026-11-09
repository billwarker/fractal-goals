import { useCallback } from 'react';
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutbox } from '../offline/OutboxContext';
import { SESSION_OP } from '../offline/opKinds';
import { fractalApi } from '../utils/api';
import notify from '../utils/notify';
import { shouldAutoLinkToScopedGoal } from '../utils/sessionActivityScope';
import { queryKeys } from './queryKeys';

export function invalidateInstanceGoalQueries(queryClient, rootId, sessionId) {
    const keys = [
        queryKeys.sessionActivities(rootId, sessionId), queryKeys.session(rootId, sessionId),
        queryKeys.sessionGoalsView(rootId, sessionId), queryKeys.sessions(rootId),
        queryKeys.fractalTree(rootId), queryKeys.goals(rootId), queryKeys.goalsForSelection(rootId),
        queryKeys.goalTimelinesRoot(rootId), queryKeys.goalAnalytics(rootId), queryKeys.goalMetricsRoot(),
        queryKeys.goalConditionRoot(rootId), queryKeys.goalInstanceLinksRoot(rootId),
        queryKeys.programMetricsRoot(rootId), queryKeys.programDayReadModelRoot(rootId),
    ];
    return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

// Queued: a link then an unlink made offline (or the reverse) cancel out before sending.
function queueGoalLink(outbox, { rootId, sessionId, instanceId, goalId, remove }) {
    const linkKey = `goal-link:${instanceId}:${goalId}`;
    const unlinkKey = `goal-unlink:${instanceId}:${goalId}`;
    return outbox.submit({
        scope: sessionId,
        kind: SESSION_OP.INSTANCE_GOAL_LINK,
        method: remove ? 'delete' : 'post',
        url: remove
            ? `/${rootId}/activity-instances/${instanceId}/goals/${goalId}`
            : `/${rootId}/activity-instances/${instanceId}/goals`,
        body: remove ? null : { goal_id: goalId },
        entityIds: [instanceId],
        creates: [remove ? unlinkKey : linkKey],
        supersedes: [remove ? linkKey : unlinkKey],
        meta: { rootId, sessionId, instanceId, goalId, remove: Boolean(remove) },
    });
}

/**
 * Links an instance that doesn't have a card yet (just added from the scoped picker). A queued link
 * follows its add in order; if the add is rejected, the outbox rejects the link with it.
 */
export function useInstanceGoalLinker(rootId, sessionId) {
    const queryClient = useQueryClient();
    const outbox = useOutbox();
    return useCallback(async ({ instanceId, goalId }) => {
        if (outbox && sessionId) {
            await queueGoalLink(outbox, { rootId, sessionId, instanceId, goalId, remove: false });
            return;
        }
        const { data } = await fractalApi.associateActivityInstanceGoal(rootId, instanceId, goalId);
        queryClient.setQueryData(queryKeys.sessionActivities(rootId, sessionId), (previous) => (
            Array.isArray(previous) ? previous.map((instance) => instance.id === instanceId
                ? { ...instance, associated_goal_ids: data.associated_goal_ids } : instance) : previous
        ));
        await invalidateInstanceGoalQueries(queryClient, rootId, sessionId);
    }, [outbox, queryClient, rootId, sessionId]);
}

/** Adds a picked activity, linking it when the scoped goal offers it only through one-off links. */
export function useAddActivityFromPicker(rootId, sessionId, addActivity) {
    const link = useInstanceGoalLinker(rootId, sessionId);
    return useCallback(async (sectionIndex, activity, scope) => {
        const instance = await addActivity(sectionIndex, activity.id, activity);
        if (!instance?.id || !shouldAutoLinkToScopedGoal(scope, activity.id)) return;
        await link({ instanceId: instance.id, goalId: String(scope.goal.id) }).catch(() => {
            notify.error(`${activity.name} was added, but couldn't be linked to ${scope.goal.name}.`);
        });
    }, [addActivity, link]);
}

export default function useActivityInstanceGoalAssociation(rootId, sessionId, instanceId) {
    const queryClient = useQueryClient();
    const mutationKey = queryKeys.instanceGoalMutation(rootId, instanceId);
    const pendingCount = useIsMutating({ mutationKey });
    const mutation = useMutation({
        mutationKey,
        mutationFn: async ({ goalId, remove }) => {
            const response = remove
                ? await fractalApi.removeActivityInstanceGoal(rootId, instanceId, goalId)
                : await fractalApi.associateActivityInstanceGoal(rootId, instanceId, goalId);
            return response.data;
        },
        onSuccess: async (data) => {
            queryClient.setQueryData(queryKeys.sessionActivities(rootId, sessionId), (previous) => (
                Array.isArray(previous) ? previous.map((instance) => instance.id === instanceId
                    ? { ...instance, associated_goal_ids: data.associated_goal_ids } : instance) : previous
            ));
            await invalidateInstanceGoalQueries(queryClient, rootId, sessionId);
        },
    });
    const outbox = useOutbox();
    if (!outbox || !sessionId) return { ...mutation, isPending: mutation.isPending || pendingCount > 0 };

    const mutateAsync = async ({ goalId, remove }) => {
        await queueGoalLink(outbox, { rootId, sessionId, instanceId, goalId, remove });
        return null;
    };
    return { ...mutation, mutateAsync, mutate: (variables) => void mutateAsync(variables), isPending: false };
}
