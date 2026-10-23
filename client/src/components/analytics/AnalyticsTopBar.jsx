import React, { Suspense, lazy, useState } from 'react';

import Button from '../atoms/Button';
import { viewAttachProblem } from '../../hooks/useGoalCharts';
import styles from './AnalyticsTopBar.module.css';

const AddViewToGoalsModal = lazy(() => import('./AddViewToGoalsModal'));

function AnalyticsTopBar({
    currentViewName = 'Empty Analytics View',
    activeMode = 'dashboard',
    onModeChange,
    onOpenViewsModal,
    onSaveView,
    rootId = null,
    savedView = null,
    isFiltersPaneOpen = false,
    onToggleFiltersPane,
    showQueryConsole = true,
    showFiltersToggle = true,
}) {
    const [isAddToGoalOpen, setIsAddToGoalOpen] = useState(false);
    const addToGoalProblem = savedView ? viewAttachProblem(savedView) : null;
    return (
        <div className={styles.topBar}>
            <div className={styles.viewSection}>
                <div className={styles.viewMeta}>
                    <h1 className={styles.pageTitle}>{activeMode === 'query' ? 'Query Console' : currentViewName}</h1>
                </div>
                {activeMode === 'dashboard' && (
                    <div className={styles.actions}>
                        <Button variant="secondary" size="sm" onClick={onOpenViewsModal}>
                            Saved Analytics
                        </Button>
                        {savedView ? (
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setIsAddToGoalOpen(true)}
                                disabled={Boolean(addToGoalProblem)}
                                title={addToGoalProblem || 'Show this view on goals'}
                            >
                                Add to goal…
                            </Button>
                        ) : null}
                        <Button variant="primary" size="sm" onClick={onSaveView}>
                            Save
                        </Button>
                    </div>
                )}
            </div>

            <div className={styles.rightActions}>
                {showQueryConsole && (
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
                )}
                {activeMode === 'dashboard' && showFiltersToggle && (
                    <Button variant="secondary" size="sm" onClick={onToggleFiltersPane}>
                        {isFiltersPaneOpen ? 'Hide Filters' : 'Show Filters'}
                    </Button>
                )}
            </div>
            {isAddToGoalOpen && savedView ? (
                <Suspense fallback={null}>
                    <AddViewToGoalsModal rootId={rootId} view={savedView} isOpen onClose={() => setIsAddToGoalOpen(false)} />
                </Suspense>
            ) : null}
        </div>
    );
}

export default AnalyticsTopBar;
