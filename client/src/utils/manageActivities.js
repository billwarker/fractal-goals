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

export function buildLastInstantiatedMap(sessions = []) {
    const latestByActivity = new Map();
    if (!Array.isArray(sessions) || sessions.length === 0) return latestByActivity;

    sessions.forEach((session) => {
        const sessionTimestamp = session.session_start || session.attributes?.created_at || session.created_at || null;
        if (!sessionTimestamp) return;

        const instanceActivityIds = Array.isArray(session.activity_instances)
            ? session.activity_instances
                .map((instance) => instance.activity_definition_id)
                .filter(Boolean)
            : [];

        const legacyActivityIds = (() => {
            const attributes = session.attributes || session;
            const sessionData = attributes.session_data;
            if (!sessionData || !Array.isArray(sessionData.sections)) return [];
            return sessionData.sections.flatMap((section) => (
                Array.isArray(section.exercises)
                    ? section.exercises.map((exercise) => exercise.activity_id).filter(Boolean)
                    : []
            ));
        })();

        const allActivityIds = [...instanceActivityIds, ...legacyActivityIds];
        allActivityIds.forEach((activityId) => {
            const prev = latestByActivity.get(activityId);
            if (!prev || new Date(sessionTimestamp) > new Date(prev)) {
                latestByActivity.set(activityId, sessionTimestamp);
            }
        });
    });

    return latestByActivity;
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

/**
 * Sort groups in tree order (DFS pre-order) so children appear right after their parent.
 * @param {Array} groups - flat array of activity group objects with `id`, `parent_id`, `sort_order`
 * @returns {Array} - new array sorted in tree-walk order
 */
export function sortGroupsTreeOrder(groups = []) {
    if (!Array.isArray(groups) || groups.length === 0) return [];

    const childrenByParent = {};
    groups.forEach(g => {
        const key = g.parent_id || '__root__';
        if (!childrenByParent[key]) childrenByParent[key] = [];
        childrenByParent[key].push(g);
    });

    // Sort each set of siblings by sort_order
    Object.keys(childrenByParent).forEach(key => {
        childrenByParent[key].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    });

    const result = [];
    const visited = new Set();

    const walk = (parentKey) => {
        const children = childrenByParent[parentKey] || [];
        children.forEach(group => {
            if (visited.has(group.id)) return;
            visited.add(group.id);
            result.push(group);
            walk(group.id);
        });
    };

    walk('__root__');

    // Safety: include any orphans not reached from root
    groups.forEach(g => {
        if (!visited.has(g.id)) result.push(g);
    });

    return result;
}

/**
 * Build a breadcrumb path string for a group (e.g. "Warm Ups - Pickup Music Exercises").
 * @param {string} groupId - the group's ID
 * @param {Array} groups - flat array of all activity groups
 * @returns {string}
 */
export function getGroupBreadcrumb(groupId, groups = []) {
    const parts = [];
    let currentId = groupId;
    const seen = new Set();
    while (currentId) {
        if (seen.has(currentId)) break;
        seen.add(currentId);
        const group = groups.find(g => g.id === currentId);
        if (!group) break;
        parts.unshift(group.name);
        currentId = group.parent_id;
    }
    return parts.join(' - ');
}
