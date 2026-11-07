import { getGoalNodeChildren, normalizeGoalNode } from './goalNodeModel';

export function mergeUniqueIds(existing = [], additions = []) {
    return Array.from(new Set([
        ...(Array.isArray(existing) ? existing : []),
        ...(Array.isArray(additions) ? additions : []),
    ].filter(Boolean).map((id) => String(id))));
}

export function getCurrentSessionInstanceIds(localSessionData) {
    if (!localSessionData || !Array.isArray(localSessionData.sections)) {
        return null;
    }

    return new Set(
        localSessionData.sections
            .flatMap((section) => {
                if (Array.isArray(section?.items)) {
                    return section.items
                        .filter((item) => item?.type === 'activity')
                        .map((item) => item.activity_instance_id);
                }
                return section?.activity_ids || [];
            })
            .filter(Boolean)
            .map((instanceId) => String(instanceId))
    );
}

export function getCurrentSessionActivityDefIds({
    activityInstances,
    localSessionData,
    sessionGoalsView,
}) {
    const currentSessionInstanceIds = getCurrentSessionInstanceIds(localSessionData);

    if (Array.isArray(activityInstances)) {
        return new Set(
            activityInstances
                .filter((instance) => (
                    !currentSessionInstanceIds
                    || currentSessionInstanceIds.has(String(instance?.id))
                ))
                .map((instance) => instance?.activity_definition_id || instance?.activity_id)
                .filter(Boolean)
                .map((activityId) => String(activityId))
        );
    }

    return new Set(
        (sessionGoalsView?.session_activity_ids || [])
            .filter(Boolean)
            .map((activityId) => String(activityId))
    );
}

/** Every goal an instance counts toward: its definition's and group's, plus its own one-off links. */
export function instanceGoalIds(instance, activityGoalIdsByActivity = {}) {
    const definitionId = instance?.activity_definition_id || instance?.activity_id;
    return new Set(
        [...(activityGoalIdsByActivity[String(definitionId)] || []), ...(instance?.associated_goal_ids || [])]
            .map((goalId) => String(goalId)),
    );
}

/** Normalized goals by id, and each goal's parent, from a session goal tree. */
export function indexGoalTree(tree) {
    const nodeById = new Map();
    const parentById = new Map();
    const stack = tree ? [{ node: tree, parentId: null }] : [];
    while (stack.length > 0) {
        const { node, parentId } = stack.pop();
        const id = String(node.id);
        nodeById.set(id, normalizeGoalNode(node, { parentId }));
        if (parentId) parentById.set(id, String(parentId));
        getGoalNodeChildren(node).forEach((child) => stack.push({ node: child, parentId: node.id }));
    }
    return { nodeById, parentById };
}

/** Drops every goal with a descendant in the set, leaving the lowest goal on each branch. */
export function lowestGoalIdsPerBranch(goalIds, parentById) {
    const ids = new Set(goalIds);
    const ancestors = new Set();
    ids.forEach((goalId) => {
        const visited = new Set([goalId]);
        let current = parentById.get(goalId);
        while (current && !visited.has(current)) {
            visited.add(current);
            ancestors.add(current);
            current = parentById.get(current);
        }
    });
    return [...ids].filter((goalId) => !ancestors.has(goalId));
}
