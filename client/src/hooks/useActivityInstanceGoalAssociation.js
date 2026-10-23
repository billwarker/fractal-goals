import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutbox } from '../offline/OutboxContext';
import { SESSION_OP } from '../offline/opKinds';
import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

export function invalidateInstanceGoalQueries(queryClient, rootId, sessionId) {
    const keys = [
        queryKeys.sessionActivities(rootId, sessionId), queryKeys.session(rootId, sessionId),
        queryKeys.sessionGoalsView(rootId, sessionId), queryKeys.sessions(rootId),
        queryKeys.fractalTree(rootId), queryKeys.goals(rootId), queryKeys.goalsForSelection(rootId),
        queryKeys.goalTimelinesRoot(rootId), queryKeys.goalAnalytics(rootId), queryKeys.goalMetricsRoot(),
        queryKeys.goalConditionRoot(rootId),
        queryKeys.programMetricsRoot(rootId), queryKeys.programDayReadModelRoot(rootId),
    ];
    return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
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

    // Queued: a link then an unlink made offline (or the reverse) cancel out before sending.
    const mutateAsync = async ({ goalId, remove }) => {
        const linkKey = `goal-link:${instanceId}:${goalId}`;
        const unlinkKey = `goal-unlink:${instanceId}:${goalId}`;
        await outbox.submit({
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
        return null;
    };
    return { ...mutation, mutateAsync, mutate: (variables) => void mutateAsync(variables), isPending: false };
}
