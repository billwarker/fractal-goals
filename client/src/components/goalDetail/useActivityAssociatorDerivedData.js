import { useCallback, useMemo } from 'react';

import { sortGroupsTreeOrder, getGroupBreadcrumb as sharedGetGroupBreadcrumb } from '../../utils/manageActivities';

export function useActivityAssociatorDerivedData({
    activityGroups,
    associatedActivities,
    associatedActivityGroups,
    fetchedParentActivities,
    inheritFromParent,
    inheritedActivityIds,
    parentGoalId,
}) {
    const getGroupDepth = useCallback((groupId) => {
        let depth = 0;
        let currentId = groupId;
        const seen = new Set();
        while (currentId) {
            if (seen.has(currentId)) break;
            seen.add(currentId);
            const group = (activityGroups || []).find((candidate) => candidate.id === currentId);
            if (!group || !group.parent_id) break;
            depth++;
            currentId = group.parent_id;
        }
        return depth;
    }, [activityGroups]);

    const groupBreadcrumb = useCallback(
        (groupId) => sharedGetGroupBreadcrumb(groupId, activityGroups || []),
        [activityGroups]
    );

    const eligibleParentGroups = useMemo(
        () => sortGroupsTreeOrder((activityGroups || []).filter((group) => getGroupDepth(group.id) < 2)),
        [activityGroups, getGroupDepth]
    );

    const groupsById = useMemo(() => {
        const map = new Map();
        (activityGroups || []).forEach((group) => map.set(group.id, group));
        return map;
    }, [activityGroups]);

    const displayActivities = useMemo(() => {
        const inheritedIdsSet = new Set(inheritedActivityIds);
        const parentInheritedIdsSet = new Set((fetchedParentActivities || []).map((activity) => activity.id));
        const materializedActivities = (associatedActivities || []).map((activity) => {
            const hasDirectAssociation = activity.has_direct_association !== false;
            const inheritedFromChildren = Boolean(activity.inherited_from_children);
            const inheritedFromParent = Boolean(activity.inherited_from_parent)
                || inheritedIdsSet.has(activity.id)
                || (inheritFromParent && parentInheritedIdsSet.has(activity.id));
            const isInheritedOnly = !hasDirectAssociation && (inheritedFromChildren || inheritedFromParent);

            return {
                ...activity,
                has_direct_association: hasDirectAssociation,
                inherited_from_children: inheritedFromChildren,
                inherited_from_parent: inheritedFromParent,
                inherited_source_goal_names: activity.inherited_source_goal_names || [],
                inherited_source_goal_ids: activity.inherited_source_goal_ids || [],
                is_inherited: isInheritedOnly,
                source_goal_name: inheritedIdsSet.has(activity.id)
                    ? 'Parent Goal'
                    : activity.source_goal_name,
                source_goal_id: inheritedIdsSet.has(activity.id)
                    ? (parentGoalId || activity.source_goal_id || null)
                    : activity.source_goal_id,
            };
        });

        if (!inheritFromParent || (fetchedParentActivities || []).length === 0) {
            return materializedActivities;
        }

        const existing = new Set((associatedActivities || []).map((activity) => activity.id));
        const inherited = (fetchedParentActivities || [])
            .filter((activity) => !existing.has(activity.id))
            .map((activity) => ({
                ...activity,
                is_inherited: true,
                inherited_from_parent: true,
                inherited_from_children: Boolean(activity.inherited_from_children),
                inherited_source_goal_names: activity.inherited_source_goal_names || [],
                inherited_source_goal_ids: activity.inherited_source_goal_ids || [],
                source_goal_name: 'Parent Goal',
                source_goal_id: parentGoalId || null,
            }));

        return [...materializedActivities, ...inherited];
    }, [
        associatedActivities,
        fetchedParentActivities,
        inheritFromParent,
        inheritedActivityIds,
        parentGoalId,
    ]);

    const { roots, ungrouped } = useMemo(() => {
        const relevantGroupIds = new Set();
        (associatedActivityGroups || []).forEach((group) => relevantGroupIds.add(group.id));
        displayActivities.forEach((activity) => {
            if (activity.group_id) relevantGroupIds.add(activity.group_id);
        });

        const addParents = (groupId) => {
            const group = (activityGroups || []).find((candidate) => candidate.id === groupId);
            if (group && group.parent_id) {
                relevantGroupIds.add(group.parent_id);
                addParents(group.parent_id);
            }
        };

        [...relevantGroupIds].forEach((groupId) => addParents(groupId));

        const relevantGroups = (activityGroups || []).filter((group) => relevantGroupIds.has(group.id));
        const map = {};
        relevantGroups.forEach((group) => {
            map[group.id] = { ...group, children: [], activities: [] };
        });

        const nextUngrouped = { id: 'ungrouped', name: 'Ungrouped', children: [], activities: [] };

        displayActivities.forEach((activity) => {
            if (activity.group_id && map[activity.group_id]) {
                map[activity.group_id].activities.push(activity);
            } else {
                nextUngrouped.activities.push(activity);
            }
        });

        const nextRoots = [];
        relevantGroups.forEach((group) => {
            if (group.parent_id && map[group.parent_id]) {
                map[group.parent_id].children.push(map[group.id]);
            } else {
                nextRoots.push(map[group.id]);
            }
        });

        nextRoots.sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0));
        Object.values(map).forEach((group) => {
            group.children.sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0));
        });

        const attachTotalCount = (node) => {
            node.totalCount = node.activities.length
                + node.children.reduce((sum, child) => sum + attachTotalCount(child), 0);
            return node.totalCount;
        };
        nextRoots.forEach(attachTotalCount);

        return { roots: nextRoots, ungrouped: nextUngrouped };
    }, [activityGroups, associatedActivityGroups, displayActivities]);

    const counts = useMemo(() => {
        let direct = 0;
        let inheritedFromChildren = 0;
        let inheritedFromParent = 0;
        let total = 0;

        const countActivity = (activity) => {
            total++;
            if (activity.has_direct_association !== false) direct++;
            if (activity.inherited_from_children) inheritedFromChildren++;
            if (activity.inherited_from_parent) inheritedFromParent++;
        };

        const countInNode = (node) => {
            node.activities.forEach(countActivity);
            node.children.forEach(countInNode);
        };

        roots.forEach(countInNode);
        ungrouped.activities.forEach(countActivity);

        return {
            total,
            direct,
            inheritedFromChildren,
            inheritedFromParent,
        };
    }, [roots, ungrouped]);

    return {
        counts,
        displayActivities,
        eligibleParentGroups,
        getGroupDepth,
        groupBreadcrumb,
        groupsById,
        roots,
        ungrouped,
    };
}
