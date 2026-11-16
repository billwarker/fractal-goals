import React, { Suspense } from 'react';

import { useGoals } from '../../contexts/GoalsContext';
import { useFractalTree } from '../../hooks/useGoalQueries';
import { findGoalNodeById } from '../../utils/goalNodeModel';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

const GoalDetailModal = lazyWithRetry(() => import('../ConnectedGoalDetailModal'), 'components/ConnectedGoalDetailModal');

/**
 * A note's goal, opened over a notes feed. With `reviewNote`, it opens on that review's form to edit the
 * answers and closes once the edit is saved or cancelled. `initialView` opens another view of the goal,
 * such as `completion-note`.
 */
export default function NoteGoalModal({ rootId, goalId, reviewNote = null, initialView = null, onClose }) {
    const { updateGoal, toggleGoalCompletion } = useGoals();
    const { data: tree } = useFractalTree(rootId);
    const goal = tree ? findGoalNodeById(tree, goalId) : null;
    if (!goal) return null;
    return (
        <Suspense fallback={null}>
            <GoalDetailModal
                isOpen
                goal={goal}
                rootId={rootId}
                treeData={tree}
                displayMode="modal"
                initialView={initialView || (reviewNote ? 'goal-review' : 'goal')}
                initialReviewNote={reviewNote}
                onUpdate={(id, updates) => updateGoal(rootId, id, updates)}
                onToggleCompletion={(id, currentStatus, sequenceOptions = null) => (
                    toggleGoalCompletion(rootId, id, !currentStatus, sequenceOptions)
                )}
                onClose={onClose}
            />
        </Suspense>
    );
}
