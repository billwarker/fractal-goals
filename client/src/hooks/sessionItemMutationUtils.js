export function cloneMetricRows(metrics = []) {
    if (!Array.isArray(metrics)) return [];
    return metrics.map((metric) => ({
        metric_id: metric.metric_id || metric.metric_definition_id,
        split_id: metric.split_id || metric.split_definition_id || null,
        value: metric.value,
    })).filter((metric) => metric.metric_id && metric.value !== undefined && metric.value !== null && metric.value !== '');
}

export function cloneSetRows(sets = [], { preserveCompletion = true } = {}) {
    if (!Array.isArray(sets)) return [];
    return sets.map((set) => ({
        instance_id: crypto.randomUUID(),
        completed: preserveCompletion ? Boolean(set.completed) : false,
        metrics: cloneMetricRows(set.metrics || []),
    }));
}

export function getSectionItems(section = {}) {
    if (Array.isArray(section.items)) return [...section.items];
    return (section.activity_ids || []).map((activityInstanceId) => ({
        type: 'activity', activity_instance_id: activityInstanceId,
    }));
}

export function withSectionItems(section, items) {
    const next = { ...section, items };
    delete next.activity_ids;
    delete next.activities;
    delete next.exercises;
    return next;
}
