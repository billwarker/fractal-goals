import { queryKeys } from '../../hooks/queryKeys';

export function invalidateGoalAssociationQueries(queryClient, rootId, goalId) {
    if (!rootId || !goalId) {
        return Promise.resolve();
    }

    return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.goalActivities(rootId, goalId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.goalActivityGroups(rootId, goalId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.goalMetrics(goalId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.activities(rootId) }),
    ]);
}

export function invalidateGoalSessionQueries(queryClient, rootId, sessionId) {
    if (!rootId || !sessionId) {
        return Promise.resolve();
    }

    return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.session(rootId, sessionId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sessionGoalsView(rootId, sessionId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.fractalTree(rootId) }),
    ]);
}
