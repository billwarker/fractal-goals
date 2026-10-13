// Pure request builders and optimistic cache patches for in-session writes.
// The server stays authoritative: these patches only mirror its common-case
// rules so the UI reflects a tap immediately, and every acknowledgement
// replaces the patched record with the server's version.

export function nowIso(now = Date.now()) {
    return new Date(now).toISOString();
}

function secondsBetween(startIso, endIso) {
    const start = Date.parse(startIso);
    const end = Date.parse(endIso);
    if (Number.isNaN(start) || Number.isNaN(end)) return 0;
    return Math.max(0, Math.floor((end - start) / 1000));
}

function normalizeMetricValue(rawValue) {
    if (rawValue === '' || rawValue === undefined) return null;
    if (typeof rawValue !== 'string') return rawValue;
    const trimmed = rawValue.trim();
    if (trimmed === '') return null;
    return Number.isNaN(Number(trimmed)) ? rawValue : Number(trimmed);
}

/** Mirror of the online instance-update request shape. */
export function buildInstanceUpdateRequest({ rootId, sessionId, instance, updates }) {
    if (updates.metrics !== undefined) {
        const metrics = (Array.isArray(updates.metrics) ? updates.metrics : [])
            .map((metric) => {
                const metricId = metric?.metric_id || metric?.metric_definition_id || null;
                const value = normalizeMetricValue(metric?.value);
                if (!metricId || value == null) return null;
                return {
                    value,
                    metric_id: metricId,
                    split_id: metric?.split_id || metric?.split_definition_id || null,
                };
            })
            .filter(Boolean);
        return {
            method: 'put',
            url: `/${rootId}/sessions/${sessionId}/activities/${instance.id}/metrics`,
            body: { metrics },
        };
    }

    const body = {
        session_id: sessionId,
        activity_definition_id: instance.activity_definition_id,
        ...updates,
    };
    if (updates.sets !== undefined) {
        body.sets = (Array.isArray(updates.sets) ? updates.sets : []).map((set) => ({
            ...set,
            metrics: (Array.isArray(set?.metrics) ? set.metrics : []).filter((metric) => {
                const value = metric?.value;
                return value != null && !(typeof value === 'string' && value.trim() === '');
            }),
        }));
    }
    return { method: 'put', url: `/${rootId}/activity-instances/${instance.id}`, body };
}

/** One coalescing lane per instance and field set, so unrelated fields never overwrite each other. */
export function instanceCoalesceKey(instanceId, updates) {
    return `instance:${instanceId}:${Object.keys(updates).sort().join(',')}`;
}

export function buildPlaceholderInstance({ id, sessionId, rootId, definition, groupName = null, now = Date.now() }) {
    return {
        id,
        session_id: sessionId,
        root_id: rootId,
        activity_definition_id: definition.id,
        associated_goal_ids: [],
        name: definition.name,
        definition_name: definition.name,
        group_name: groupName,
        created_at: nowIso(now),
        time_start: null,
        time_stop: null,
        duration_seconds: null,
        target_duration_seconds: null,
        is_paused: false,
        last_paused_at: null,
        total_paused_seconds: 0,
        completed: false,
        notes: null,
        has_sets: Boolean(definition.has_sets),
        has_metrics: Boolean(definition.has_metrics),
        sets: [],
        data: {},
        metric_values: [],
        metrics: [],
        tags: [],
        tag_assignment_version: 0,
        progress_comparison: null,
        prescription: null,
        _pendingSync: true,
    };
}

export function isInstanceRunning(instance) {
    return Boolean(instance?.time_start) && !instance?.time_stop && !instance?.completed;
}

export function findRunningInstance(instances, excludeId = null) {
    return (instances || []).find((instance) => instance.id !== excludeId && isInstanceRunning(instance)) || null;
}

/** The same conflict shape the server returns, so the existing switch prompt works offline. */
export function activeWorkConflictError(runningInstance) {
    const error = new Error('Another session item is already accruing work time');
    error.response = {
        status: 409,
        data: {
            code: 'active_work_exists',
            error: error.message,
            active_work: {
                activity_instance_id: runningInstance.id,
                activity_name: runningInstance.name || runningInstance.definition_name || null,
                started_at: runningInstance.time_start,
            },
        },
    };
    return error;
}

function completeInstance(instance, at) {
    if (!instance.time_start) {
        return { ...instance, time_start: at, time_stop: at, duration_seconds: 0, completed: true, is_paused: false, last_paused_at: null };
    }
    const pausedSoFar = instance.is_paused && instance.last_paused_at
        ? secondsBetween(instance.last_paused_at, at)
        : 0;
    const totalPaused = (instance.total_paused_seconds || 0) + pausedSoFar;
    return {
        ...instance,
        time_stop: at,
        is_paused: false,
        last_paused_at: null,
        total_paused_seconds: totalPaused,
        duration_seconds: Math.max(0, secondsBetween(instance.time_start, at) - totalPaused),
        completed: true,
    };
}

export function applyTimerAction(instances, { instanceId, action, at, sessionPaused = false, extraData = {} }) {
    if (!Array.isArray(instances)) return instances;
    return instances.map((instance) => {
        if (instance.id === instanceId) {
            if (action === 'start') {
                return {
                    ...instance,
                    time_start: at,
                    time_stop: null,
                    duration_seconds: null,
                    completed: false,
                    is_paused: sessionPaused,
                    last_paused_at: sessionPaused ? at : null,
                    ...(extraData.target_duration_seconds
                        ? { target_duration_seconds: extraData.target_duration_seconds }
                        : {}),
                };
            }
            if (action === 'complete') return completeInstance(instance, at);
            if (action === 'reset') {
                return {
                    ...instance,
                    time_start: null,
                    time_stop: null,
                    duration_seconds: null,
                    target_duration_seconds: null,
                    completed: false,
                    is_paused: false,
                    last_paused_at: null,
                };
            }
            return instance;
        }
        // Switching completes whatever was running, like the server does.
        if (action === 'start' && extraData.switch && isInstanceRunning(instance)) {
            return completeInstance(instance, at);
        }
        return instance;
    });
}

export function applySessionPause(session, instances, at) {
    return {
        session: session ? { ...session, is_paused: true, last_paused_at: at } : session,
        instances: Array.isArray(instances)
            ? instances.map((instance) => (isInstanceRunning(instance) && !instance.is_paused
                ? { ...instance, is_paused: true, last_paused_at: at }
                : instance))
            : instances,
    };
}

export function applySessionResume(session, instances, at) {
    const pausedFor = session?.last_paused_at ? secondsBetween(session.last_paused_at, at) : 0;
    return {
        session: session
            ? {
                ...session,
                is_paused: false,
                last_paused_at: null,
                total_paused_seconds: (session.total_paused_seconds || 0) + pausedFor,
            }
            : session,
        instances: Array.isArray(instances)
            ? instances.map((instance) => {
                if (!instance.is_paused) return instance;
                const instancePausedFor = instance.last_paused_at ? secondsBetween(instance.last_paused_at, at) : 0;
                return {
                    ...instance,
                    is_paused: false,
                    last_paused_at: null,
                    total_paused_seconds: (instance.total_paused_seconds || 0) + instancePausedFor,
                };
            })
            : instances,
    };
}
