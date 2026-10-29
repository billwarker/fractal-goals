import React from 'react';

import { describeNextReview, REVIEW_CADENCE_UNITS } from '../../utils/goalReview';
import styles from './GoalReviewCadence.module.css';

/**
 * Editing a goal's review schedule (SMART's R): a "Review this goal" checkbox; when on, the goal's
 * own cadence (empty = the level's; picking the level's cadence clears it), and when the next review
 * falls under it, counted from the last review (else the start date) with paused days left out.
 */
export default function GoalReviewCadence({
    review = null, today, startedAt = null, createdAt = null, paused = false,
    enabled = true, onEnabledChange, cadence = null, levelCadence = null, onChange,
}) {
    const shown = cadence || levelCadence || { value: 1, unit: 'months' };
    const set = (patch) => {
        const picked = { ...shown, ...patch };
        const isLevel = levelCadence && picked.value === levelCadence.value && picked.unit === levelCadence.unit;
        onChange(isLevel ? null : picked);
    };
    const toggle = onEnabledChange ? (
        <label className={styles.toggle}>
            <input type="checkbox" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} />
            Review this goal
        </label>
    ) : null;
    if (!enabled) return <span className={styles.settings}>{toggle}</span>;
    const next = describeNextReview({ cadence: shown, review, startedAt, createdAt, paused, today });
    return (
        <span className={styles.settings}>
            {toggle}
            <span className={styles.editor} role="group" aria-label="Review cadence">
                <span>{toggle ? 'every' : 'Review every'}</span>
                <input
                    type="number"
                    min={1}
                    max={999}
                    value={shown.value}
                    aria-label="Review cadence amount"
                    onChange={(event) => set({ value: Math.max(1, Number.parseInt(event.target.value, 10) || 1) })}
                    className={styles.amount}
                />
                <select
                    value={shown.unit}
                    aria-label="Review cadence unit"
                    onChange={(event) => set({ unit: event.target.value })}
                    className={styles.unit}
                >
                    {REVIEW_CADENCE_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                </select>
                {cadence ? null : <span className={styles.note}>(level default)</span>}
            </span>
            {next ? <span className={styles.next} data-testid="goal-next-review">{next}</span> : null}
        </span>
    );
}
