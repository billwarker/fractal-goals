import React, { Suspense, lazy, useState } from 'react';

import ConfirmationModal from '../ConfirmationModal';
import HeaderButton from '../layout/HeaderButton';
import { viewAttachProblem } from '../../hooks/useGoalCharts';
import styles from './AnalyticsTopBar.module.css';

const AddViewToGoalsModal = lazy(() => import('./AddViewToGoalsModal'));

function AnalyticsTopBar({
    currentViewName = 'Empty Analytics View',
    activeMode = 'dashboard',
    onModeChange,
    onOpenViewsModal,
    onSaveView,
    onCloseView,
    isSavedItemOpen = false,
    hasUnsavedChanges = false,
    rootId = null,
    savedView = null,
    isFiltersPaneOpen = false,
    onToggleFiltersPane,
    showQueryConsole = true,
    showFiltersToggle = true,
}) {
    const [isAddToGoalOpen, setIsAddToGoalOpen] = useState(false);
    const [isConfirmingClose, setIsConfirmingClose] = useState(false);
    const addToGoalProblem = savedView ? viewAttachProblem(savedView) : null;
    // A saved view on goals: saving updates those goals' charts too.
    const viewGoals = savedView?.goals || [];
    const onGoals = `${viewGoals.length} ${viewGoals.length === 1 ? 'goal' : 'goals'}`;
    return (
        <div className={styles.topBar}>
            <div className={styles.viewSection}>
                <div className={styles.viewMeta}>
                    <h1 className={styles.pageTitle}>{activeMode === 'query' ? 'Query Console' : currentViewName}</h1>
                </div>
                {activeMode === 'dashboard' && (savedView || hasUnsavedChanges || isSavedItemOpen) && (
                    <div className={styles.actions}>
                        {savedView ? (
                            <HeaderButton
                                variant="secondary"
                                onClick={() => setIsAddToGoalOpen(true)}
                                disabled={Boolean(addToGoalProblem)}
                                title={addToGoalProblem || 'Show this view on goals'}
                            >
                                Add to goal…
                            </HeaderButton>
                        ) : null}
                        {/* Only once something has changed since the view was opened or saved. */}
                        {hasUnsavedChanges ? (
                            <HeaderButton
                                variant="primary"
                                onClick={onSaveView}
                                title={viewGoals.length ? `Saving updates this chart on ${onGoals}` : undefined}
                            >
                                Save
                            </HeaderButton>
                        ) : null}
                        {isSavedItemOpen ? (
                            <HeaderButton
                                variant="secondary"
                                onClick={() => (hasUnsavedChanges ? setIsConfirmingClose(true) : onCloseView?.())}
                                title="Close and go back to an empty view"
                            >
                                Close
                            </HeaderButton>
                        ) : null}
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
                {activeMode === 'dashboard' && (
                    <HeaderButton variant="secondary" onClick={onOpenViewsModal}>
                        Saved Analytics
                    </HeaderButton>
                )}
                {activeMode === 'dashboard' && showFiltersToggle && (
                    <HeaderButton variant="secondary" onClick={onToggleFiltersPane}>
                        {isFiltersPaneOpen ? 'Hide Filters' : 'Show Filters'}
                    </HeaderButton>
                )}
            </div>
            {isAddToGoalOpen && savedView ? (
                <Suspense fallback={null}>
                    <AddViewToGoalsModal rootId={rootId} view={savedView} isOpen onClose={() => setIsAddToGoalOpen(false)} />
                </Suspense>
            ) : null}
            <ConfirmationModal
                isOpen={isConfirmingClose}
                onClose={() => setIsConfirmingClose(false)}
                onConfirm={() => onCloseView?.()}
                title="Discard unsaved changes?"
                message={`Your changes to “${currentViewName}” haven’t been saved.`}
                confirmText="Discard and close"
                cancelText="Keep editing"
            />
        </div>
    );
}

export default AnalyticsTopBar;
