import React, { useMemo } from 'react';

import GoalHierarchySelectionModal from '../goals/GoalHierarchySelectionModal';
import { useViewGoals } from '../../hooks/useGoalCharts';
import { useFractalTree } from '../../hooks/useGoalQueries';
import { flattenGoalTree } from '../../utils/goalNodeModel';

const NO_IDS = [];

/** "Add to goal…": choose the goals a saved view shows on; its current goals start checked. */
export default function AddViewToGoalsModal({ rootId, view, isOpen, onClose }) {
    const { data: tree } = useFractalTree(rootId, { enabled: isOpen });
    const viewGoals = useViewGoals(rootId, view?.id, { enabled: isOpen });
    const goals = useMemo(() => flattenGoalTree(tree, { includeRoot: true }), [tree]);
    const selectedGoalIds = useMemo(
        () => (viewGoals.data?.goals ? viewGoals.data.goals.map((goal) => goal.goal_id) : NO_IDS),
        [viewGoals.data],
    );

    return (
        <GoalHierarchySelectionModal
            isOpen={isOpen && !viewGoals.isLoading}
            onClose={onClose}
            title={`Show “${view?.name || 'view'}” on goals`}
            goals={goals}
            selectedGoalIds={selectedGoalIds}
            selectionMode="multiple"
            searchPlaceholder="Search goals..."
            emptyState="No goals available."
            highlightSelectionAncestors
            connectorHighlightMode="lineage"
            showGoalHighlightHalo
            confirmLabel="Save"
            onConfirm={(goalIds) => viewGoals.setGoals(goalIds)}
        />
    );
}
