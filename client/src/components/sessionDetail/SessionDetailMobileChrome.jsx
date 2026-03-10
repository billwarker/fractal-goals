import React from 'react';

import { formatClockDuration } from '../../utils/sessionTime';
import styles from '../../pages/SessionDetail.module.css';

function SessionDetailMobileChrome({
    sessionName,
    isCompleted,
    totalDuration,
    selectedModeLabel,
    onOpenPane,
}) {
    return (
        <div className={styles.mobileSessionHeader}>
            <div className={styles.mobileSessionTitleRow}>
                <h1 className={styles.mobileSessionTitle}>{sessionName || 'Session'}</h1>
                <span className={`${styles.mobileSessionStatus} ${isCompleted ? styles.mobileSessionStatusDone : ''}`}>
                    {isCompleted ? 'Complete' : 'In progress'}
                </span>
            </div>
            <div className={styles.mobileSessionMeta}>
                <span>Duration {formatClockDuration(totalDuration)}</span>
                <button
                    type="button"
                    className={styles.mobileOpenPaneButton}
                    onClick={onOpenPane}
                >
                    Open {selectedModeLabel}
                </button>
            </div>
        </div>
    );
}

export default SessionDetailMobileChrome;
