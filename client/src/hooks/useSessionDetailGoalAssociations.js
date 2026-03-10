import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { flattenGoalTree } from '../utils/goalNodeModel';
import { fractalApi } from '../utils/api';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';
import { useGoalsForSelection } from './useGoalQueries';

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

    const { goals: selectionGoals = [] } = useGoalsForSelection(rootId, { enabled: showAssociationModal });

    const allAvailableGoals = useMemo(() => {
        const availableMicroGoals = Array.isArray(sessionGoalsView?.micro_goals)
            ? sessionGoalsView.micro_goals
            : [];

        const microByParent = availableMicroGoals.reduce((acc, goal) => {
            const parentId = goal?.parent_id || goal?.attributes?.parent_id;
            if (!parentId) return acc;
            if (!acc.has(parentId)) acc.set(parentId, []);
            acc.get(parentId).push(goal);
            return acc;
        }, new Map());

        const roots = selectionGoals.map((shortTermGoal) => {
            const immediateGoals = Array.isArray(shortTermGoal.immediateGoals) ? shortTermGoal.immediateGoals : [];
            return {
                ...shortTermGoal,
                type: shortTermGoal.type || 'ShortTermGoal',
                children: immediateGoals.map((immediateGoal) => ({
                    ...immediateGoal,
                    children: microByParent.get(immediateGoal.id) || [],
                })),
            };
        });

        return roots
            .flatMap((goal) => flattenGoalTree(goal, { includeRoot: true }))
            .filter((goal) => !goal.completed);
    }, [selectionGoals, sessionGoalsView]);

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
        } catch {
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

export default useSessionDetailGoalAssociations;
