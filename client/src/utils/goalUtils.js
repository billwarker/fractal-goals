/**
 * Parses targets from a goal node.
 */
export const parseTargets = (goal) => {
    if (!goal) return [];
    let targets = [];
    const raw = goal.attributes?.targets || goal.targets;
    if (raw) {
        try { targets = typeof raw === 'string' ? JSON.parse(raw) : raw; }
        catch { targets = []; }
    }
    return Array.isArray(targets) ? targets : [];
};

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
export const buildFlattenedGoalTree = (node, targetGoalIds, filterCompleted = false, depth = 0) => {
    if (!node) return [];

    const isTarget = targetGoalIds.has(node.id);
    const nodeCompleted = node.completed || node.attributes?.completed;

    // If filtering completed, stop at this branch if the node is completed
    if (filterCompleted && nodeCompleted) return [];

    // Recursively check children
    let childrenNodes = [];
    for (const child of (node.children || [])) {
        childrenNodes = [...childrenNodes, ...buildFlattenedGoalTree(child, targetGoalIds, filterCompleted, depth + 1)];
    }

    // Include this node if it's a target or has relevant descendants
    if (isTarget || childrenNodes.length > 0) {
        return [
            {
                id: node.id,
                name: node.attributes?.name || node.name,
                type: node.attributes?.type || node.type,
                isLinked: isTarget,
                completed: nodeCompleted,
                is_smart: node.is_smart,
                depth,
                targets: parseTargets(node), // Use our parser here too
            },
            ...childrenNodes
        ];
    }
    return [];
};
