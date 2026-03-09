import React from 'react';
import GoalHierarchyList from '../goals/GoalHierarchyList';
import styles from './GoalsPanel.module.css';

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
    onStartSubGoalCreation,
    onOpenAssociate,
    onAddTargetForGoal,
}) {
    return (
        <div className={styles.contextSection}>
            <div className={styles.headerContainer}>
                <div className={styles.contextLabel}>
                    {type === 'activity' ? (activityDefinition?.name || 'Activity Goals') : 'Session Goals'}
                </div>
                {type === 'activity' && onOpenAssociate && (
                    <button
                        className={styles.editLink}
                        onClick={onOpenAssociate}
                    >
                        [edit]
                    </button>
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
                onStartSubGoalCreation={onStartSubGoalCreation}
                onAddTargetForGoal={onAddTargetForGoal}
                emptyState="No goals associated"
            />
        </div>
    );
};

export default HierarchySection;
