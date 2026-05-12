import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { flattenGoalTree, parseGoalTargets } from '../utils/goalNodeModel';
import { queryKeys } from './queryKeys';
import { useFractalTree } from './useGoalQueries';
import { normalizeGoalIds, useActivityGoalAssociations } from './useActivityGoalAssociations';

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
    const { setActivityGoalIds } = useActivityGoalAssociations({ rootId, sessionId });

    const allAvailableGoals = useMemo(() => {
        if (!showAssociationModal || !fractalTree) return [];

        const flattenedGoals = flattenGoalTree(fractalTree, { includeRoot: true });
        const goalsById = new Map(flattenedGoals.map((goal) => [goal.id, goal]));
        const activityDefinitionId = associationContext?.activityDefinition?.id || null;

        return flattenedGoals
            .filter((goal) => ELIGIBLE_ACTIVITY_ASSOCIATION_TYPES.has(goal.type))
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

        const idsToAssociate = normalizeGoalIds(goalIds);

        try {
            await setActivityGoalIds(activityDefinition.id, idsToAssociate);

            setAssociationContext((previous) => (
                previous
                    ? { ...previous, initialSelectedGoalIds: idsToAssociate }
                    : previous
            ));

            return true;
        } catch (error) {
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
