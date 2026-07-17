function instanceTimestamp(instance) {
    const value = instance?.session_date || instance?.time_start || instance?.created_at;
    const timestamp = value ? new Date(value).getTime() : 0;
    return Number.isFinite(timestamp) ? timestamp : 0;
}

export function resolveLandingTargetAnalyticsData({
    target,
    activityDefinitions = [],
    analyticsData = null,
    historicalInstances = [],
}) {
    if (analyticsData) return analyticsData;

    const activityDefinition = activityDefinitions.find(
        (activity) => String(activity.id) === String(target?.activity_id)
    ) || null;
    const instances = [...historicalInstances].sort(
        (left, right) => instanceTimestamp(left) - instanceTimestamp(right)
    );

    return {
        target,
        activity_definition: activityDefinition,
        instances,
        summary: {
            created_at: target?.created_at || null,
            total_count: instances.length,
            last_instance_at: instances.at(-1)?.session_date || null,
            days_since_created: null,
            conditions: [],
            completed: Boolean(target?.completed),
            completed_at: target?.completed_at || null,
        },
    };
}
