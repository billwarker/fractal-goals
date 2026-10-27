import React from 'react';

import { useTimezone } from '../../contexts/TimezoneContext';
import useGoalReviewActions from '../../hooks/useGoalReviewActions';
import { getISOYMDInTimezone } from '../../utils/dateUtils';
import { getGoalReview, isReviewDue } from '../../utils/goalReview';
import Button from '../atoms/Button';
import GoalReviewBanner from './GoalReviewBanner';
import GoalReviewView from './GoalReviewView';
import styles from './GoalReviewBanner.module.css';

/**
 * The top of a goal's details for review levels: "Review due" with its actions, or a way back
 * on when reviews are off. Renders nothing otherwise.
 */
export function GoalReviewPrompt({ rootId, goal, goalId, onReview }) {
    const { timezone } = useTimezone();
    const today = getISOYMDInTimezone(new Date(), timezone || 'UTC');
    const review = getGoalReview(goal);
    const { isSaving, setReviewsOn } = useGoalReviewActions(rootId, goalId);
    if (review?.status === 'off') {
        return (
            <div className={styles.offRow}>
                <span>Reviews are off for this goal.</span>
                <Button unstyled className={styles.inlineAction} disabled={isSaving} onClick={() => setReviewsOn(true)}>
                    Turn on
                </Button>
            </div>
        );
    }
    if (!isReviewDue(review, today)) return null;
    return (
        <GoalReviewBanner review={review} isSaving={isSaving} onReview={onReview} />
    );
}

/** Writing a review; returns to the goal once saved. */
export function GoalReviewComposer({ rootId, goal, goalId, onDone }) {
    const { isSaving, writeReview } = useGoalReviewActions(rootId, goalId);
    return (
        <GoalReviewView
            rootId={rootId}
            goal={goal}
            goalId={goalId}
            isSaving={isSaving}
            onCancel={onDone}
            onSubmit={async (content, attachments) => {
                const saved = await writeReview(content, attachments);
                if (saved) onDone();
                return saved;
            }}
        />
    );
}
