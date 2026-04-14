function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalId(value) {
    if (typeof value === 'string') {
        const normalized = value.trim();
        return normalized || null;
    }

    if (value && typeof value === 'object') {
        return normalizeOptionalId(value.id ?? value.value ?? null);
    }

    return null;
}

function sanitizeMetric(metric) {
    const name = normalizeString(metric?.name);
    const unit = normalizeString(metric?.unit);

    if (!name || !unit) {
        return null;
    }

    const sanitized = {
        name,
        unit,
        is_best_set_metric: Boolean(metric?.is_best_set_metric),
        is_multiplicative: metric?.is_multiplicative !== false,
        track_progress: metric?.track_progress !== false,
    };

    const metricId = normalizeOptionalId(metric?.id);
    const fractalMetricId = normalizeOptionalId(metric?.fractal_metric_id);

    if (metricId) {
        sanitized.id = metricId;
    }

    if (fractalMetricId) {
        sanitized.fractal_metric_id = fractalMetricId;
    }

    return sanitized;
}

function sanitizeSplit(split) {
    const name = normalizeString(split?.name);

    if (!name) {
        return null;
    }

    const sanitized = { name };
    const splitId = normalizeOptionalId(split?.id);

    if (splitId) {
        sanitized.id = splitId;
    }

    return sanitized;
}

function sanitizeGoalIds(goalIds) {
    if (!Array.isArray(goalIds)) {
        return [];
    }

    return goalIds
        .map((goalId) => normalizeOptionalId(goalId))
        .filter(Boolean);
}

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
    trackProgress,
}) {
    const sanitizedMetrics = (metrics || [])
        .map((metric) => sanitizeMetric(metric))
        .filter(Boolean);
    const sanitizedSplits = (splits || [])
        .map((split) => sanitizeSplit(split))
        .filter(Boolean);

    return {
        name,
        description,
        metrics: hasMetrics ? sanitizedMetrics : [],
        splits: hasSplits ? sanitizedSplits : [],
        has_sets: hasSets,
        has_metrics: hasMetrics,
        metrics_multiplicative: metricsMultiplicative,
        has_splits: hasSplits,
        group_id: normalizeOptionalId(groupId),
        goal_ids: sanitizeGoalIds(selectedGoalIds),
        track_progress: trackProgress !== false,
    };
}

export function prepareActivityDefinitionCopy(activity) {
    if (!activity) {
        return null;
    }

    const metricDefinitions = (activity.metric_definitions || [])
        .map((metric) => sanitizeMetric(metric))
        .filter(Boolean)
        .map((metric) => ({
            ...metric,
            id: undefined,
        }));

    const splitDefinitions = (activity.split_definitions || [])
        .map((split) => sanitizeSplit(split))
        .filter(Boolean)
        .map((split) => ({
            ...split,
            id: undefined,
        }));

    return {
        _builderKey: Date.now(),
        id: undefined,
        name: `${activity.name || 'Untitled Activity'} (Copy)`,
        description: activity.description || '',
        has_sets: Boolean(activity.has_sets),
        has_metrics: Boolean(activity.has_metrics ?? metricDefinitions.length > 0),
        metrics_multiplicative: Boolean(activity.metrics_multiplicative),
        has_splits: Boolean(activity.has_splits ?? splitDefinitions.length > 0),
        group_id: normalizeOptionalId(activity.group_id),
        track_progress: activity.track_progress !== false,
        metric_definitions: metricDefinitions,
        split_definitions: splitDefinitions,
        associated_goal_ids: sanitizeGoalIds(activity.associated_goal_ids),
    };
}
