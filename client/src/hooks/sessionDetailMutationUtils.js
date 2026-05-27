export function formatGoalTypeLabel(type) {
    if (!type) return 'Goal';
    return type.replace(/Goal$/, ' Goal').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
}

export function getGoalId(goal) {
    return goal?.id || goal?.attributes?.id || null;
}

export function replaceGoalInTree(node, updatedGoal) {
    const updatedGoalId = getGoalId(updatedGoal);
    if (!node || !updatedGoalId) return node;

    const nodeId = getGoalId(node);
    const children = Array.isArray(node.children)
        ? node.children.map((child) => replaceGoalInTree(child, updatedGoal))
        : node.children;

    if (String(nodeId) === String(updatedGoalId)) {
        return {
            ...node,
            ...updatedGoal,
            attributes: {
                ...(node.attributes || {}),
                ...(updatedGoal.attributes || {}),
            },
            children,
        };
    }

    if (children !== node.children) {
        return { ...node, children };
    }
    return node;
}

export function replaceGoalInList(list, updatedGoal) {
    const updatedGoalId = getGoalId(updatedGoal);
    if (!Array.isArray(list) || !updatedGoalId) return list;
    return list.map((goal) => (
        String(getGoalId(goal)) === String(updatedGoalId)
            ? {
                ...goal,
                ...updatedGoal,
                attributes: {
                    ...(goal.attributes || {}),
                    ...(updatedGoal.attributes || {}),
                },
            }
            : goal
    ));
}
