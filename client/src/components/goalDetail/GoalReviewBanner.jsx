import React from 'react';

import { describeCadence } from '../../utils/goalReview';
import Button from '../atoms/Button';
import styles from './GoalReviewBanner.module.css';

/** "Review due" at the top of a goal's details, with a way to write the review. */
export default function GoalReviewBanner({ review, onReview, isSaving = false }) {
    return (
        <div className={styles.banner} role="region" aria-label="Review due">
            <div className={styles.text}>
                <strong>Review due</strong>
                <span>Reviewed {describeCadence(review?.cadence)}. Look back at the goal and what’s changed.</span>
            </div>
            <div className={styles.actions}>
                <Button size="sm" onClick={onReview} disabled={isSaving}>Review</Button>
            </div>
        </div>
    );
}
