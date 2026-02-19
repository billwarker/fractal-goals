export function findLastInstantiatedForActivity(sessions = [], activityId) {
    if (!Array.isArray(sessions) || sessions.length === 0 || !activityId) return null;

    const activitySessions = sessions.filter((session) => {
        if (Array.isArray(session.activity_instances)) {
            return session.activity_instances.some(
                (instance) => instance.activity_definition_id === activityId
            );
        }

        const attributes = session.attributes || session;
        const sessionData = attributes.session_data;
        if (!sessionData || !Array.isArray(sessionData.sections)) return false;

        return sessionData.sections.some((section) => (
            Array.isArray(section.exercises) &&
            section.exercises.some((exercise) => exercise.activity_id === activityId)
        ));
    });

    if (activitySessions.length === 0) return null;

    const mostRecent = activitySessions.reduce((latest, current) => {
        const currentStart = new Date(
            current.session_start || current.attributes?.created_at || current.created_at || 0
        );
        const latestStart = new Date(
            latest.session_start || latest.attributes?.created_at || latest.created_at || 0
        );
        return currentStart > latestStart ? current : latest;
    });

    return mostRecent.session_start || mostRecent.attributes?.created_at || mostRecent.created_at || null;
}

export function buildGroupReorderPayload(activityGroups = [], movingGroupId, direction) {
    if (!Array.isArray(activityGroups) || !movingGroupId || !direction) return null;

    const movingGroup = activityGroups.find((group) => group.id === movingGroupId);
    if (!movingGroup || movingGroup.parent_id) return null;

    const rootGroups = activityGroups
        .filter((group) => !group.parent_id)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    const rootIndex = rootGroups.findIndex((group) => group.id === movingGroupId);
    if (rootIndex === -1) return null;
    if (direction === 'up' && rootIndex === 0) return null;
    if (direction === 'down' && rootIndex === rootGroups.length - 1) return null;

    const nextRoots = [...rootGroups];
    const swapIndex = direction === 'up' ? rootIndex - 1 : rootIndex + 1;
    [nextRoots[rootIndex], nextRoots[swapIndex]] = [nextRoots[swapIndex], nextRoots[rootIndex]];

    const childrenByParent = activityGroups.reduce((acc, item) => {
        const key = item.parent_id || '__root__';
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {});

    Object.keys(childrenByParent).forEach((key) => {
        childrenByParent[key].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    });

    const orderedIds = [];
    const visited = new Set();

    const walk = (groupId) => {
        if (!groupId || visited.has(groupId)) return;
        visited.add(groupId);
        orderedIds.push(groupId);
        const children = childrenByParent[groupId] || [];
        children.forEach((child) => walk(child.id));
    };

    nextRoots.forEach((rootGroup) => walk(rootGroup.id));
    activityGroups.forEach((group) => walk(group.id));

    return orderedIds;
}
