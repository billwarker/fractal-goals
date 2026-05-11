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

function getSessionStartTimestamp(session) {
    const rawStart = session?.session_start
        || session?.attributes?.session_start
        || session?.created_at
        || session?.attributes?.created_at
        || null;
    if (!rawStart) return null;

    const timestamp = Date.parse(rawStart);
    return Number.isNaN(timestamp) ? null : timestamp;
}

function wasCompletedBeforeSession(goal, sessionStartTimestamp) {
    if (sessionStartTimestamp === null) return false;
    if (!goal?.completed) return false;
    if (!goal.completed_at) return false;

    const completedTimestamp = Date.parse(goal.completed_at);
    return !Number.isNaN(completedTimestamp) && completedTimestamp < sessionStartTimestamp;
}

function isPausedGoal(goal) {
    return Boolean(goal?.paused || goal?.frozen);
}

export function useSessionGoalsViewModel({
    session,
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

    const sessionStartTimestamp = useMemo(() => getSessionStartTimestamp(session), [session]);
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

    const selectedActivityGoalIds = useMemo(() => {
        if (!activeActivityDefId || !selectedActivityInSession) return new Set();
        return new Set(
            (sessionGoalsView?.activity_goal_ids_by_activity?.[activeActivityDefId] || [])
                .map((goalId) => String(goalId))
        );
    }, [activeActivityDefId, selectedActivityInSession, sessionGoalsView]);

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

    // 2. Derive Session Hierarchy (everything)
    const sessionHierarchy = useMemo(() => {
        const activityGoalIds = sessionGoalsView?.activity_goal_ids_by_activity || {};
        const nodeById = new Map(normalizedTree.map((node) => [String(node.id), node]));
        const inScopeGoalIds = new Set();

        currentSessionActivityDefIds.forEach((activityDefId) => {
            (activityGoalIds[activityDefId] || []).forEach((goalId) => {
                const normalizedGoalId = String(goalId);
                const node = nodeById.get(normalizedGoalId);
                if (
                    node
                    && !isPausedGoal(node)
                    && !wasCompletedBeforeSession(node, sessionStartTimestamp)
                ) {
                    inScopeGoalIds.add(normalizedGoalId);
                }
            });
        });

        const lineageIds = collectIdsWithAncestors(inScopeGoalIds, parentMap);

        return normalizedTree
            .filter(node => lineageIds.has(String(node.id)))
            .map(node => ({
                ...node,
                status: getGoalStatus(node, targetAchievements, achievedTargetIds)
            }));
    }, [currentSessionActivityDefIds, normalizedTree, parentMap, sessionGoalsView, sessionStartTimestamp, targetAchievements, achievedTargetIds]);

    // 3. Derive Activity Hierarchy (filtered by associated activity)
    const activityHierarchy = useMemo(() => {
        if (!activeActivityDefId || !selectedActivityInSession || normalizedTree.length === 0) return [];

        const associatedGoalIds = new Set(
            sessionGoalsView.activity_goal_ids_by_activity?.[activeActivityDefId] || []
        );
        const nodeById = new Map(normalizedTree.map((node) => [String(node.id), node]));
        const activeAssociatedGoalIds = Array.from(associatedGoalIds)
            .map((goalId) => String(goalId))
            .filter((goalId) => {
                const node = nodeById.get(goalId);
                return node
                    && !isPausedGoal(node)
                    && !wasCompletedBeforeSession(node, sessionStartTimestamp);
            });
        const relevantIds = collectIdsWithAncestors(
            activeAssociatedGoalIds,
            parentMap
        );

        if (normalizedTree[0]) {
            collectIdsWithAncestors([String(normalizedTree[0].id)], parentMap)
                .forEach((goalId) => relevantIds.add(goalId));
        }

        return normalizedTree
            .filter(node => relevantIds.has(String(node.id)))
            .map(node => ({
                ...node,
                status: getGoalStatus(node, targetAchievements, achievedTargetIds)
            }));

    }, [activeActivityDefId, activeActivityInstanceId, selectedActivityInSession, sessionGoalsView, normalizedTree, parentMap, sessionStartTimestamp, targetAchievements, achievedTargetIds]);

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
        sessionActivityIds: currentSessionActivityDefIds,
    };
}

export default useSessionGoalsViewModel;
