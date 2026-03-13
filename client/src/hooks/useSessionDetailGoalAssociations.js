import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { flattenGoalTree, parseGoalTargets } from '../utils/goalNodeModel';
import { fractalApi } from '../utils/api';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';
import { useFractalTree } from './useGoalQueries';

const ELIGIBLE_ACTIVITY_ASSOCIATION_TYPES = new Set([
    'UltimateGoal',
    'LongTermGoal',
    'MidTermGoal',
    'ShortTermGoal',
    'ImmediateGoal',
]);

export function useSessionDetailGoalAssociations({
    rootId,
    sessionId,
    sessionGoalsView,
    showAssociationModal,
    associationContext,
    setAssociationContext,
}) {
    const queryClient = useQueryClient();
    const sessionGoalsViewKey = queryKeys.sessionGoalsView(rootId, sessionId);
    const sessionKey = queryKeys.session(rootId, sessionId);
    const activitiesKey = queryKeys.activities(rootId);
    const fractalTreeKey = queryKeys.fractalTree(rootId);
    const { data: fractalTree = null } = useFractalTree(rootId, { enabled: showAssociationModal });

    const allAvailableGoals = useMemo(() => {
        if (!showAssociationModal || !fractalTree) return [];

        const flattenedGoals = flattenGoalTree(fractalTree, { includeRoot: true });
        const goalsById = new Map(flattenedGoals.map((goal) => [goal.id, goal]));
        const activityDefinitionId = associationContext?.activityDefinition?.id || null;

        return flattenedGoals
            .filter((goal) => ELIGIBLE_ACTIVITY_ASSOCIATION_TYPES.has(goal.type) && !goal.completed)
            .map((goal) => ({
                ...goal,
                parentName: goal.parent_id ? goalsById.get(goal.parent_id)?.name || null : null,
                hasTargetForActivity: Boolean(
                    activityDefinitionId
                    && parseGoalTargets(goal).some((target) => {
                        const targetActivityId = target?.activity_id || target?.activity_definition_id;
                        return targetActivityId === activityDefinitionId;
                    })
                ),
            }));
    }, [associationContext, fractalTree, showAssociationModal]);

    const handleGoalHierarchyChanged = () => {
        queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey });
        queryClient.invalidateQueries({ queryKey: sessionKey });
        queryClient.invalidateQueries({ queryKey: fractalTreeKey });
    };

    const handleGoalAssociationsChanged = () => {
        queryClient.invalidateQueries({ queryKey: activitiesKey });
        handleGoalHierarchyChanged();
    };

    const handleAssociateActivity = async (goalIds) => {
        const activityDefinition = associationContext?.activityDefinition;
        if (!activityDefinition) return false;

        const idsToAssociate = Array.isArray(goalIds) ? goalIds : [goalIds];

        try {
            await fractalApi.setActivityGoals(rootId, activityDefinition.id, idsToAssociate);

            queryClient.setQueryData(activitiesKey, (previous) => {
                if (!Array.isArray(previous)) return previous;
                return previous.map((activity) => (
                    activity.id === activityDefinition.id
                        ? { ...activity, associated_goal_ids: idsToAssociate }
                        : activity
                ));
            });

            queryClient.setQueryData(sessionGoalsViewKey, (previous) => {
                if (!previous) return previous;
                return {
                    ...previous,
                    activity_goal_ids_by_activity: {
                        ...(previous.activity_goal_ids_by_activity || {}),
                        [activityDefinition.id]: idsToAssociate,
                    },
                };
            });

            setAssociationContext((previous) => (
                previous
                    ? { ...previous, initialSelectedGoalIds: idsToAssociate }
                    : previous
            ));

            queryClient.invalidateQueries({ queryKey: activitiesKey });
            queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey });
            queryClient.invalidateQueries({ queryKey: fractalTreeKey });
            notify.success('Activity associated successfully');
            return true;
        } catch (error) {
            console.error('Failed to associate activity with goals', error);
            notify.error('Failed to associate activity');
            return false;
        }
    };

    return {
        allAvailableGoals,
        handleAssociateActivity,
        handleGoalHierarchyChanged,
        handleGoalAssociationsChanged,
    };
}
