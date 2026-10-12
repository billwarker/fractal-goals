// A dated plan's goals in the shape of the server's session goals view
// (services/goal_tree_service.py `get_session_goals_view_payload`), so the session page's
// goals view model and hierarchy render a plan exactly as they render a session.

function goalId(node) {
    const id = node?.id ?? node?.attributes?.id;
    return id == null ? null : String(id);
}

function indexTree(root) {
    const parentById = new Map();
    const stack = root ? [root] : [];
    while (stack.length) {
        const node = stack.pop();
        const id = goalId(node);
        (node.children || []).forEach((child) => {
            parentById.set(goalId(child), id);
            stack.push(child);
        });
    }
    return parentById;
}

function pruneTree(node, visibleIds) {
    if (!node || !visibleIds.has(goalId(node))) return null;
    return {
        ...node,
        children: (node.children || [])
            .map((child) => pruneTree(child, visibleIds))
            .filter(Boolean),
    };
}

/** Activity definition ids a plan's sections use, circuits counting their member activities. */
export function planSectionActivityIds(sections, circuitById = new Map()) {
    const ids = new Set();
    (sections || []).forEach((section) => (section.items || []).forEach((item) => {
        if (item.type === 'circuit') {
            (circuitById.get(item.circuit_definition_id)?.slots || []).forEach((slot) => {
                if (slot.activity_definition_id) ids.add(String(slot.activity_definition_id));
            });
            return;
        }
        const activityId = item.activity_definition_id || item.activity_id;
        if (activityId) ids.add(String(activityId));
    }));
    return [...ids].sort();
}

/**
 * `scopeGoalIds` stand in for a session's manual goals: the program day's goals, else the
 * program's (as for sessions started from that day). Each plan activity contributes its
 * effective goals (its own and its group's). The tree keeps those goals, their ancestors,
 * and the root, like the server's pruned session tree.
 */
export function buildPlanGoalsView({
    goalTree,
    scopeGoalIds = [],
    activityIds = [],
    activities = [],
    activityGroups = [],
}) {
    if (!goalTree) return null;
    const activityById = new Map((activities || []).map((activity) => [String(activity.id), activity]));
    const groupById = new Map((activityGroups || []).map((group) => [String(group.id), group]));
    const parentById = indexTree(goalTree);
    const knownIds = new Set([goalId(goalTree), ...parentById.keys()]);

    const activityGoalIdsByActivity = {};
    (activityIds || []).forEach((activityId) => {
        const activity = activityById.get(String(activityId));
        if (!activity) return;
        const group = activity.group_id ? groupById.get(String(activity.group_id)) : null;
        const goalIds = [...new Set([
            ...(activity.associated_goal_ids || []),
            ...(group?.associated_goal_ids || []),
        ].map(String))].filter((id) => knownIds.has(id));
        activityGoalIdsByActivity[String(activityId)] = goalIds;
    });

    const manualGoalIds = [...new Set((scopeGoalIds || []).map(String))].filter((id) => knownIds.has(id));
    const automaticGoalIds = [...new Set(Object.values(activityGoalIdsByActivity).flat())].sort();
    const visibleIds = new Set([goalId(goalTree)]);
    [...manualGoalIds, ...automaticGoalIds].forEach((id) => {
        let current = id;
        while (current && !visibleIds.has(current)) {
            visibleIds.add(current);
            current = parentById.get(current);
        }
    });

    return {
        goal_tree: pruneTree(goalTree, visibleIds),
        session_goal_ids: [...new Set([...manualGoalIds, ...automaticGoalIds])],
        manual_goal_ids: manualGoalIds,
        automatic_goal_ids: automaticGoalIds,
        session_activity_ids: [...(activityIds || [])].map(String),
        activity_goal_ids_by_activity: activityGoalIdsByActivity,
    };
}

/** Whether `goalId` is in a plan goals view's tree. */
export function planGoalsViewHasGoal(view, id) {
    if (!view?.goal_tree || id == null) return false;
    const target = String(id);
    const stack = [view.goal_tree];
    while (stack.length) {
        const node = stack.pop();
        if (goalId(node) === target) return true;
        stack.push(...(node.children || []));
    }
    return false;
}
