import { useMemo } from 'react';
import { normalizeGoalNode } from '../utils/goalNodeModel';
import { getCurrentSessionActivityDefIds } from '../utils/sessionGoalScope';
import { getGoalStatus } from '../utils/sessionGoalStatus';

/**
 * Iteratively flattens the backend nested tree into a normalized array.
 */
function buildNormalizedTree(rootNode, sessionGoalIdsSet) {
    if (!rootNode) return [];

    const result = [];
    const stack = [{ node: rootNode, depth: 0, parentId: null }];

    while (stack.length > 0) {
        const { node, depth, parentId } = stack.pop();

        const shapedNode = normalizeGoalNode(node, {
            depth,
            isLinked: sessionGoalIdsSet.has(node.id),
            parentId,
        });
        result.push(shapedNode);

        const children = [...(node.children || [])];

        // Push children to stack in reverse order so they process left-to-right
        for (let i = children.length - 1; i >= 0; i--) {
            stack.push({ node: children[i], depth: depth + 1, parentId: node.id });
        }
    }

    return result;
}

function buildParentMap(nodes) {
    const parentMap = {};
    nodes.forEach((node) => {
        if (node.parent_id) {
            parentMap[node.id] = node.parent_id;
        }
    });
    return parentMap;
}

function collectIdsWithAncestors(goalIds, parentMap) {
    const result = new Set();

    goalIds.forEach((goalId) => {
        let currentId = goalId;
        const visited = new Set();

        while (currentId && !visited.has(currentId)) {
            visited.add(currentId);
            result.add(String(currentId));
            currentId = parentMap[currentId];
        }
    });

    return result;
}

function isPausedGoal(goal) {
    return Boolean(goal?.paused);
}

export function useSessionGoalsViewModel({
    sessionGoalsView,
    activityInstances,
    localSessionData,
    selectedActivity,
    conditionProgressByGoalId,
}) {
    // 1. Build ONE primary flat, normalized list of all goals
    const normalizedTree = useMemo(() => {
        if (!sessionGoalsView?.goal_tree) return [];
        return buildNormalizedTree(
            sessionGoalsView.goal_tree,
            new Set(sessionGoalsView.session_goal_ids || [])
        );
    }, [sessionGoalsView]);

    const parentMap = useMemo(() => buildParentMap(normalizedTree), [normalizedTree]);
    const currentSessionActivityDefIds = useMemo(() => getCurrentSessionActivityDefIds({
        activityInstances,
        localSessionData,
        sessionGoalsView,
    }), [activityInstances, localSessionData, sessionGoalsView]);

    const activeActivityDefId = selectedActivity?.activity_definition_id || selectedActivity?.activity_id || null;
    const activeActivityInstanceId = selectedActivity?.id || null;
    const selectedActivityInSession = activeActivityDefId
        ? currentSessionActivityDefIds.has(String(activeActivityDefId))
        : false;
    const activityGoalIdsByActivity = useMemo(() => {
        return sessionGoalsView?.activity_goal_ids_by_activity || {};
    }, [sessionGoalsView]);

    const selectedActivityGoalIds = useMemo(() => {
        if (!activeActivityDefId || !selectedActivityInSession) return new Set();
        return new Set(
            [...(activityGoalIdsByActivity[String(activeActivityDefId)] || []), ...(selectedActivity?.associated_goal_ids || [])]
                .map((goalId) => String(goalId))
        );
    }, [activeActivityDefId, activityGoalIdsByActivity, selectedActivityInSession, selectedActivity]);

    const selectedActivityAncestorIds = useMemo(() => {
        if (!activeActivityDefId || normalizedTree.length === 0) return new Set();

        const ancestorIds = new Set();

        selectedActivityGoalIds.forEach((goalId) => {
            let currentId = parentMap[goalId];
            const visited = new Set([goalId]);
            while (currentId && !visited.has(currentId)) {
                visited.add(currentId);
                ancestorIds.add(String(currentId));
                currentId = parentMap[currentId];
            }
        });

        return ancestorIds;
    }, [activeActivityDefId, normalizedTree, parentMap, selectedActivityGoalIds]);

    const manualGoalIds = useMemo(
        () => new Set((sessionGoalsView?.manual_goal_ids || []).map(String)),
        [sessionGoalsView]
    );
    const evidenceGoalIds = useMemo(() => {
        const direct = new Set();
        currentSessionActivityDefIds.forEach((activityDefId) => {
            (activityGoalIdsByActivity[activityDefId] || []).forEach((goalId) => direct.add(String(goalId)));
        });
        (activityInstances || []).filter((instance) => !instance.deleted_at).forEach((instance) => {
            (instance.associated_goal_ids || []).forEach((goalId) => direct.add(String(goalId)));
        });
        return collectIdsWithAncestors(direct, parentMap);
    }, [activityGoalIdsByActivity, currentSessionActivityDefIds, parentMap, activityInstances]);
    const completedEvidenceGoalIds = useMemo(() => {
        const completedDefinitionIds = new Set(
            (activityInstances || [])
                .filter((instance) => instance?.completed && !instance?.deleted_at)
                .map((instance) => String(instance.activity_definition_id || instance.activity_id || ''))
                .filter(Boolean)
        );
        const direct = new Set();
        completedDefinitionIds.forEach((activityDefId) => {
            (activityGoalIdsByActivity[activityDefId] || []).forEach((goalId) => direct.add(String(goalId)));
        });
        (activityInstances || []).filter((instance) => instance.completed && !instance.deleted_at).forEach((instance) => {
            (instance.associated_goal_ids || []).forEach((goalId) => direct.add(String(goalId)));
        });
        return collectIdsWithAncestors(direct, parentMap);
    }, [activityGoalIdsByActivity, activityInstances, parentMap]);

    // 2. Derive Session Hierarchy from the backend-pruned manual/evidence tree.
    const sessionHierarchy = useMemo(() => {
        const hasExplicitScopeContract = Array.isArray(sessionGoalsView?.manual_goal_ids)
            || Array.isArray(sessionGoalsView?.automatic_goal_ids);
        let visibleIds = null;
        if (!hasExplicitScopeContract) {
            const legacyEvidenceIds = new Set();
            currentSessionActivityDefIds.forEach((activityDefId) => {
                (activityGoalIdsByActivity[activityDefId] || []).forEach((goalId) => {
                    const node = normalizedTree.find((candidate) => String(candidate.id) === String(goalId));
                    if (node && !isPausedGoal(node)) legacyEvidenceIds.add(String(goalId));
                });
            });
            visibleIds = collectIdsWithAncestors(legacyEvidenceIds, parentMap);
        }
        return normalizedTree
            .filter((node) => !isPausedGoal(node))
            .filter((node) => !visibleIds || visibleIds.has(String(node.id)))
            .map(node => ({
                ...node,
                status: getGoalStatus(node, conditionProgressByGoalId)
            }));
    }, [activityGoalIdsByActivity, currentSessionActivityDefIds, normalizedTree, parentMap, sessionGoalsView, conditionProgressByGoalId]);

    // 3. Derive Activity Hierarchy (filtered by associated activity)
    const activityHierarchy = useMemo(() => {
        if (!activeActivityDefId || !selectedActivityInSession || normalizedTree.length === 0) return [];

        const associatedGoalIds = selectedActivityGoalIds;
        const nodeById = new Map(normalizedTree.map((node) => [String(node.id), node]));
        const activeAssociatedGoalIds = Array.from(associatedGoalIds)
            .map((goalId) => String(goalId))
            .filter((goalId) => {
                const node = nodeById.get(goalId);
                return node && !isPausedGoal(node);
            });
        const relevantIds = collectIdsWithAncestors(
            activeAssociatedGoalIds,
            parentMap
        );

        return normalizedTree
            .filter(node => relevantIds.has(String(node.id)))
            .map(node => ({
                ...node,
                status: getGoalStatus(node, conditionProgressByGoalId)
            }));

    }, [activeActivityDefId, selectedActivityGoalIds, selectedActivityInSession, normalizedTree, parentMap, conditionProgressByGoalId]);

    // 4. Goals in view that complete on an activity threshold (scoped to the selected activity's).
    const conditionCards = useMemo(() => {
        const sourceHierarchy = activeActivityDefId ? activityHierarchy : sessionHierarchy;
        return sourceHierarchy
            .filter((goal) => goal.completion_condition === 'activity_threshold' && goal.condition)
            .filter((goal) => !activeActivityDefId || goal.condition.activity_definition_id === activeActivityDefId)
            .map((goal) => ({
                goalId: goal.id,
                goalName: goal.name,
                goalType: goal.type,
                goalDepth: goal.depth || 0,
                condition: goal.condition,
                completed: goal.status.completed,
                progress: goal.status.progress,
            }))
            .sort((a, b) => b.goalDepth - a.goalDepth);
    }, [activeActivityDefId, activityHierarchy, sessionHierarchy]);

    const goalStatusById = useMemo(() => {
        const map = new Map();
        [...sessionHierarchy, ...activityHierarchy].forEach((goal) => {
            if (!map.has(goal.id)) map.set(goal.id, goal.status);
        });
        return map;
    }, [sessionHierarchy, activityHierarchy]);

    return {
        activeActivityDefId,
        activeActivityInstanceId,
        sessionHierarchy,
        activityHierarchy,
        conditionCards,
        goalStatusById,
        selectedActivityGoalIds,
        selectedActivityAncestorIds,
        manualGoalIds,
        evidenceGoalIds,
        completedEvidenceGoalIds,
        sessionActivityIds: currentSessionActivityDefIds,
    };
}

export default useSessionGoalsViewModel;
