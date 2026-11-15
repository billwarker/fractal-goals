// View helpers for quick sessions listed on Create Session (completed ones and ones waiting to sync).

/** A session's activity instances in the order they were logged. */
export function orderedSessionInstances(session) {
    const instances = Array.isArray(session?.activity_instances) ? session.activity_instances : [];
    const ids = session?.attributes?.session_data?.activity_ids;
    if (!Array.isArray(ids) || ids.length === 0) return instances;
    const byId = new Map(instances.map((instance) => [instance.id, instance]));
    const listed = ids.map((id) => byId.get(id)).filter(Boolean);
    const listedIds = new Set(listed.map((instance) => instance.id));
    return [...listed, ...instances.filter((instance) => !listedIds.has(instance.id))];
}

/** Which activities a quick session logged, ignoring order and repeats. */
export function quickSessionSelectionKey(session) {
    return [...new Set(orderedSessionInstances(session).map((instance) => String(instance.activity_definition_id)))]
        .sort()
        .join('|');
}

/**
 * One session per distinct activity selection: the latest of each, newest first (``sessions``
 * arrive newest first), at most ``limit`` of them.
 */
export function distinctQuickSessions(sessions, limit) {
    const seen = new Set();
    const distinct = [];
    for (const session of sessions || []) {
        const key = quickSessionSelectionKey(session);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        distinct.push(session);
        if (distinct.length === limit) break;
    }
    return distinct;
}

export function instanceActivityName(instance, definition) {
    return definition?.name || instance?.name || instance?.definition_name || 'Activity';
}
