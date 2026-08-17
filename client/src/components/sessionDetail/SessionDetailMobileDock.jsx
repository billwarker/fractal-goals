import React from 'react';

import styles from '../../pages/SessionDetail.module.css';

function SessionDetailMobileDock({
    sidePaneMode,
    onModeSelect,
}) {
    const modes = ['details', 'timeline'];

    return (
        <footer className={styles.mobileBottomDock} aria-label="Session detail views">
            {modes.map((modeOption) => (
                <button
                    key={modeOption}
                    type="button"
                    className={`${styles.mobileDockTab} ${sidePaneMode === modeOption ? styles.mobileDockTabActive : ''}`}
                    onClick={() => onModeSelect(modeOption)}
                    aria-pressed={sidePaneMode === modeOption}
                >
                    {modeOption.charAt(0).toUpperCase() + modeOption.slice(1)}
                </button>
            ))}
        </footer>
    );
}

export default SessionDetailMobileDock;
