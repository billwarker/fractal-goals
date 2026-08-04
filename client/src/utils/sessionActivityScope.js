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
