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
    creatingSubGoal,
    subGoalName,
    setSubGoalName,
    onStartSubGoalCreation,
    onConfirmSubGoalCreation,
    onCancelSubGoalCreation,
    onOpenAssociate
}) {
    // if (flattenedHierarchy.length === 0) return null; // Removed to allow empty state rendering

    const canAddChild = (goalType) => {
        return goalType !== 'NanoGoal';
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
                    const isCreatingForThisNode = creatingSubGoal?.parentId === node.id;

                    return (
                        <div key={node.id || `node-${index}`}>
                            <div
                                className={`${styles.hierarchyNode} ${node.isLinked ? styles.activeHierarchyNode : ''}`}
                                style={{ paddingLeft: `${node.depth * 28}px` }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', height: '16px', minWidth: '16px' }}>
                                    <GoalIcon
                                        shape={getGoalIcon ? getGoalIcon(node.type) : getScopedCharacteristics(node.type)?.icon || 'circle'}
                                        color={node.completed ? completedColor : getGoalColor(node.type)}
                                        secondaryColor={node.completed ? completedSecondaryColor : getGoalSecondaryColor(node.type)}
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
                                                onStartSubGoalCreation(node);
                                            }}
                                            title="Add Sub-goal"
                                        >
                                            +
                                        </button>
                                    )}
                                </div>
                            </div>

                            {isCreatingForThisNode && (
                                <div
                                    className={styles.creationRow}
                                    style={{ paddingLeft: `${(node.depth + 1) * 28}px` }}
                                >
                                    <div className={styles.creationLabel}>
                                        New {(() => {
                                            const typeMap = {
                                                'UltimateGoal': 'Long Term Goal',
                                                'LongTermGoal': 'Mid Term Goal',
                                                'MidTermGoal': 'Short Term Goal',
                                                'ShortTermGoal': 'Immediate Goal',
                                                'ImmediateGoal': 'Micro Goal',
                                                'MicroGoal': 'Nano Goal'
                                            };
                                            return typeMap[node.type] || 'Sub-goal';
                                        })()}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                                        <input
                                            type="text"
                                            className={styles.creationInput}
                                            value={subGoalName}
                                            onChange={(e) => setSubGoalName(e.target.value)}
                                            placeholder="Enter goal name..."
                                            autoFocus
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') onConfirmSubGoalCreation();
                                                if (e.key === 'Escape') onCancelSubGoalCreation();
                                            }}
                                        />
                                        <div className={styles.creationActions}>
                                            <button onClick={onConfirmSubGoalCreation} className={styles.confirmBtn} title="Confirm">✓</button>
                                            <button onClick={onCancelSubGoalCreation} className={styles.cancelBtn} title="Cancel">✕</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default HierarchySection;
