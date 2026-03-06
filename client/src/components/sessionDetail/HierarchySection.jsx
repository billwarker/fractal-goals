import React from 'react';
import GoalIcon from '../atoms/GoalIcon';
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
    // if (flattenedHierarchy.length === 0) return null; // Removed to allow empty state rendering

    const canAddChild = (goalType) => {
        // NanoGoal cannot have children; ImmediateGoal opens target builder instead
        return goalType !== 'NanoGoal' && goalType !== 'MicroGoal';
    };

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
            <div className={styles.hierarchyList}>
                {flattenedHierarchy.map((node, index) => {
                    const isCompleted = node.status
                        ? Boolean(node.status.completed)
                        : Boolean(node.completed);

                    return (
                        <div key={node.id || `node-${index}`}>
                            <div
                                className={`${styles.hierarchyNode} ${node.isLinked ? styles.activeHierarchyNode : ''}`}
                                style={{ paddingLeft: `${node.depth * 28}px` }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', height: '16px', minWidth: '16px' }}>
                                    <GoalIcon
                                        shape={getGoalIcon ? getGoalIcon(node.type) : getScopedCharacteristics(node.type)?.icon || 'circle'}
                                        color={isCompleted ? completedColor : getGoalColor(node.type)}
                                        secondaryColor={isCompleted ? completedSecondaryColor : getGoalSecondaryColor(node.type)}
                                        isSmart={node.is_smart}
                                        size={16}
                                    />
                                </div>
                                <div className={styles.hierarchyNodeContent}>
                                    <span
                                        className={`${styles.hierarchyNodeName} ${node.isLinked ? styles.hierarchyNodeLinked : ''}`}
                                        onClick={() => onGoalClick && onGoalClick(node)}
                                    >
                                        {node.name}
                                    </span>
                                    {onStartSubGoalCreation && canAddChild(node.type) && (
                                        <button
                                            className={styles.addSubGoalBtn}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (node.type === 'ImmediateGoal' && onAddTargetForGoal) {
                                                    onAddTargetForGoal(node);
                                                } else {
                                                    onStartSubGoalCreation(node);
                                                }
                                            }}
                                            title={node.type === 'ImmediateGoal' ? 'Add Target' : 'Add Sub-goal'}
                                        >
                                            +
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default HierarchySection;
