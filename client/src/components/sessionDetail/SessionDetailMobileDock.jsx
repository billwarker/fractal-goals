import React from 'react';

import styles from '../../pages/SessionDetail.module.css';

function SessionDetailMobileDock({
    sidePaneMode,
    onModeSelect,
}) {
    return (
        <div className={styles.mobileBottomDock}>
            {['details', 'goals', 'history'].map((modeOption) => (
                <button
                    key={modeOption}
                    type="button"
                    className={`${styles.mobileDockTab} ${sidePaneMode === modeOption ? styles.mobileDockTabActive : ''}`}
                    onClick={() => onModeSelect(modeOption)}
                >
                    {modeOption.charAt(0).toUpperCase() + modeOption.slice(1)}
                </button>
            ))}
        </div>
    );
}

export default SessionDetailMobileDock;
