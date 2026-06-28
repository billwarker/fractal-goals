import React from 'react';

import Button from '../atoms/Button';
import styles from './AnalyticsTopBar.module.css';

function AnalyticsTopBar({
    currentViewName = 'Empty Analytics View',
    activeMode = 'dashboard',
    onModeChange,
    onOpenViewsModal,
    onSaveView,
    isFiltersPaneOpen = false,
    onToggleFiltersPane,
}) {
    return (
        <div className={styles.topBar}>
            <div className={styles.viewSection}>
                <div className={styles.viewMeta}>
                    <h1 className={styles.pageTitle}>{activeMode === 'query' ? 'Query Console' : currentViewName}</h1>
                </div>
                {activeMode === 'dashboard' && (
                    <div className={styles.actions}>
                        <Button variant="secondary" size="sm" onClick={onOpenViewsModal}>
                            Other Views
                        </Button>
                        <Button variant="primary" size="sm" onClick={onSaveView}>
                            Save View
                        </Button>
                    </div>
                )}
            </div>

            <div className={styles.rightActions}>
                <div className={styles.modeSwitch} role="tablist" aria-label="Analytics page mode">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeMode === 'dashboard'}
                        className={`${styles.modeButton} ${activeMode === 'dashboard' ? styles.modeButtonActive : ''}`}
                        onClick={() => onModeChange?.('dashboard')}
                    >
                        Dashboard
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeMode === 'query'}
                        className={`${styles.modeButton} ${activeMode === 'query' ? styles.modeButtonActive : ''}`}
                        onClick={() => onModeChange?.('query')}
                    >
                        Query Console
                    </button>
                </div>
                {activeMode === 'dashboard' && (
                    <Button variant="secondary" size="sm" onClick={onToggleFiltersPane}>
                        {isFiltersPaneOpen ? 'Hide Filters' : 'Show Filters'}
                    </Button>
                )}
            </div>
        </div>
    );
}

export default AnalyticsTopBar;
