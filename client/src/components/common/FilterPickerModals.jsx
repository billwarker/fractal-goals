import React from 'react';

import { flattenGoals } from '../../utils/goalHelpers';
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

export function ActivityFilterPicker({ activities, activityGroups, selectedActivityIds, onConfirm, onClose }) {
    return (
        <ActivityFilterModal
            title="Filter By Activity"
            activities={activities}
            activityGroups={activityGroups}
            initialActivityIds={selectedActivityIds}
            selectionMode="multiple"
            allowGroupSelection={false}
            confirmLabel="Apply"
            onClose={onClose}
            onConfirm={(selectedIds) => onConfirm(selectedIds)}
        />
    );
}
