import React from 'react';

import StepContainer from '../common/StepContainer';
import GoalHierarchySelector from '../goals/GoalHierarchySelector';
import Checkbox from '../atoms/Checkbox';
import ProgramName from '../atoms/ProgramName';
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
    awaitingTemplate = false,
    embedded = false,
    // Fill the parent's height, the hierarchy taking what the rest leaves (desktop Create Session).
    fill = false,
    hideHeading = false,
    programScopeAvailable = false,
    programScopeEnabled = false,
    onProgramScopeChange,
    programName,
    programColor,
    offScopeGoalCount = 0,
    onClearOffScopeGoals,
}) {
    const description = awaitingTemplate
        ? 'Add optional goals for this session. Goals from the template\'s activities are added, and locked, once you pick one.'
        : 'Add optional goals to define this session\'s intent. Goals derived from template activities are locked.';

    return (
        <StepContainer className={[styles.container, embedded ? styles.embedded : '', fill ? styles.fill : ''].filter(Boolean).join(' ')}>
            {!hideHeading && (
                <div className={styles.header}>
                    <h2 className={styles.title}>Session Goals</h2>
                    <span className={styles.optionalLabel}>Optional</span>
                </div>
            )}
            <p className={styles.description}>
                {description}
            </p>
            {programScopeAvailable ? (
                <div className={styles.scopeRow}>
                    <span
                        className={styles.programSwatch}
                        style={{ backgroundColor: programColor || 'var(--color-brand-primary)' }}
                        aria-hidden="true"
                    />
                    <Checkbox
                        checked={programScopeEnabled}
                        onChange={(event) => onProgramScopeChange?.(event.target.checked)}
                        label={<>Only goals in <ProgramName name={programName} color={programColor} /></>}
                        title={`Only show goals in ${programName}, including their ancestors and descendants.`}
                        containerStyle={{ margin: 0 }}
                    />
                </div>
            ) : null}
            {offScopeGoalCount > 0 ? (
                <div className={styles.offScopeNotice} role="status">
                    <span>{offScopeGoalCount} selected goal{offScopeGoalCount === 1 ? ' is' : 's are'} outside this program.</span>
                    <button type="button" onClick={onClearOffScopeGoals}>Remove them</button>
                </div>
            ) : null}
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
                        lockedGoalLegend="Included automatically through template activities and cannot be removed."
                        onSelectionChange={onChange}
                        highlightSelectionAncestors
                        connectorHighlightMode="lineage"
                        compactLayout
                        selectionDisabled={selectionDisabled}
                        initialHideCompletedGoals
                        lockHideCompletedGoals
                        showHideCompletedControl={false}
                        emptyState={programScopeEnabled ? 'No goals in this program.' : 'No goals available.'}
                    />
                </div>
            )}
        </StepContainer>
    );
}

export default SessionGoalScopePanel;
