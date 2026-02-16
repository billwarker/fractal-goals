import React from 'react';
import GoalIcon from '../atoms/GoalIcon';
import { parseTargets } from '../../utils/goalUtils';
import styles from './GoalsPanel.module.css';

function HierarchySection({
    flattenedHierarchy,
    viewMode,
    onGoalClick,
    getScopedCharacteristics,
    getGoalColor,
    getGoalSecondaryColor,
    completedColor,
    completedSecondaryColor,
    achievedTargetIds,
    creatingSubGoal,
    subGoalName,
    setSubGoalName,
    onStartSubGoalCreation,
    onConfirmSubGoalCreation,
    onCancelSubGoalCreation
}) {
    if (flattenedHierarchy.length === 0) return null;

    // Helper to check if we can add a child to this node
    const canAddChild = (type) => {
        // Simple check based on known types that have children in the view
        // Adjust vertically if needed
        return type !== 'NanoGoal' && type !== 'MicroGoal';
        // Note: MicroGoal CAN have NanoGoal children, but the UI might handle them differently (checklist)
        // For now, let's allow it if the backend supports it, but restricting Nano might be safer for "Activity" view focus
        // Actually, the user wanted to "create next goal", which usually implies up to Micro/Nano. 
        // Let's allow all except Nano.
    };

    return (
        <div className={styles.contextSection}>
            <div className={styles.contextLabel}>
                {viewMode === 'activity' ? 'Working Towards' : 'Goal Hierarchy'}
            </div>
            <div className={styles.hierarchyChain}>
                {flattenedHierarchy.map((node) => {
                    const targets = parseTargets(node);
                    const isCreatingForThisNode = creatingSubGoal?.parentId === node.id;

                    return (
                        <div key={node.id}>
                            <div
                                className={`${styles.hierarchyNode} ${node.isLinked ? styles.activeHierarchyNode : ''}`}
                                style={{ paddingLeft: `${node.depth * 14}px` }}
                            >
                                <GoalIcon
                                    shape={getScopedCharacteristics(node.type)?.icon || 'circle'}
                                    color={node.completed ? completedColor : getGoalColor(node.type)}
                                    secondaryColor={node.completed ? completedSecondaryColor : getGoalSecondaryColor(node.type)}
                                    isSmart={node.is_smart}
                                    size={node.isLinked && viewMode === 'activity' ? 16 : 12}
                                />
                                <div className={styles.hierarchyNodeContent}>
                                    <span
                                        className={`${styles.hierarchyNodeName} ${node.isLinked ? styles.hierarchyNodeLinked : ''}`}
                                        onClick={() => onGoalClick && onGoalClick(node)}
                                    >
                                        {node.name}
                                    </span>

                                    {/* Add Button */}
                                    {onStartSubGoalCreation && canAddChild(node.type) && (
                                        <button
                                            className={styles.addSubGoalBtn}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onStartSubGoalCreation(node);
                                            }}
                                            title="Create sub-goal"
                                        >
                                            +
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Inline Creation Form */}
                            {isCreatingForThisNode && (
                                <div
                                    className={styles.creationRow}
                                    style={{ paddingLeft: `${(node.depth + 1) * 14}px` }}
                                >
                                    <input
                                        type="text"
                                        className={styles.creationInput}
                                        value={subGoalName}
                                        onChange={(e) => setSubGoalName(e.target.value)}
                                        placeholder="New goal name..."
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') onConfirmSubGoalCreation();
                                            if (e.key === 'Escape') onCancelSubGoalCreation();
                                        }}
                                    />
                                    <div className={styles.creationActions}>
                                        <button onClick={onConfirmSubGoalCreation} className={styles.confirmBtn}>✓</button>
                                        <button onClick={onCancelSubGoalCreation} className={styles.cancelBtn}>✕</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default HierarchySection;
