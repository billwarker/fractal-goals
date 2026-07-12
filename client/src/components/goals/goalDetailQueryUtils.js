import { queryKeys } from '../../hooks/queryKeys';
import { invalidateOnboardingProgress } from '../../utils/queryInvalidation';

export function invalidateGoalAssociationQueries(queryClient, rootId, goalId) {
    if (!rootId || !goalId) {
        return Promise.resolve();
    }

    return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.goalActivities(rootId, goalId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.goalActivitiesRoot(rootId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.goalActivityGroups(rootId, goalId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.goalActivityGroupsRoot(rootId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.goalMetrics(goalId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.goalMetricsRoot() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.activities(rootId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.fractalTree(rootId) }),
        // Associating an activity/group to a goal flips SMART "Achievable"
        // and the step-2 "Associate it to a goal" onboarding substep.
        invalidateOnboardingProgress(queryClient, queryKeys),
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
