import React from 'react';
import GoalIcon from '../atoms/GoalIcon';
import { getTypeDisplayName } from '../../utils/goalHelpers';
import { isExecutionGoalType } from '../../utils/goalNodeModel';
import { formatLiteralDate } from '../../utils/dateUtils';
import styles from './GoalHierarchyList.module.css';

function GoalHierarchyList({
    nodes = [],
    variant = 'session',
    onGoalClick,
    getScopedCharacteristics,
    getGoalColor,
    getGoalSecondaryColor,
    getGoalIcon,
    completedColor = 'var(--color-brand-success)',
    completedSecondaryColor = 'var(--color-brand-success)',
    onStartSubGoalCreation,
    onAddTargetForGoal,
    emptyState = 'No goals associated',
}) {
    const canAddChild = (goalType) => !isExecutionGoalType(goalType);

    const handleGoalClick = (node) => {
        if (!onGoalClick) {
            return;
        }
        onGoalClick(node.originalGoal || node);
    };

    if (nodes.length === 0) {
        return <div className={styles.emptyState}>{emptyState}</div>;
    }

    if (variant === 'program') {
        return (
            <div className={`${styles.list} ${styles.programList}`}>
                {nodes.map((node, index) => {
                    const isCompleted = Boolean(node.completed);
                    const lineageColors = (node.lineage || []).map((entry) => (
                        entry.completed ? completedColor : getGoalColor(entry.type)
                    ));
                    const deadlineOptions = { month: 'short', day: 'numeric' };

                    return (
                        <div key={node.id || `program-node-${index}`} className={styles.programNodeWrapper}>
                            <div className={styles.programLineageStripes}>
                                {lineageColors.map((stripeColor, stripeIndex) => (
                                    <div
                                        key={`${node.id}-stripe-${stripeIndex}`}
                                        className={styles.programConnectingStripe}
                                        style={{
                                            backgroundColor: stripeColor,
                                            left: `${stripeIndex * 4}px`,
                                            zIndex: 10 + stripeIndex,
                                        }}
                                    />
                                ))}
                            </div>

                            <div
                                className={`${styles.programCard} ${isCompleted ? styles.programCardCompleted : ''}`}
                                onClick={() => handleGoalClick(node)}
                            >
                                <div
                                    className={styles.programCardContent}
                                    style={{ paddingLeft: `${lineageColors.length * 4 + 12}px` }}
                                >
                                    <div
                                        className={styles.programGoalType}
                                        style={{ color: isCompleted ? completedColor : getGoalColor(node.type) }}
                                    >
                                        {getTypeDisplayName(node.type)}
                                    </div>
                                    <div
                                        className={`${styles.programGoalName} ${isCompleted ? styles.programGoalNameCompleted : ''}`}
                                        style={{ color: isCompleted ? completedColor : 'var(--color-text-primary)' }}
                                    >
                                        {node.name}
                                    </div>
                                    {(node.deadline || (isCompleted && node.completed_at)) && (
                                        <div className={styles.programGoalDeadline}>
                                            {isCompleted
                                                ? `Completed: ${formatLiteralDate(node.completed_at, deadlineOptions)}`
                                                : `Deadline: ${formatLiteralDate(node.deadline, deadlineOptions)}`}
                                        </div>
                                    )}
                                </div>
                                {isCompleted && <div className={styles.programCheckIcon}>✓</div>}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    return (
        <div className={`${styles.list} ${styles.sessionList}`}>
            {nodes.map((node, index) => {
                const isCompleted = node.status
                    ? Boolean(node.status.completed)
                    : Boolean(node.completed);

                return (
                    <div
                        key={node.id || `session-node-${index}`}
                        className={`${styles.sessionNode} ${node.isLinked ? styles.sessionNodeActive : ''}`}
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
                        <div className={styles.sessionNodeContent}>
                            <span
                                className={`${styles.sessionNodeName} ${node.isLinked ? styles.sessionNodeNameActive : ''}`}
                                onClick={() => handleGoalClick(node)}
                            >
                                {node.name}
                            </span>
                            {onStartSubGoalCreation && canAddChild(node.type) && (
                                <button
                                    className={styles.addSubGoalBtn}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        if (node.type === 'ImmediateGoal' && onAddTargetForGoal) {
                                            onAddTargetForGoal(node);
                                            return;
                                        }
                                        onStartSubGoalCreation(node);
                                    }}
                                    title={node.type === 'ImmediateGoal' ? 'Add Target' : 'Add Sub-goal'}
                                >
                                    +
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default GoalHierarchyList;
