export function buildActivityPayload({
    name,
    description,
    metrics,
    splits,
    hasSets,
    hasMetrics,
    metricsMultiplicative,
    hasSplits,
    groupId,
    selectedGoalIds,
}) {
    return {
        name,
        description,
        metrics: hasMetrics ? (metrics || []).filter((m) => m.name?.trim() !== '' && m.unit?.trim() !== '') : [],
        splits: hasSplits ? (splits || []).filter((s) => s.name.trim() !== '') : [],
        has_sets: hasSets,
        has_metrics: hasMetrics,
        metrics_multiplicative: metricsMultiplicative,
        has_splits: hasSplits,
        group_id: groupId || null,
        goal_ids: selectedGoalIds || []
    };
}

export function prepareActivityDefinitionCopy(activity) {
    if (!activity) {
        return null;
    }

    return {
        ...activity,
        id: undefined,
        name: `${activity.name} (Copy)`,
        metric_definitions: (activity.metric_definitions || []).map((metric) => ({
            ...metric,
            id: undefined,
        })),
        split_definitions: (activity.split_definitions || []).map((split) => ({
            ...split,
            id: undefined,
        })),
        associated_goal_ids: activity.associated_goal_ids ? [...activity.associated_goal_ids] : [],
    };
}
