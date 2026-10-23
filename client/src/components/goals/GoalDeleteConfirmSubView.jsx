import React, { useState } from 'react';

import { useGoalSequence } from '../../hooks/useGoalSequenceQueries';
import Button from '../atoms/Button';
import styles from '../GoalDetailModal.module.css';

/**
 * Options → Delete, for every page that shows goal details: one confirmation, typed when the
 * goal has children, and — when the goal is a sequence's active step — whether its next goal
 * begins.
 */
export default function GoalDeleteConfirmSubView({ rootId, goal, goalId, childCount = 0, onBack, onConfirm }) {
    const read = (key) => goal?.[key] ?? goal?.attributes?.[key];
    const isActiveStep = Boolean(read('sequence_track_id')) && !read('completed') && !read('paused');
    const sequenceQuery = useGoalSequence(rootId, goalId, { enabled: isActiveStep });
    const nextStep = isActiveStep ? sequenceQuery.data?.next_step : null;
    const [beginNext, setBeginNext] = useState(true);
    const [typed, setTyped] = useState('');
    const needsTyping = childCount > 0;
    const name = goal?.name ?? goal?.attributes?.name ?? 'this goal';

    return (
        <div className={styles.optionsSubView}>
            <button type="button" onClick={onBack} className={styles.optionsBackButton}>← Back</button>
            <div className={styles.optionsSectionHeader}>Delete goal?</div>
            <div className={styles.optionsSectionHint}>
                {needsTyping
                    ? `“${name}” and its ${childCount} child ${childCount === 1 ? 'goal' : 'goals'} (and their descendants) will be deleted.`
                    : `“${name}” will be deleted.`}
            </div>
            {nextStep ? (
                <label className={styles.sequenceCheckbox}>
                    <input type="checkbox" checked={beginNext} onChange={(event) => setBeginNext(event.target.checked)} />
                    Begin next goal in sequence: <strong>{nextStep.name}</strong>
                </label>
            ) : null}
            {needsTyping ? (
                <label className={styles.optionsSectionHint}>
                    Type <strong>delete</strong> to confirm
                    <input
                        type="text"
                        value={typed}
                        onChange={(event) => setTyped(event.target.value)}
                        className={styles.optionsSearchInput}
                        aria-label="Type delete to confirm"
                    />
                </label>
            ) : null}
            <Button
                unstyled
                className={styles.optionButton}
                style={{ borderColor: 'var(--color-brand-danger)', color: 'var(--color-brand-danger)' }}
                disabled={(needsTyping && typed !== 'delete') || (isActiveStep && sequenceQuery.isLoading)}
                onClick={() => onConfirm(nextStep ? { beginNext } : {})}
            >
                <span className={styles.optionButtonTitle}>Delete Goal</span>
            </Button>
        </div>
    );
}
