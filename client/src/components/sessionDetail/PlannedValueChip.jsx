import React from 'react';

import { PLAN_STATE_MET, PLAN_STATE_UNDER } from '../../utils/sessionPrescription';
import styles from './SessionActivityItem.module.css';

const STATE_TEXT = {
    [PLAN_STATE_MET]: 'met',
    [PLAN_STATE_UNDER]: 'under plan',
};

/** "plan 105" beside a metric input; coloured once a value is entered. */
export default function PlannedValueChip({ label, state }) {
    const stateClassName = state === PLAN_STATE_MET
        ? styles.plannedValueMet
        : state === PLAN_STATE_UNDER
            ? styles.plannedValueUnder
            : '';
    const stateText = STATE_TEXT[state];
    return (
        <span
            className={`${styles.plannedValue} ${stateClassName}`}
            title={stateText ? `Planned ${label} · ${stateText}` : `Planned ${label}`}
        >
            plan {label}
            {stateText && <span className={styles.visuallyHidden}>, {stateText}</span>}
        </span>
    );
}
