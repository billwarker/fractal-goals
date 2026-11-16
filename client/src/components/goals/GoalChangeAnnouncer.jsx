import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { queryKeys } from '../../hooks/queryKeys';
import { getTypeDisplayName } from '../../utils/goalHelpers';
import { subscribeGoalChanges } from '../../utils/goalChanges';
import NoteGoalModal from '../goalDetail/NoteGoalModal';
import styles from './GoalChangeAnnouncer.module.css';

const TOAST_MS = 6000;

const label = (goal) => `${goal?.type ? getTypeDisplayName(goal.type) : 'Goal'}: ${goal?.name || 'Goal'}`;

/**
 * Says when a change completes a goal by its condition (or no longer does), wherever the change was
 * made: a session, a quick session, or one that synced later. A completion offers to write its note.
 */
export default function GoalChangeAnnouncer() {
    const queryClient = useQueryClient();
    const [noteGoal, setNoteGoal] = useState(null);

    useEffect(() => subscribeGoalChanges(({ rootId, completed, uncompleted }) => {
        [queryKeys.fractalTree(rootId), queryKeys.goalsTree(rootId), queryKeys.goals(rootId), queryKeys.goalConditionRoot(rootId)]
            .forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
        // A toast id per goal and state: the same announcement twice (a retry) shows once.
        completed.forEach((goal) => toast.success((current) => (
            <span className={styles.message}>
                <span>Completed — {label(goal)}</span>
                <button
                    type="button"
                    className={styles.action}
                    onClick={() => {
                        toast.dismiss(current.id);
                        setNoteGoal({ rootId, goalId: goal.id });
                    }}
                >
                    Write note
                </button>
            </span>
        ), { id: `goal-completed-${goal.id}`, duration: TOAST_MS }));
        uncompleted.forEach((goal) => toast.success(`No longer complete — ${label(goal)}`, {
            id: `goal-uncompleted-${goal.id}`, duration: TOAST_MS,
        }));
    }), [queryClient]);

    if (!noteGoal) return null;
    return (
        <NoteGoalModal
            rootId={noteGoal.rootId}
            goalId={noteGoal.goalId}
            initialView="completion-note"
            onClose={() => setNoteGoal(null)}
        />
    );
}
