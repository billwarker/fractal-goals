// @ts-check
/**
 * Keeps every cached goal tree in step after a goal is created, so each hierarchy and the goal
 * flow tree show the new goal at once; the invalidations that follow reconcile with the server.
 */

/** @param {any} goal */
const goalIdOf = (goal) => goal?.id ?? goal?.attributes?.id ?? null;

/** @param {any} goal */
const parentIdOf = (goal) => goal?.parent_id ?? goal?.attributes?.parent_id ?? null;

/**
 * The tree with `goal` appended to its parent's children, or the same tree when the parent
 * isn't in it or the goal already is.
 * @param {any} node
 * @param {any} goal
 * @returns {any}
 */
export function insertGoalIntoTree(node, goal) {
    const goalId = goalIdOf(goal);
    const parentId = parentIdOf(goal);
    if (!node || !goalId || !parentId) return node;
    let inserted = false;
    /** @param {any} current */
    const visit = (current) => {
        if (!current || typeof current !== 'object') return current;
        const children = Array.isArray(current.children) ? current.children : [];
        if (String(goalIdOf(current)) === String(parentId)) {
            if (children.some((child) => String(goalIdOf(child)) === String(goalId))) return current;
            inserted = true;
            return { ...current, children: [...children, { ...goal, children: goal.children || [] }] };
        }
        let changed = false;
        const nextChildren = children.map((child) => {
            const next = visit(child);
            if (next !== child) changed = true;
            return next;
        });
        return changed ? { ...current, children: nextChildren } : current;
    };
    const next = visit(node);
    return inserted ? next : node;
}

/**
 * Read models a new goal changes: every goal tree and list, session and plan goal views,
 * program scope and metrics, goal analytics, and the flow tree's evidence overlays.
 * @param {any} queryKeys
 * @param {string} rootId
 */
export function goalTreeQueryKeys(queryKeys, rootId) {
    return [
        queryKeys.fractalTree(rootId),
        queryKeys.goalsTree(rootId),
        queryKeys.goals(rootId),
        queryKeys.goalsForSelection(rootId),
        queryKeys.rootGoal(rootId),
        queryKeys.sessionGoalsViewRoot(rootId),
        queryKeys.goalTimelinesRoot(rootId),
        queryKeys.goalConditionRoot(rootId),
        queryKeys.goalSequenceRoot(rootId),
        queryKeys.goalAnalytics(rootId),
        queryKeys.sessionsEvidenceGoalsRoot(rootId),
        queryKeys.sessionsFlowtreeMetricsRoot(rootId),
        queryKeys.programs(rootId),
        queryKeys.programCalendarRoot(rootId),
        queryKeys.programCalendarFeedRoot(rootId),
        queryKeys.programDayReadModelRoot(rootId),
        queryKeys.programSessionPlansRoot(rootId),
        queryKeys.programMetricsRoot(rootId),
    ];
}

/**
 * Refetch every goal read model after a goal changes (due date, name, completion).
 * @param {import('@tanstack/react-query').QueryClient} queryClient
 * @param {any} queryKeys
 * @param {string} rootId
 */
export function refreshGoalReadModels(queryClient, queryKeys, rootId) {
    return Promise.all(goalTreeQueryKeys(queryKeys, rootId).map((queryKey) => (
        queryClient.invalidateQueries({ queryKey })
    )));
}

/**
 * Insert a created goal into the cached goal trees, then refetch what it affects.
 * @param {import('@tanstack/react-query').QueryClient} queryClient
 * @param {any} queryKeys
 * @param {string} rootId
 * @param {any} goal
 */
export async function applyCreatedGoal(queryClient, queryKeys, rootId, goal) {
    if (goal) {
        [queryKeys.fractalTree(rootId), queryKeys.goalsTree(rootId)].forEach((queryKey) => {
            queryClient.setQueryData(queryKey, (/** @type {any} */ tree) => insertGoalIntoTree(tree, goal));
        });
    }
    await refreshGoalReadModels(queryClient, queryKeys, rootId);
}
