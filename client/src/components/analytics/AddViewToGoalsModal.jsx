import React, { useMemo } from 'react';

import Modal from '../atoms/Modal';
import Button from '../atoms/Button';
import GoalHierarchySelectionModal from '../goals/GoalHierarchySelectionModal';
import { useAnalyticsViews } from '../../hooks/useDashboardQueries';
import { MAX_CHARTS_PER_GOAL, useViewGoals } from '../../hooks/useGoalCharts';
import { useFractalTree } from '../../hooks/useGoalQueries';
import { flattenGoalTree } from '../../utils/goalNodeModel';
import styles from './SavedAnalyticsModal.module.css';

/**
 * The newly chosen goals that already show the most charts a goal can, counted from the saved
 * views list (each view names the goals it's on).
 */
export function goalChartCounts(views) {
    const counts = new Map();
    views.forEach((view) => (view.goals || []).forEach((goal) => counts.set(goal.id, (counts.get(goal.id) || 0) + 1)));
    return counts;
}

export function fullGoals(views, chosenIds, currentIds) {
    const counts = goalChartCounts(views);
    const current = new Set(currentIds);
    return chosenIds.filter((goalId) => !current.has(goalId) && (counts.get(goalId) || 0) >= MAX_CHARTS_PER_GOAL);
}

const NO_IDS = [];

/**
 * "Add to goal…": choose the goals a saved view shows on; its current goals start checked. Goals
 * already at the chart limit are disabled; existing links remain removable.
 */
export default function AddViewToGoalsModal({ rootId, view, isOpen, onClose }) {
    const treeQuery = useFractalTree(rootId, { enabled: isOpen });
    const savedQuery = useAnalyticsViews(isOpen ? rootId : null);
    const viewGoals = useViewGoals(rootId, view?.id, { enabled: isOpen });
    const goals = useMemo(() => flattenGoalTree(treeQuery.data, { includeRoot: true }), [treeQuery.data]);
    const selectedGoalIds = useMemo(
        () => (viewGoals.data?.goals ? viewGoals.data.goals.map((goal) => goal.goal_id) : NO_IDS),
        [viewGoals.data],
    );

    const counts = useMemo(() => goalChartCounts(savedQuery.analyticsViews), [savedQuery.analyticsViews]);
    const unavailable = (goal) => !selectedGoalIds.includes(goal?.id) && (counts.get(goal?.id) || 0) >= MAX_CHARTS_PER_GOAL
        ? 'Already shows 12 charts; remove one first' : null;
    const failed = treeQuery.isError || viewGoals.isError || savedQuery.error;
    const loading = treeQuery.isLoading || viewGoals.isLoading || savedQuery.isLoading;
    if (isOpen && (failed || loading)) return (
        <Modal isOpen onClose={onClose} title="Show on goals">
            {failed ? <div role="alert">Couldn’t load goals and chart capacity. Close and try again.</div> : <p role="status">Loading goals and chart capacity…</p>}
            <Button variant="secondary" onClick={onClose}>Close</Button>
        </Modal>
    );

    return (
        <GoalHierarchySelectionModal
            isOpen={isOpen}
            onClose={onClose}
            title={`Show “${view?.name || 'view'}” on goals`}
            goals={goals}
            selectedGoalIds={selectedGoalIds}
            selectionMode="multiple"
            getGoalDisabledReason={unavailable}
            getGoalSelectionMeta={(goal) => {
                const count = counts.get(goal.id) || 0;
                return <span className={styles.chartRatio} title={`Shows ${count} of ${MAX_CHARTS_PER_GOAL} charts`}>{count}/{MAX_CHARTS_PER_GOAL}</span>;
            }}
            searchPlaceholder="Search goals..."
            emptyState="No goals available."
            highlightSelectionAncestors
            connectorHighlightMode="lineage"
            showGoalHighlightHalo
            confirmLabel="Save"
            onConfirm={(goalIds) => {
                if (fullGoals(savedQuery.analyticsViews, goalIds, selectedGoalIds).length) {
                    throw new Error('A selected goal already shows 12 charts. Remove one first.');
                }
                return viewGoals.setGoals(goalIds);
            }}
        />
    );
}
