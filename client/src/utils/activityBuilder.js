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
        metrics: hasMetrics ? (metrics || []).filter((m) => m.name.trim() !== '') : [],
        splits: hasSplits ? (splits || []).filter((s) => s.name.trim() !== '') : [],
        has_sets: hasSets,
        has_metrics: hasMetrics,
        metrics_multiplicative: metricsMultiplicative,
        has_splits: hasSplits,
        group_id: groupId || null,
        goal_ids: selectedGoalIds || []
    };
}
