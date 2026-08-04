import { useMemo } from 'react';


const ROOT_GROUP = '__root__';
const UNGROUPED = '__ungrouped__';

function buildGroupChildrenMap(activityGroups) {
    const map = new Map();
    activityGroups.forEach((group) => {
        const key = group.parent_id || ROOT_GROUP;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(group);
    });
    map.forEach((groups) => groups.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
    return map;
}

function buildItemsByGroupMap(items) {
    const map = new Map();
    items.forEach((item) => {
        const key = item.group_id || UNGROUPED;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(item);
    });
    return map;
}

function populatedGroupBranches(activityGroups, items) {
    const groupById = new Map(activityGroups.map((group) => [group.id, group]));
    const populatedIds = new Set();

    items.forEach((item) => {
        let groupId = item.group_id;
        const visited = new Set();
        while (groupId && !visited.has(groupId)) {
            visited.add(groupId);
            const group = groupById.get(groupId);
            if (!group) break;
            populatedIds.add(group.id);
            groupId = group.parent_id;
        }
    });

    return activityGroups.filter((group) => populatedIds.has(group.id));
}

export default function useManageActivitiesCatalogue({
    items,
    activityGroups,
    searchTerm,
    includeEmptyGroups = true,
}) {
    return useMemo(() => {
        const safeItems = Array.isArray(items) ? items : [];
        const allGroups = Array.isArray(activityGroups) ? activityGroups : [];
        const safeGroups = includeEmptyGroups ? allGroups : populatedGroupBranches(allGroups, safeItems);
        const groupChildrenMap = buildGroupChildrenMap(safeGroups);
        const itemsByGroupMap = buildItemsByGroupMap(safeItems);
        const query = searchTerm.trim().toLowerCase();

        if (!query) {
            return {
                groupChildrenMap,
                itemsByGroupMap,
                rootGroups: groupChildrenMap.get(ROOT_GROUP) || [],
                hasSearch: false,
                resultCount: safeItems.length + safeGroups.length,
            };
        }

        const groupById = new Map(safeGroups.map((group) => [group.id, group]));
        const directGroupMatches = new Set();
        const visibleGroupIds = new Set();
        const groupScopeMatches = new Set();
        const addAncestors = (groupId) => {
            let current = groupById.get(groupId);
            while (current) {
                visibleGroupIds.add(current.id);
                current = current.parent_id ? groupById.get(current.parent_id) : null;
            }
        };
        const addDescendants = (groupId) => {
            groupScopeMatches.add(groupId);
            visibleGroupIds.add(groupId);
            (groupChildrenMap.get(groupId) || []).forEach((child) => addDescendants(child.id));
        };

        safeGroups.forEach((group) => {
            if ((group.name || '').toLowerCase().includes(query)) {
                directGroupMatches.add(group.id);
                addAncestors(group.id);
                addDescendants(group.id);
            }
        });

        let resultCount = directGroupMatches.size;
        const filterItems = (items) => {
            const filtered = new Map();
            items.forEach((item) => {
                const groupId = item.group_id || UNGROUPED;
                const itemMatches = (item.name || '').toLowerCase().includes(query);
                const groupMatches = item.group_id && groupScopeMatches.has(item.group_id);
                if (!itemMatches && !groupMatches) return;
                if (!filtered.has(groupId)) filtered.set(groupId, []);
                filtered.get(groupId).push(item);
                resultCount += itemMatches ? 1 : 0;
                if (item.group_id) addAncestors(item.group_id);
            });
            return filtered;
        };
        const filteredItems = filterItems(safeItems);
        const filteredChildren = new Map();
        visibleGroupIds.forEach((groupId) => {
            const group = groupById.get(groupId);
            if (!group) return;
            const parentKey = group.parent_id && visibleGroupIds.has(group.parent_id)
                ? group.parent_id
                : ROOT_GROUP;
            if (!filteredChildren.has(parentKey)) filteredChildren.set(parentKey, []);
            filteredChildren.get(parentKey).push(group);
        });
        filteredChildren.forEach((groups) => groups.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));

        return {
            groupChildrenMap: filteredChildren,
            itemsByGroupMap: filteredItems,
            rootGroups: filteredChildren.get(ROOT_GROUP) || [],
            hasSearch: true,
            resultCount,
        };
    }, [items, activityGroups, searchTerm, includeEmptyGroups]);
}
