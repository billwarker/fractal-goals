import React from 'react';

import styles from '../../pages/ProgramCalendarPage.module.css';

export default function ProgramDayStatusBulkBar({
    dates, today, pending, onApply, onCancel,
}) {
    const hasFutureDate = dates.some((date) => date > today);
    return (
        <div className={styles.dayStatusBulkBar} role="region" aria-label="Program day status actions">
            <strong aria-live="polite">{dates.length} selected</strong>
            <button
                type="button"
                disabled={!dates.length || hasFutureDate || pending}
                onClick={() => onApply('complete')}
                title={hasFutureDate ? 'Future days cannot be marked complete' : undefined}
                aria-describedby={hasFutureDate ? 'program-status-future-hint' : undefined}
            >Complete</button>
            <button type="button" disabled={!dates.length || pending} onClick={() => onApply('rest')}>Rest</button>
            <button type="button" disabled={!dates.length || pending} onClick={() => onApply('automatic')}>Automatic</button>
            <button type="button" disabled={pending} onClick={onCancel}>Cancel</button>
            {hasFutureDate ? (
                <span id="program-status-future-hint" className={styles.dayStatusSelectionHint}>
                    Future days cannot be marked complete; Rest or Automatic remains available.
                </span>
            ) : null}
        </div>
    );
}
