import React from 'react';

import ProgramDayStatusMark from './ProgramDayStatusMark';

import styles from '../../pages/ProgramCalendarPage.module.css';

export default function ProgramDayStatusBulkBar({
    dates, scheduledDates = dates, today, pending, onApply, onPlanTimeOff, onCancel,
}) {
    // Day statuses apply only to scheduled dates; time off spans the whole selection.
    const hasFutureDate = scheduledDates.some((date) => date > today);
    const noScheduled = !scheduledDates.length;
    return (
        <div className={styles.dayStatusBulkBar} role="region" aria-label="Program day status actions">
            <strong aria-live="polite">
                {dates.length} selected{scheduledDates.length !== dates.length ? ` · ${scheduledDates.length} scheduled` : ''}
            </strong>
            <button
                type="button"
                disabled={noScheduled || hasFutureDate || pending}
                onClick={() => onApply('complete')}
                title={hasFutureDate ? 'Future days cannot be marked complete' : undefined}
                aria-describedby={hasFutureDate ? 'program-status-future-hint' : undefined}
            ><ProgramDayStatusMark status="complete" size="sm" decorative />Complete</button>
            <button type="button" disabled={noScheduled || pending} onClick={() => onApply('rest')}><ProgramDayStatusMark status="rest" size="sm" decorative />Rest</button>
            <button type="button" disabled={noScheduled || pending} onClick={() => onApply('automatic')}><ProgramDayStatusMark status="scheduled" size="sm" decorative />Automatic</button>
            {onPlanTimeOff ? (
                <button type="button" disabled={!dates.length || pending} onClick={onPlanTimeOff}>Plan event…</button>
            ) : null}
            <button type="button" disabled={pending} onClick={onCancel}>Cancel</button>
            {hasFutureDate ? (
                <span id="program-status-future-hint" className={styles.dayStatusSelectionHint}>
                    Future days cannot be marked complete; Rest or Automatic remains available.
                </span>
            ) : null}
        </div>
    );
}
