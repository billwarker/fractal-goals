import { normalizeGoalNode, parseGoalTargets } from './goalNodeModel';

/**
 * Parses targets from a goal node.
 */
export const parseTargets = (goal) => parseGoalTargets(goal);

/**
 * Formats a target description.
 */
export const formatTargetDescription = (target) => {
    if (!target) return '';
    if (target.description) return target.description;
    const metrics = target.metrics || [];
    if (metrics.length === 0) return 'Target';
    return metrics.map(m => `${m.metric_name || 'Metric'} ≥ ${m.value}`).join(', ');
};

/**
 * Formats a goal type for display (e.g., ShortTermGoal -> Short Term)
 */
export const formatGoalType = (type) => {
    if (!type) return '';
    return type.replace(/Goal$/, '').replace(/([A-Z])/g, ' $1').trim();
};

/**
 * Flatten a goal tree into a list of nodes that should be visible based on target IDs.
 * Includes nodes that are targets themselves or have targets as descendants.
 */
export const buildFlattenedGoalTree = (
    node,
    targetGoalIds,
    filterCompleted = false,
    sessionCompletedGoalIds = null,
    depth = 0
) => {
    if (!node) return [];

    const isTarget = targetGoalIds.has(node.id);
    const nodeCompleted = node.completed || node.attributes?.completed;
    const keepCompletedForSession = !!sessionCompletedGoalIds?.has(node.id);

    // If filtering completed, stop at this branch if the node is completed
    // UNLESS it's a direct target for the current activity/session
    if (filterCompleted && nodeCompleted && !isTarget && !keepCompletedForSession) return [];

    // Recursively check children
    let childrenNodes = [];
    for (const child of (node.children || [])) {
        childrenNodes = [
            ...childrenNodes,
            ...buildFlattenedGoalTree(child, targetGoalIds, filterCompleted, sessionCompletedGoalIds, depth + 1)
        ];
    }

    // Include this node if it's a target or has relevant descendants
    if (isTarget || keepCompletedForSession || childrenNodes.length > 0) {
        return [
            normalizeGoalNode(node, {
                depth,
                isLinked: isTarget,
            }),
            ...childrenNodes
        ];
    }
    return [];
};
