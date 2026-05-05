import React from 'react';

import CloseIcon from '../atoms/CloseIcon';
import SessionSidePane from './SessionSidePane';
import styles from '../../pages/SessionDetail.module.css';

function SessionDetailPaneLayout({
    isMobile,
    isMobilePaneOpen,
    onCloseMobilePane,
    selectedModeLabel,
    sidePaneModel,
}) {
    return (
        <>
            <div className={`${styles.sessionSidebarWrapper} ${isMobile ? styles.sessionSidebarHidden : ''}`}>
                <div className={styles.sessionSidebarSticky}>
                    <SessionSidePane model={sidePaneModel} showModeTabs={!isMobile} />
                </div>
            </div>

            {isMobile && isMobilePaneOpen && (
                <div
                    className={styles.mobilePaneOverlay}
                    onClick={onCloseMobilePane}
                    role="presentation"
                >
                    <div
                        className={styles.mobilePaneSheet}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className={styles.mobilePaneHeader}>
                            <div className={styles.mobilePaneTitle}>{selectedModeLabel}</div>
                            <button
                                type="button"
                                className={styles.mobilePaneClose}
                                onClick={onCloseMobilePane}
                                aria-label="Close panel"
                            >
                                <CloseIcon size={16} />
                            </button>
                        </div>
                        <SessionSidePane model={sidePaneModel} showModeTabs={false} embedded />
                    </div>
                </div>
            )}
        </>
    );
}

export default SessionDetailPaneLayout;
