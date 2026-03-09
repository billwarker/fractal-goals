import { useMemo } from 'react';
import {
    isExecutionGoalNode,
    normalizeGoalNode,
    parseGoalTargets,
} from '../utils/goalNodeModel';
import { getGoalStatus, getTargetStatus } from '../utils/sessionGoalStatus';

/**
 * Iteratively flattens the backend nested tree into a normalized array,
 * injecting micro/nano goals where they belong.
 */
function buildNormalizedTree(rootNode, sessionGoalIdsSet, microGoals) {
    if (!rootNode) return [];

    // Group micro goals by their parent ID
    const microGoalsByParent = {};
    (microGoals || []).forEach(mg => {
        const pid = mg.parent_id || mg.attributes?.parent_id;
        if (pid) {
            if (!microGoalsByParent[pid]) microGoalsByParent[pid] = [];
            microGoalsByParent[pid].push(mg);
        }
    });

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

        // Inject micro goals as children of this node
        const childMicros = microGoalsByParent[node.id] || [];
        children.push(...childMicros);

        // Push children to stack in reverse order so they process left-to-right
        for (let i = children.length - 1; i >= 0; i--) {
            stack.push({ node: children[i], depth: depth + 1, parentId: node.id });
        }
    }

    return result;
}

function buildRelationshipMaps(nodes) {
    const parentMap = {};
    const childrenMap = {};

    nodes.forEach((node) => {
        if (!childrenMap[node.id]) {
            childrenMap[node.id] = [];
        }
        if (node.parent_id) {
            parentMap[node.id] = node.parent_id;
            if (!childrenMap[node.parent_id]) {
                childrenMap[node.parent_id] = [];
            }
            childrenMap[node.parent_id].push(node.id);
        }
    });

    return { parentMap, childrenMap };
}
export function useSessionGoalsViewModel({
    sessionGoalsView,
    selectedActivity,
    targetAchievements,
    achievedTargetIds,
}) {
    // 1. Build ONE primary flat, normalized list of all goals
    const normalizedTree = useMemo(() => {
        if (!sessionGoalsView?.goal_tree) return [];
        return buildNormalizedTree(
            sessionGoalsView.goal_tree,
            new Set(sessionGoalsView.session_goal_ids || []),
            sessionGoalsView.micro_goals || []
        );
    }, [sessionGoalsView]);

    const activeActivityDefId = selectedActivity?.activity_definition_id || selectedActivity?.activity_id || null;
    const activeActivityInstanceId = selectedActivity?.id || null;

    // 2. Derive Session Hierarchy (everything)
    const sessionHierarchy = useMemo(() => {
        return normalizedTree.map(node => ({
            ...node,
            status: getGoalStatus(node, targetAchievements, achievedTargetIds)
        }));
    }, [normalizedTree, targetAchievements, achievedTargetIds]);

    // 3. Derive Activity Hierarchy (filtered by associated activity)
    const activityHierarchy = useMemo(() => {
        if (!activeActivityDefId || normalizedTree.length === 0) return [];

        const associatedGoalIds = new Set(
            sessionGoalsView.activity_goal_ids_by_activity?.[activeActivityDefId] || []
        );
        const { parentMap, childrenMap } = buildRelationshipMaps(normalizedTree);
        const nodeById = new Map(normalizedTree.map((node) => [node.id, node]));

        const relevantMicroIds = new Set();
        (sessionGoalsView.micro_goals || []).forEach(microGoal => {
            const microTargets = parseGoalTargets(microGoal);
            const instanceBoundTargetIds = microTargets.map(t => t.activity_instance_id).filter(Boolean);
            const isInstanceBound = instanceBoundTargetIds.length > 0;
            const hasInstanceBoundTargetForFocusedActivity = Boolean(
                activeActivityInstanceId && microTargets.some(t => t.activity_instance_id === activeActivityInstanceId)
            );
            const hasDefinitionScopedTargetForFocusedActivity = microTargets.some(t =>
                t.activity_id === activeActivityDefId && !t.activity_instance_id
            );

            if (hasInstanceBoundTargetForFocusedActivity) {
                relevantMicroIds.add(microGoal.id);
            } else if (!isInstanceBound) {
                if (microGoal.activity_definition_id === activeActivityDefId) relevantMicroIds.add(microGoal.id);
                else if (hasDefinitionScopedTargetForFocusedActivity) relevantMicroIds.add(microGoal.id);
                else {
                    if (associatedGoalIds.has(microGoal.id)) {
                        relevantMicroIds.add(microGoal.id);
                    }
                }
            }
        });

        const relevantIds = new Set();

        const markAncestors = (id) => {
            let currentId = id;
            while (currentId && !relevantIds.has(currentId)) {
                relevantIds.add(currentId);
                currentId = parentMap[currentId];
            }
        };

        const markExecutionDescendants = (id) => {
            const stack = [...(childrenMap[id] || [])];
            const visited = new Set();
            while (stack.length > 0) {
                const currentId = stack.pop();
                if (!currentId || visited.has(currentId)) continue;
                visited.add(currentId);

                const currentNode = nodeById.get(currentId);
                if (!currentNode) continue;

                if (isExecutionGoalNode(currentNode)) {
                    relevantIds.add(currentId);
                }

                (childrenMap[currentId] || []).forEach((childId) => {
                    stack.push(childId);
                });
            }
        };

        associatedGoalIds.forEach((id) => {
            markAncestors(id);
        });

        relevantMicroIds.forEach((id) => {
            markAncestors(id);
            markExecutionDescendants(id);
        });

        if (normalizedTree[0]) {
            relevantIds.add(normalizedTree[0].id);
        }

        return normalizedTree
            .filter(node => relevantIds.has(node.id))
            .map(node => ({
                ...node,
                status: getGoalStatus(node, targetAchievements, achievedTargetIds)
            }));

    }, [activeActivityDefId, activeActivityInstanceId, sessionGoalsView, normalizedTree, targetAchievements, achievedTargetIds]);

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
        sessionActivityIds: new Set(sessionGoalsView?.session_activity_ids || []),
    };
}

export default useSessionGoalsViewModel;
