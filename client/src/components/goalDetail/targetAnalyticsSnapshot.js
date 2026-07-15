function instanceTimestamp(instance) {
    const value = instance?.session_date || instance?.time_start || instance?.created_at;
    const timestamp = value ? new Date(value).getTime() : null;
    return Number.isFinite(timestamp) ? timestamp : 0;
}

export function selectTargetAnalyticsData(snapshot, remoteData, showAllHistory) {
    if (!snapshot || showAllHistory) return snapshot || remoteData;
    const createdAt = snapshot.summary?.created_at || snapshot.target?.created_at;
    const createdTimestamp = createdAt ? new Date(createdAt).getTime() : null;
    if (!Number.isFinite(createdTimestamp)) return snapshot;

    const instances = (snapshot.instances || []).filter(
        (instance) => instanceTimestamp(instance) >= createdTimestamp
    );
    return {
        ...snapshot,
        instances,
        summary: {
            ...snapshot.summary,
            total_count: instances.length,
            last_instance_at: instances.at(-1)?.session_date || null,
        },
    };
}
