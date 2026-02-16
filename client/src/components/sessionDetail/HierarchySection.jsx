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
    achievedTargetIds
}) {
    if (flattenedHierarchy.length === 0) return null;

    return (
        <div className={styles.contextSection}>
            <div className={styles.contextLabel}>
                {viewMode === 'activity' ? 'Working Towards' : 'Goal Hierarchy'}
            </div>
            <div className={styles.hierarchyChain}>
                {flattenedHierarchy.map((node) => {
                    const targets = parseTargets(node);
                    return (
                        <div
                            key={node.id}
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
                                {node.isLinked && viewMode === 'activity' && targets.length > 0 && (
                                    <span className={styles.targetBadge}>
                                        {targets.filter(t => achievedTargetIds?.has(t.id)).length}/{targets.length}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default HierarchySection;
