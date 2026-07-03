import React from 'react';

import CloseButton from '../atoms/CloseButton';
import ModalBackdrop from '../atoms/ModalBackdrop';
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
                <ModalBackdrop
                    className={styles.mobilePaneOverlay}
                    onClose={onCloseMobilePane}
                    role="presentation"
                >
                    <div
                        className={styles.mobilePaneSheet}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className={styles.mobilePaneHeader}>
                            <div className={styles.mobilePaneTitle}>{selectedModeLabel}</div>
                            <CloseButton
                                className={styles.mobilePaneClose}
                                onClick={onCloseMobilePane}
                                aria-label="Close panel"
                                size={16}
                            />
                        </div>
                        <SessionSidePane model={sidePaneModel} showModeTabs={false} embedded />
                    </div>
                </ModalBackdrop>
            )}
        </>
    );
}

export default SessionDetailPaneLayout;
