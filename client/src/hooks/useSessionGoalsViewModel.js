import { useMemo } from 'react';
import {
    normalizeGoalNode,
    parseGoalTargets,
} from '../utils/goalNodeModel';
import { getCurrentSessionActivityDefIds } from '../utils/sessionGoalScope';
import { getGoalStatus, getTargetStatus } from '../utils/sessionGoalStatus';

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
    targetAchievements,
    achievedTargetIds,
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
            (activityGoalIdsByActivity[String(activeActivityDefId)] || [])
                .map((goalId) => String(goalId))
        );
    }, [activeActivityDefId, activityGoalIdsByActivity, selectedActivityInSession]);

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
        return collectIdsWithAncestors(direct, parentMap);
    }, [activityGoalIdsByActivity, currentSessionActivityDefIds, parentMap]);
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
                status: getGoalStatus(node, targetAchievements, achievedTargetIds)
            }));
    }, [activityGoalIdsByActivity, currentSessionActivityDefIds, normalizedTree, parentMap, sessionGoalsView, targetAchievements, achievedTargetIds]);

    // 3. Derive Activity Hierarchy (filtered by associated activity)
    const activityHierarchy = useMemo(() => {
        if (!activeActivityDefId || !selectedActivityInSession || normalizedTree.length === 0) return [];

        const associatedGoalIds = new Set(
            activityGoalIdsByActivity[String(activeActivityDefId)] || []
        );
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
                status: getGoalStatus(node, targetAchievements, achievedTargetIds)
            }));

    }, [activeActivityDefId, activityGoalIdsByActivity, selectedActivityInSession, normalizedTree, parentMap, targetAchievements, achievedTargetIds]);

    // 4. Build Target Cards
    const targetCards = useMemo(() => {
        const sourceHierarchy = activeActivityDefId ? activityHierarchy : sessionHierarchy;
        const cards = [];

        sourceHierarchy.forEach((goal) => {
            const goalTargets = parseGoalTargets(goal);
            goalTargets.forEach((target) => {
                // Filter targets to just the active activity context if applicable
                if (activeActivityDefId && target.activity_id !== activeActivityDefId) return;
                if (target.activity_instance_id && activeActivityInstanceId && target.activity_instance_id !== activeActivityInstanceId) return;

                const status = getTargetStatus(target, goal, targetAchievements, achievedTargetIds);
                cards.push({
                    ...target,
                    _goalDepth: goal.depth || 0,
                    _goalName: goal.name,
                    _goalType: goal.type,
                    _goalId: goal.id,
                    is_completed_realtime: status.isCompleted,
                    completion_reason: status.reason
                });
            });
        });

        // Lowest depth index appears first (highest level goals) vs lowest physical placement?
        // Let's sort to match previous logic
        return cards.sort((a, b) => b._goalDepth - a._goalDepth);
    }, [activeActivityDefId, activeActivityInstanceId, activityHierarchy, sessionHierarchy, targetAchievements, achievedTargetIds]);

    const goalStatusById = useMemo(() => {
        const map = new Map();
        [...sessionHierarchy, ...activityHierarchy].forEach((goal) => {
            if (!map.has(goal.id)) map.set(goal.id, goal.status);
        });
        return map;
    }, [sessionHierarchy, activityHierarchy]);

    const targetStatusById = useMemo(() => {
        const map = new Map();
        targetCards.forEach((target) => {
            map.set(target.id, {
                completed: target.is_completed_realtime,
                reason: target.completion_reason,
            });
        });
        return map;
    }, [targetCards]);

    return {
        activeActivityDefId,
        activeActivityInstanceId,
        sessionHierarchy,
        activityHierarchy,
        targetCards,
        goalStatusById,
        targetStatusById,
        selectedActivityGoalIds,
        selectedActivityAncestorIds,
        manualGoalIds,
        evidenceGoalIds,
        completedEvidenceGoalIds,
        sessionActivityIds: currentSessionActivityDefIds,
    };
}

export default useSessionGoalsViewModel;
