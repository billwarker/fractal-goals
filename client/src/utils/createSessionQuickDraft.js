import { extractActivityId } from './createSessionPayload';

function buildDraftMetrics(definition, splitId = null) {
    const metrics = Array.isArray(definition?.metric_definitions) ? definition.metric_definitions : [];
    return metrics.map((metric) => ({
        metric_id: metric.id,
        ...(splitId ? { split_id: splitId } : {}),
        value: '',
    }));
}

function buildDraftSet(definition) {
    const splits = Array.isArray(definition?.split_definitions) ? definition.split_definitions : [];
    const metrics = definition?.has_splits && splits.length > 0
        ? splits.flatMap((split) => buildDraftMetrics(definition, split.id))
        : buildDraftMetrics(definition);

    return {
        instance_id: crypto.randomUUID(),
        completed: false,
        metrics,
    };
}

export function buildQueuedQuickSession(template, activityDefinitions) {
    const queuedSessionId = `queued-quick-${template.id}-${crypto.randomUUID()}`;
    const templateActivities = Array.isArray(template?.template_data?.activities)
        ? template.template_data.activities
        : [];
    const activityInstances = templateActivities
        .map((item, index) => {
            const activityId = extractActivityId(item);
            if (!activityId) return null;

            const definition = (activityDefinitions || []).find((entry) => entry.id === activityId);
            const hasSets = Boolean(definition?.has_sets);
            return {
                id: `queued-instance-${activityId}-${index}`,
                session_id: queuedSessionId,
                activity_definition_id: activityId,
                name: definition?.name || item?.name || 'Activity',
                type: 'activity',
                completed: false,
                has_sets: hasSets,
                metrics: hasSets ? [] : buildDraftMetrics(definition),
                sets: hasSets ? [buildDraftSet(definition)] : [],
                duration_seconds: null,
                time_start: null,
                time_stop: null,
                total_paused_seconds: 0,
                notes: '',
                description: definition?.description || '',
            };
        })
        .filter(Boolean);
    const localSessionData = {
        template_id: template.id,
        template_name: template.name,
        template_color: template.template_color || template.template_data?.template_color,
        session_type: 'quick',
        activity_ids: activityInstances.map((instance) => instance.id),
        program_context: null,
    };

    return {
        session: {
            id: queuedSessionId,
            name: template.name,
            template_id: template.id,
            completed: false,
            attributes: { completed: false, session_data: localSessionData },
        },
        localSessionData,
        activityInstances,
    };
}

function normalizeMetricValue(rawValue) {
    if (rawValue === '' || rawValue == null) return null;
    if (typeof rawValue === 'string') {
        const trimmed = rawValue.trim();
        if (trimmed === '') return null;
        if (!Number.isNaN(Number(trimmed))) return Number(trimmed);
    }
    return rawValue;
}

export function sanitizeMetrics(metrics) {
    return (Array.isArray(metrics) ? metrics : [])
        .map((metric) => {
            const value = normalizeMetricValue(metric?.value);
            if (value == null) return null;
            return {
                metric_id: metric.metric_id,
                ...(metric.split_id ? { split_id: metric.split_id } : {}),
                value,
            };
        })
        .filter(Boolean);
}

export function sanitizeSets(sets) {
    return (Array.isArray(sets) ? sets : []).map((set) => ({
        ...set,
        metrics: sanitizeMetrics(set.metrics),
    }));
}
