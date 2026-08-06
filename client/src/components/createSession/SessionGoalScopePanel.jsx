import React from 'react';

import StepContainer from '../common/StepContainer';
import GoalHierarchySelector from '../goals/GoalHierarchySelector';
import styles from './SessionGoalScopePanel.module.css';

function SessionGoalScopePanel({
    goals,
    manualGoalIds,
    automaticGoalIds,
    onChange,
    isLoading,
    error,
    onRetry,
    selectionDisabled = false,
    readOnly = false,
    awaitingTemplate = false,
    embedded = false,
    hideHeading = false,
}) {
    const statusLabel = readOnly ? 'Read only' : 'Optional';
    const description = readOnly
        ? 'Goal scope cannot be edited for quick sessions.'
        : awaitingTemplate
            ? 'Select a template to review activity-derived goals and optionally add session goals.'
            : 'Add optional goals to define this session\'s intent. Goals derived from template activities are locked.';

    return (
        <StepContainer className={`${styles.container} ${embedded ? styles.embedded : ''}`}>
            {!hideHeading && (
                <div className={styles.header}>
                    <h2 className={styles.title}>Session Goals</h2>
                    <span className={styles.optionalLabel}>{statusLabel}</span>
                </div>
            )}
            <p className={`${styles.description} ${automaticGoalIds.length === 0 ? styles.descriptionStandalone : ''}`}>
                {description}
            </p>
            {automaticGoalIds.length > 0 && (
                <p className={styles.provenanceLegend}>
                    <span aria-hidden="true">*</span>
                    <span>Included automatically through template activities and cannot be removed.</span>
                </p>
            )}
            {isLoading ? (
                <div className={styles.status} role="status">Resolving activity-derived goals…</div>
            ) : error ? (
                <div className={styles.error} role="alert">
                    <span>Could not load activity-derived goals.</span>
                    <button type="button" onClick={onRetry}>Retry</button>
                </div>
            ) : (
                <div className={styles.selectorFrame}>
                    <GoalHierarchySelector
                        goals={goals}
                        selectedGoalIds={manualGoalIds}
                        lockedGoalIds={automaticGoalIds}
                        lockedGoalLabel="Included by template activities"
                        lockedGoalMarker="*"
                        onSelectionChange={onChange}
                        highlightSelectionAncestors
                        connectorHighlightMode="lineage"
                        compactLayout
                        selectionDisabled={selectionDisabled}
                        initialHideCompletedGoals
                        lockHideCompletedGoals
                        showHideCompletedControl={false}
                    />
                </div>
            )}
        </StepContainer>
    );
}

export default SessionGoalScopePanel;
