import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

export function invalidateInstanceGoalQueries(queryClient, rootId, sessionId) {
    const keys = [
        queryKeys.sessionActivities(rootId, sessionId), queryKeys.session(rootId, sessionId),
        queryKeys.sessionGoalsView(rootId, sessionId), queryKeys.sessions(rootId),
        queryKeys.fractalTree(rootId), queryKeys.goals(rootId), queryKeys.goalsForSelection(rootId),
        queryKeys.goalTimelinesRoot(rootId), queryKeys.goalAnalytics(rootId), queryKeys.goalMetricsRoot(),
        queryKeys.targetAnalyticsFractalRoot(rootId), queryKeys.goalActivityInstancesFractalRoot(rootId),
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
    return { ...mutation, isPending: mutation.isPending || pendingCount > 0 };
}
