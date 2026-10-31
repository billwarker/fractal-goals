import { findGoalNodeById, getGoalNodeChildren, getGoalNodeId } from './goalNodeModel';

/** The scoped goal's id and its descendants' ids in `goalTree` (just the goal when it isn't there). */
export function collectGoalScopeIds(goalTree, goalId) {
    const ids = new Set(goalId == null ? [] : [String(goalId)]);
    const stack = [findGoalNodeById(goalTree, goalId)].filter(Boolean);
    while (stack.length > 0) {
        const node = stack.pop();
        const id = getGoalNodeId(node);
        if (id != null) ids.add(String(id));
        stack.push(...getGoalNodeChildren(node));
    }
    return ids;
}

/**
 * Picker ids for a scoped goal: its catalog (definition, group and inherited links) plus definitions
 * whose instances were linked one-off to the goal or a descendant, from the server and from this
 * session's instances (so a link made offline or before refetch shows at once).
 * `instanceLinkedIds` holds only the one-off-only definitions, for the picker's marker.
 */
export function buildGoalScopeActivityIds({
    catalogActivities = [],
    instanceLinkedActivities = [],
    sessionInstances = [],
    scopeGoalIds = new Set(),
} = {}) {
    const catalogIds = new Set(catalogActivities.map((activity) => String(activity.id)));
    const linkedIds = new Set(instanceLinkedActivities.map((activity) => String(activity.id)));
    for (const instance of sessionInstances) {
        if (!instance?.activity_definition_id) continue;
        if ((instance.associated_goal_ids || []).some((goalId) => scopeGoalIds.has(String(goalId)))) {
            linkedIds.add(String(instance.activity_definition_id));
        }
    }
    const instanceLinkedIds = new Set([...linkedIds].filter((id) => !catalogIds.has(id)));
    return { activityIds: [...catalogIds, ...instanceLinkedIds], instanceLinkedIds };
}

export function filterActivitiesForGoalScope(activities = [], activityGoalScope = null) {
    if (!activityGoalScope) return activities;
    if (activityGoalScope.isLoading || activityGoalScope.isError) return [];

    const matchingIds = new Set((activityGoalScope.activityIds || []).map(String));
    return activities.filter((activity) => matchingIds.has(String(activity.id)));
}

export function filterCircuitsForGoalScope(circuits = [], activityGoalScope = null) {
    if (!activityGoalScope) return circuits;
    if (activityGoalScope.isLoading || activityGoalScope.isError) return [];

    const matchingIds = new Set((activityGoalScope.activityIds || []).map(String));
    return circuits.filter((circuit) => (circuit.slots || []).some((slot) => (
        matchingIds.has(String(slot.activity_definition_id || slot.activity?.id || ''))
    )));
}

export function getGoalScopeEmptyState(activityGoalScope, itemLabelPlural) {
    if (!activityGoalScope) return `No ${itemLabelPlural} found.`;
    const goalName = activityGoalScope.goal?.name || 'this goal';
    if (activityGoalScope.isLoading) return `Loading ${itemLabelPlural} for ${goalName}…`;
    if (activityGoalScope.isError) return `Unable to load ${itemLabelPlural} for ${goalName}.`;
    return `No ${itemLabelPlural} associated with ${goalName}.`;
}
