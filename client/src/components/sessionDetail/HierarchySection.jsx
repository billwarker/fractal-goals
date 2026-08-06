import React from 'react';
import GoalHierarchyList from '../goals/GoalHierarchyList';
import styles from './SessionGoalHierarchyPanel.module.css';

function HierarchySection({
    type = 'activity',
    activityDefinition,
    flattenedHierarchy,
    onGoalClick,
    getScopedCharacteristics,
    getGoalColor,
    getGoalSecondaryColor,
    getGoalIcon,
    completedColor,
    completedSecondaryColor,
    getGoalBranchHighlightState,
    getGoalConnectorHighlightState,
    getGoalConnectorEdgeHighlightState,
    getGoalConnectorEdgeState,
    connectorHighlightMode,
    showGoalHighlightHalo,
    onGoalIconClick,
    isGoalIconSelected,
    getGoalIconActionLabel,
    onStartSubGoalCreation,
    onOpenAssociate,
    onAddTargetForGoal,
    scopedActivityName = null,
    onAdjustScope,
}) {
    const label = scopedActivityName
        ? `Goals: ${scopedActivityName}`
        : (type === 'activity' ? (activityDefinition?.name || 'Activity Goals') : 'Session Goals');

    return (
        <div className={styles.contextSection}>
            <div className={styles.headerContainer}>
                <div className={styles.contextLabel}>
                    {label}
                </div>
                {type === 'activity' && onOpenAssociate && (
                    <button
                        className={styles.editLink}
                        onClick={onOpenAssociate}
                    >
                        [edit]
                    </button>
                )}
                {type === 'session' && onAdjustScope && (
                    <button type="button" className={styles.editLink} onClick={onAdjustScope}>Adjust scope</button>
                )}
            </div>
            <GoalHierarchyList
                variant="session"
                nodes={flattenedHierarchy}
                onGoalClick={onGoalClick}
                getScopedCharacteristics={getScopedCharacteristics}
                getGoalColor={getGoalColor}
                getGoalSecondaryColor={getGoalSecondaryColor}
                getGoalIcon={getGoalIcon}
                completedColor={completedColor}
                completedSecondaryColor={completedSecondaryColor}
                getGoalBranchHighlightState={getGoalBranchHighlightState}
                getGoalConnectorHighlightState={getGoalConnectorHighlightState}
                getGoalConnectorEdgeHighlightState={getGoalConnectorEdgeHighlightState}
                getGoalConnectorEdgeState={getGoalConnectorEdgeState}
                connectorHighlightMode={connectorHighlightMode}
                showGoalHighlightHalo={showGoalHighlightHalo}
                onGoalIconClick={onGoalIconClick}
                isGoalIconSelected={isGoalIconSelected}
                getGoalIconActionLabel={getGoalIconActionLabel}
                onStartSubGoalCreation={onStartSubGoalCreation}
                onAddTargetForGoal={onAddTargetForGoal}
                emptyState="No goals associated"
            />
        </div>
    );
};

export default HierarchySection;
