import React from 'react';

import { flattenGoals } from '../../utils/goalHelpers';
import { buildActivityPickerModel } from '../activityPicker';
import GoalHierarchySelectionModal from '../goals/GoalHierarchySelectionModal';
import ActivityFilterModal from './ActivityFilterModal';

/** Goal and activity filter pickers shared by the Sessions and Notes pages. */

/** Every goal in a fractal tree, in tree order, as the goal picker expects. */
export const goalFilterOptions = (tree) => flattenGoals(tree ? [tree] : []);

export function GoalFilterModal({ isOpen, goals, selectedGoalIds, onConfirm, onClose }) {
    return (
        <GoalHierarchySelectionModal
            isOpen={isOpen}
            title="Filter By Goal"
            goals={goals}
            selectedGoalIds={selectedGoalIds}
            selectionMode="multiple"
            searchPlaceholder="Search goals"
            emptyState="No goals available."
            connectorHighlightMode="bulk"
            showGoalHighlightHalo
            onClose={onClose}
            onConfirm={onConfirm}
        />
    );
}

/**
 * The groups to show as selected: every group whose activities (subgroups included) are all selected,
 * leaving out a subgroup when its parent group is selected too.
 */
export function fullySelectedGroupIds(activities = [], activityGroups = [], selectedActivityIds = []) {
    const selected = new Set(selectedActivityIds);
    if (!selected.size) return [];
    const model = buildActivityPickerModel(activities, activityGroups);
    const full = new Set(activityGroups.map((group) => group.id).filter((groupId) => {
        const ids = model.getActivityIdsForGroup(groupId);
        return ids.length > 0 && ids.every((id) => selected.has(id));
    }));
    return activityGroups
        .filter((group) => full.has(group.id) && !full.has(group.parent_id))
        .map((group) => group.id);
}

/**
 * Filter by activities, or by whole groups: selecting a group selects every activity in it and its
 * subgroups, and the filter keeps those activities.
 */
export function ActivityFilterPicker({ activities, activityGroups, selectedActivityIds, onConfirm, onClose }) {
    return (
        <ActivityFilterModal
            title="Filter By Activity"
            activities={activities}
            activityGroups={activityGroups}
            initialActivityIds={selectedActivityIds}
            initialGroupIds={fullySelectedGroupIds(activities, activityGroups, selectedActivityIds)}
            selectionMode="multiple"
            allowGroupSelection
            groupSelectionLabel="Select all"
            groupSelectedLabel="All selected"
            confirmLabel="Apply"
            onClose={onClose}
            onConfirm={(selectedIds) => onConfirm(selectedIds)}
        />
    );
}
