import React from 'react';

import { describeCadence, describeReview, REVIEW_CADENCE_UNITS } from '../../utils/goalReview';
import Button from '../atoms/Button';
import styles from './GoalReviewCadence.module.css';

/**
 * A goal's review schedule (SMART's R): "Review every 3 months · next Jan 12" when
 * viewing. In edit mode, a "Review this goal" checkbox; when on, the goal's own cadence (empty = the
 * level's), with "Use level default".
 */
export default function GoalReviewCadence({
    review, today, editing = false, enabled = true, onEnabledChange, cadence = null, levelCadence = null, onChange,
}) {
    if (!editing) {
        const text = describeReview(review, today);
        return text ? <span className={styles.summary} data-testid="goal-review-cadence">{text}</span> : null;
    }
    const shown = cadence || levelCadence || { value: 1, unit: 'months' };
    const set = (patch) => onChange({ ...shown, ...patch });
    const toggle = onEnabledChange ? (
        <label className={styles.toggle}>
            <input type="checkbox" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} />
            Review this goal
        </label>
    ) : null;
    if (!enabled) return <span className={styles.settings}>{toggle}</span>;
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
                {cadence ? (
                    <Button unstyled className={styles.reset} onClick={() => onChange(null)}>
                        Use level default{levelCadence ? ` (${describeCadence(levelCadence)})` : ''}
                    </Button>
                ) : <span className={styles.note}>(level default)</span>}
            </span>
        </span>
    );
}
