import React from 'react';

import Button from '../atoms/Button';
import styles from './AnalyticsTopBar.module.css';

function AnalyticsTopBar({
    currentViewName = 'Empty Analytics View',
    onOpenViewsModal,
    onSaveView,
    isFiltersPaneOpen = false,
    onToggleFiltersPane,
}) {
    return (
        <div className={styles.topBar}>
            <div className={styles.viewSection}>
                <div className={styles.viewMeta}>
                    <h1 className={styles.pageTitle}>{currentViewName}</h1>
                </div>
                <div className={styles.actions}>
                    <Button variant="secondary" size="sm" onClick={onOpenViewsModal}>
                        Other Views
                    </Button>
                    <Button variant="primary" size="sm" onClick={onSaveView}>
                        Save View
                    </Button>
                </div>
            </div>

            <div className={styles.rightActions}>
                <Button variant="secondary" size="sm" onClick={onToggleFiltersPane}>
                    {isFiltersPaneOpen ? 'Hide Filters' : 'Show Filters'}
                </Button>
            </div>
        </div>
    );
}

export default AnalyticsTopBar;
