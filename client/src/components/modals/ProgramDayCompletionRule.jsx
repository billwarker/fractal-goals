import React from 'react';

import styles from './ProgramDayModal.module.css';

/**
 * "At least N of M completed", counting the day's sessions and activities together, and the
 * day's rule in words. `minimum` is '' when off.
 */
export default function ProgramDayCompletionRule({ minimum, onMinimumChange, itemCount, summary }) {
    if (!itemCount) return null;
    return (
        <div className={styles.field}>
            <span className={styles.label}>Completion</span>
            <div className={styles.completionRuleRow}>
                <label className={styles.checkboxLabel}>
                    <input
                        type="checkbox"
                        checked={minimum !== ''}
                        onChange={(event) => onMinimumChange(event.target.checked ? '1' : '')}
                        className={styles.checkbox}
                    />
                    <span>At least</span>
                </label>
                <input
                    type="number"
                    min="1"
                    max={itemCount}
                    disabled={minimum === ''}
                    value={minimum}
                    onChange={(event) => {
                        const { value } = event.target;
                        onMinimumChange(value === '' ? '' : String(Math.max(1, Math.min(Number(value) || 1, itemCount))));
                    }}
                    className={styles.minTemplatesInput}
                    aria-label="Minimum completed sessions and activities"
                />
                <span className={styles.completionRuleText}>
                    of {itemCount} {itemCount === 1 ? 'item' : 'sessions and activities'} completed
                </span>
            </div>
            <div className={styles.hint}>{summary}</div>
        </div>
    );
}
