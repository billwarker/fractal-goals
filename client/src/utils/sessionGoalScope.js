export function mergeUniqueIds(existing = [], additions = []) {
    return Array.from(new Set([
        ...(Array.isArray(existing) ? existing : []),
        ...(Array.isArray(additions) ? additions : []),
    ].filter(Boolean).map((id) => String(id))));
}

export function getCurrentSessionInstanceIds(localSessionData) {
    if (!localSessionData || !Array.isArray(localSessionData.sections)) {
        return null;
    }

    return new Set(
        localSessionData.sections
            .flatMap((section) => section?.activity_ids || [])
            .filter(Boolean)
            .map((instanceId) => String(instanceId))
    );
}

export function getCurrentSessionActivityDefIds({
    activityInstances,
    localSessionData,
    sessionGoalsView,
}) {
    const currentSessionInstanceIds = getCurrentSessionInstanceIds(localSessionData);

    if (Array.isArray(activityInstances)) {
        return new Set(
            activityInstances
                .filter((instance) => (
                    !currentSessionInstanceIds
                    || currentSessionInstanceIds.has(String(instance?.id))
                ))
                .map((instance) => instance?.activity_definition_id || instance?.activity_id)
                .filter(Boolean)
                .map((activityId) => String(activityId))
        );
    }

    return new Set(
        (sessionGoalsView?.session_activity_ids || [])
            .filter(Boolean)
            .map((activityId) => String(activityId))
    );
}
