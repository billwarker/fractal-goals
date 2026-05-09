const ROOT_KEY = '__root__';
const UNGROUPED_KEY = '__ungrouped__';

export { ROOT_KEY, UNGROUPED_KEY };

export function sortByOrderThenName(items = []) {
    return [...items].sort((a, b) => {
        if ((a?.sort_order || 0) !== (b?.sort_order || 0)) {
            return (a?.sort_order || 0) - (b?.sort_order || 0);
        }
        return (a?.name || '').localeCompare(b?.name || '');
    });
}

export function buildActivityPickerModel(activities = [], activityGroups = []) {
    const safeActivities = (Array.isArray(activities) ? activities : []).filter(Boolean);
    const safeGroups = (Array.isArray(activityGroups) ? activityGroups : []).filter(Boolean);

    const groupMap = {};
    safeGroups.forEach((group) => {
        groupMap[group.id] = group;
    });

    const normalizedGroups = safeGroups.map((group) => ({
        ...group,
        normalized_parent_id: group.parent_id && groupMap[group.parent_id]
            ? group.parent_id
            : ROOT_KEY,
    }));

    const normalizedGroupMap = {};
    normalizedGroups.forEach((group) => {
        normalizedGroupMap[group.id] = group;
    });

    const childGroupsByParent = {};
    sortByOrderThenName(normalizedGroups).forEach((group) => {
        const parentId = group.normalized_parent_id || ROOT_KEY;
        if (!childGroupsByParent[parentId]) childGroupsByParent[parentId] = [];
        childGroupsByParent[parentId].push(group);
    });

    const activitiesByGroup = {};
    sortByOrderThenName(safeActivities).forEach((activity) => {
        const groupId = activity.group_id && groupMap[activity.group_id]
            ? activity.group_id
            : UNGROUPED_KEY;
        if (!activitiesByGroup[groupId]) activitiesByGroup[groupId] = [];
        activitiesByGroup[groupId].push(activity);
    });

    const recursiveActivityCounts = {};
    const visiting = new Set();
    const computeGroupCount = (groupId) => {
        if (!groupId) return 0;
        if (recursiveActivityCounts[groupId] != null) return recursiveActivityCounts[groupId];
        if (visiting.has(groupId)) return 0;
        visiting.add(groupId);
        const direct = activitiesByGroup[groupId]?.length || 0;
        const nested = (childGroupsByParent[groupId] || [])
            .reduce((sum, child) => sum + computeGroupCount(child.id), 0);
        recursiveActivityCounts[groupId] = direct + nested;
        visiting.delete(groupId);
        return recursiveActivityCounts[groupId];
    };

    normalizedGroups.forEach((group) => computeGroupCount(group.id));

    const getDescendantGroupIds = (groupId) => {
        const ids = [];
        const queue = [groupId];
        const seen = new Set();
        while (queue.length > 0) {
            const current = queue.shift();
            if (!current || seen.has(current)) continue;
            seen.add(current);
            ids.push(current);
            (childGroupsByParent[current] || []).forEach((child) => queue.push(child.id));
        }
        return ids;
    };

    const getActivityIdsForGroup = (groupId, { recursive = true } = {}) => {
        const groupIds = recursive ? getDescendantGroupIds(groupId) : [groupId];
        return groupIds.flatMap((id) => activitiesByGroup[id] || []).map((activity) => activity.id);
    };

    const getBreadcrumb = (groupId) => {
        const crumbs = [];
        let cursor = normalizedGroupMap[groupId];
        const seen = new Set();
        while (cursor && !seen.has(cursor.id)) {
            seen.add(cursor.id);
            crumbs.unshift(cursor);
            const parentId = cursor.normalized_parent_id;
            cursor = parentId && parentId !== ROOT_KEY ? normalizedGroupMap[parentId] : null;
        }
        return crumbs;
    };

    return {
        activities: safeActivities,
        activityGroups: safeGroups,
        groupMap,
        normalizedGroups,
        normalizedGroupMap,
        childGroupsByParent,
        activitiesByGroup,
        recursiveActivityCounts,
        ungroupedActivities: activitiesByGroup[UNGROUPED_KEY] || [],
        getActivityIdsForGroup,
        getBreadcrumb,
    };
}
