const EXECUTION_GOAL_TYPES = new Set();

export const getGoalNodeId = (goal) => {
    if (!goal) return null;
    return goal.attributes?.id ?? goal.id ?? null;
};

export const getGoalNodeType = (goal) => {
    if (!goal) return null;
    return goal.attributes?.type ?? goal.type ?? null;
};

export const getGoalNodeName = (goal) => {
    if (!goal) return '';
    return goal.attributes?.name ?? goal.name ?? '';
};

export const getGoalNodeDescription = (goal) => {
    if (!goal) return '';
    return goal.attributes?.description ?? goal.description ?? '';
};

export const getGoalNodeParentId = (goal, fallbackParentId = null) => {
    if (!goal) return fallbackParentId;
    return goal.parent_id ?? goal.attributes?.parent_id ?? fallbackParentId;
};

export const getGoalNodeChildren = (goal) => (
    Array.isArray(goal?.children) ? goal.children : []
);

export const parseGoalTargets = (goal) => {
    if (!goal) return [];

    const rawTargets = goal.attributes?.targets ?? goal.targets;
    if (!rawTargets) return [];

    try {
        const parsedTargets = typeof rawTargets === 'string'
            ? JSON.parse(rawTargets)
            : rawTargets;
        return Array.isArray(parsedTargets) ? parsedTargets : [];
    } catch {
        return [];
    }
};

export const getGoalTargetsSignature = (goal) => {
    const targets = parseGoalTargets(goal);
    if (targets.length === 0) return 'targets:[]';

    const normalizedTargets = targets.map((target) => ({
        id: target?.id ?? null,
        name: target?.name ?? null,
        type: target?.type ?? null,
        activity_id: target?.activity_id ?? null,
        activity_instance_id: target?.activity_instance_id ?? null,
        activity_group_id: target?.activity_group_id ?? null,
        completed: Boolean(target?.completed),
        completed_at: target?.completed_at ?? null,
        completed_session_id: target?.completed_session_id ?? null,
        completed_instance_id: target?.completed_instance_id ?? null,
        metrics: Array.isArray(target?.metrics) ? target.metrics : [],
        time_scope: target?.time_scope ?? null,
        start_date: target?.start_date ?? null,
        end_date: target?.end_date ?? null,
        linked_block_id: target?.linked_block_id ?? null,
        frequency_days: target?.frequency_days ?? null,
        frequency_count: target?.frequency_count ?? null,
    }));

    return `targets:${JSON.stringify(normalizedTargets)}`;
};

export const getGoalNodeRevision = (goal) => {
    if (!goal) return 'initial';
    return goal.attributes?.updated_at
        || goal.updated_at
        || getGoalTargetsSignature(goal)
        || 'initial';
};

export const getGoalNodeCategory = (goalOrType) => {
    const type = typeof goalOrType === 'string' ? goalOrType : getGoalNodeType(goalOrType);
    return EXECUTION_GOAL_TYPES.has(type) ? 'execution' : 'structural';
};

export const isExecutionGoalType = (type) => EXECUTION_GOAL_TYPES.has(type);

export const isStructuralGoalType = (type) => !isExecutionGoalType(type);

export const isExecutionGoalNode = (goal) => isExecutionGoalType(getGoalNodeType(goal));

export const isStructuralGoalNode = (goal) => !isExecutionGoalNode(goal);

export const normalizeGoalNode = (goal, options = {}) => {
    if (!goal) return null;

    const {
        depth = 0,
        isLinked = false,
        parentId = null,
        children = getGoalNodeChildren(goal),
    } = options;

    const type = getGoalNodeType(goal);
    const resolvedChildren = Array.isArray(children) ? children : [];

    return {
        id: getGoalNodeId(goal),
        name: getGoalNodeName(goal),
        type,
        goalCategory: getGoalNodeCategory(type),
        description: getGoalNodeDescription(goal),
        relevance_statement: goal.attributes?.relevance_statement ?? goal.relevance_statement,
        deadline: goal.attributes?.deadline ?? goal.deadline ?? null,
        completed: Boolean(goal.completed ?? goal.attributes?.completed),
        completed_at: goal.attributes?.completed_at ?? goal.completed_at ?? null,
        paused: Boolean(goal.paused ?? goal.attributes?.paused),
        paused_at: goal.attributes?.paused_at ?? goal.paused_at ?? null,
        created_at: goal.attributes?.created_at ?? goal.created_at ?? null,
        level_id: goal.level_id ?? goal.attributes?.level_id ?? null,
        level_name: goal.level_name ?? goal.attributes?.level_name ?? null,
        level: goal.level ?? goal.attributes?.level ?? null,
        is_smart: goal.is_smart ?? goal.attributes?.is_smart ?? false,
        depth,
        isLinked,
        targets: parseGoalTargets(goal),
        attributes: goal.attributes || {},
        children: resolvedChildren,
        childrenIds: resolvedChildren.map((child) => getGoalNodeId(child)).filter(Boolean),
        parent_id: getGoalNodeParentId(goal, parentId),
        activity_definition_id: goal.activity_definition_id ?? goal.attributes?.activity_definition_id ?? null,
    };
};

export const flattenGoalTree = (rootNode, options = {}) => {
    if (!rootNode) return [];

    const {
        includeRoot = true,
    } = options;

    const flattened = [];
    const stack = [{ node: rootNode, depth: 0, parentId: null }];

    while (stack.length > 0) {
        const { node, depth, parentId } = stack.pop();
        if (!node) continue;

        const normalizedNode = normalizeGoalNode(node, { depth, parentId });
        if (includeRoot || depth > 0) {
            flattened.push(normalizedNode);
        }

        const children = getGoalNodeChildren(node);
        for (let index = children.length - 1; index >= 0; index -= 1) {
            stack.push({
                node: children[index],
                depth: depth + 1,
                parentId: normalizedNode.id,
            });
        }
    }

    return flattened;
};

export const flattenSessionGoalsViewGoals = (sessionGoalsView) => {
    if (!sessionGoalsView || typeof sessionGoalsView !== 'object') return [];

    const flattened = [];
    const seenIds = new Set();
    const stack = [];

    if (sessionGoalsView.goal_tree) {
        stack.push(sessionGoalsView.goal_tree);
    }

    while (stack.length > 0) {
        const currentNode = stack.pop();
        if (!currentNode) continue;

        const currentId = getGoalNodeId(currentNode);
        if (!currentId || !seenIds.has(currentId)) {
            flattened.push(currentNode);
            if (currentId) seenIds.add(currentId);
        }

        const children = getGoalNodeChildren(currentNode);
        for (let index = children.length - 1; index >= 0; index -= 1) {
            stack.push(children[index]);
        }
    }

    return flattened;
};

export const findGoalNodeById = (rootNode, targetId) => {
    if (!rootNode || targetId == null) return null;

    const stack = [rootNode];
    while (stack.length > 0) {
        const currentNode = stack.pop();
        if (!currentNode) continue;
        if (String(getGoalNodeId(currentNode)) === String(targetId)) {
            return currentNode;
        }

        const children = getGoalNodeChildren(currentNode);
        for (let index = children.length - 1; index >= 0; index -= 1) {
            stack.push(children[index]);
        }
    }

    return null;
};
