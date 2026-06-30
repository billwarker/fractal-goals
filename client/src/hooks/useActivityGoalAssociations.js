import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';
import { mergeUniqueIds } from '../utils/sessionGoalScope';
import { logError } from '../utils/logger';

export function normalizeGoalIds(goalIds) {
    return Array.from(new Set(
        (Array.isArray(goalIds) ? goalIds : [goalIds])
            .filter(Boolean)
            .map((goalId) => String(goalId))
    ));
}

export function patchActivityGoalAssociationCache(queryClient, {
    rootId,
    sessionId = null,
    activityId,
    goalIds,
}) {
    if (!queryClient || !rootId || !activityId) return;

    const normalizedGoalIds = normalizeGoalIds(goalIds);
    const normalizedActivityId = String(activityId);
    const activitiesKey = queryKeys.activities(rootId);

    queryClient.setQueryData(activitiesKey, (previous) => {
        if (!Array.isArray(previous)) return previous;
        return previous.map((activity) => (
            String(activity.id) === normalizedActivityId
                ? { ...activity, associated_goal_ids: normalizedGoalIds }
                : activity
        ));
    });

    if (!sessionId) return;

    queryClient.setQueryData(queryKeys.sessionGoalsView(rootId, sessionId), (previous) => {
        if (!previous || typeof previous !== 'object') return previous;
        const previousActivityGoalIds = previous.activity_goal_ids_by_activity || {};
        return {
            ...previous,
            activity_goal_ids_by_activity: {
                ...previousActivityGoalIds,
                [normalizedActivityId]: normalizedGoalIds,
            },
            session_activity_ids: mergeUniqueIds(previous.session_activity_ids, [normalizedActivityId]),
        };
    });
}

export function invalidateActivityGoalAssociationQueries(queryClient, {
    rootId,
    sessionId = null,
    goalId = null,
}) {
    if (!queryClient || !rootId) return Promise.resolve();

    const invalidations = [
        queryClient.invalidateQueries({ queryKey: queryKeys.activities(rootId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.fractalTree(rootId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.goals(rootId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.goalsForSelection(rootId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sessionsEvidenceGoalsRoot(rootId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sessionsFlowtreeMetricsRoot(rootId) }),
    ];

    if (sessionId) {
        invalidations.push(
            queryClient.invalidateQueries({ queryKey: queryKeys.session(rootId, sessionId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.sessionGoalsView(rootId, sessionId) })
        );
    } else {
        invalidations.push(
            queryClient.invalidateQueries({ queryKey: queryKeys.sessionRoot(rootId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.sessionGoalsViewRoot(rootId) })
        );
    }

    if (goalId) {
        invalidations.push(
            queryClient.invalidateQueries({ queryKey: queryKeys.goalActivities(rootId, goalId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.goalActivityGroups(rootId, goalId) })
        );
    }

    return Promise.all(invalidations);
}

export function useActivityGoalAssociations({
    rootId,
    sessionId = null,
    successMessage = 'Activity associated successfully',
    errorMessage = 'Failed to associate activity',
} = {}) {
    const queryClient = useQueryClient();

    const setActivityGoalIds = useCallback(async (activityId, goalIds, options = {}) => {
        const normalizedGoalIds = normalizeGoalIds(goalIds);
        try {
            const response = await fractalApi.setActivityGoals(rootId, activityId, normalizedGoalIds);

            patchActivityGoalAssociationCache(queryClient, {
                rootId,
                sessionId,
                activityId,
                goalIds: normalizedGoalIds,
            });

            await invalidateActivityGoalAssociationQueries(queryClient, {
                rootId,
                sessionId,
                goalId: options.goalId,
            });

            if (options.notify !== false && successMessage) {
                notify.success(successMessage);
            }

            return response;
        } catch (error) {
            logError('Failed to set activity goal associations', error);
            if (options.notify !== false && errorMessage) {
                notify.error(errorMessage);
            }
            throw error;
        }
    }, [errorMessage, queryClient, rootId, sessionId, successMessage]);

    return { setActivityGoalIds };
}

export default useActivityGoalAssociations;
