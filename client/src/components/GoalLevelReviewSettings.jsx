import React from 'react';

import { REVIEW_CADENCE_UNITS } from '../utils/goalReview';
import styles from './GoalCharacteristicsSettings.module.css';

/**
 * A level's review defaults: whether its goals are reviewed (SMART's R) and how often
 * (blank = no reviews by default).
 */
export default function GoalLevelReviewSettings({ current, onChange }) {
    const usesReviews = Boolean(current.uses_reviews);
    const setCadence = (value, unit) => {
        onChange('review_cadence_value', value);
        onChange('review_cadence_unit', value == null ? null : unit);
    };
    return (
        <div>
            <label className={styles.checkboxLabel}>
                <input
                    type="checkbox"
                    checked={usesReviews}
                    onChange={(event) => onChange('uses_reviews', event.target.checked)}
                    className={styles.pointer}
                />
                Review goals at this level
            </label>
            <label className={styles.inputLabelSecondary}>
                Review Every <span className={styles.subText}>(blank = no reviews)</span>
            </label>
            <div className={styles.flexAlignCenter}>
                <input
                    type="number"
                    placeholder="—"
                    min="1"
                    disabled={!usesReviews}
                    aria-label="Review cadence amount"
                    value={current.review_cadence_value ?? ''}
                    onChange={(event) => setCadence(
                        event.target.value ? Math.max(1, parseInt(event.target.value, 10)) : null,
                        current.review_cadence_unit || 'months',
                    )}
                    className={`${styles.numberInput} ${styles.smallNumberInput}`}
                />
                <select
                    disabled={!usesReviews || current.review_cadence_value == null}
                    aria-label="Review cadence unit"
                    value={current.review_cadence_unit ?? 'months'}
                    onChange={(event) => setCadence(current.review_cadence_value, event.target.value)}
                    className={`${styles.selectInput} ${styles.selectInputSmall}`}
                >
                    {REVIEW_CADENCE_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                </select>
            </div>
        </div>
    );
}
