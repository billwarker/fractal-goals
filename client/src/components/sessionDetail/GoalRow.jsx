import React from 'react';
import GoalIcon from '../atoms/GoalIcon';
import { useTheme } from '../../contexts/ThemeContext';
import { parseTargets, formatTargetDescription } from '../../utils/goalUtils';
import styles from './GoalsPanel.module.css';

function GoalRow({
    goal, icon, color, secondaryColor, completedColor, completedSecondaryColor,
    isExpanded, onToggle, onGoalClick, targetAchievements, achievedTargetIds,
}) {
    const { getScopedCharacteristics, getCompletionColor, getGoalSecondaryColor } = useTheme();
    const targets = parseTargets(goal);

    const isCompleted = goal.completed || goal.attributes?.completed;
    const effectiveIcon = icon || 'circle';
    const effectiveColor = isCompleted ? getCompletionColor() : color;
    const effectiveSecondaryColor = isCompleted ? getGoalSecondaryColor('Completed') : secondaryColor;

    return (
        <div className={styles.goalRow}>
            <div className={styles.goalHeader} onClick={onToggle}>
                <GoalIcon
                    shape={effectiveIcon}
                    color={effectiveColor}
                    secondaryColor={effectiveSecondaryColor}
                    isSmart={goal.is_smart}
                    size={16}
                />
                <div className={styles.goalName}>
                    <span
                        className={styles.goalNameClickable}
                        onClick={(e) => { e.stopPropagation(); onGoalClick && onGoalClick(goal); }}
                    >
                        {goal.name || goal.attributes?.name}
                    </span>
                    {targets.length > 0 && (
                        <span className={styles.targetBadge}>
                            {targets.filter(t => achievedTargetIds?.has(t.id)).length}/{targets.length}
                        </span>
                    )}
                </div>
                <div className={styles.expandToggle}>{isExpanded ? '▼' : '▶'}</div>
            </div>

            {isExpanded && (
                <div className={styles.expandedContent}>
                    {targets.length > 0 ? (
                        <div className={styles.targetsList}>
                            {targets.map(target => {
                                const isAchieved = achievedTargetIds?.has(target.id);
                                return (
                                    <div key={target.id} className={`${styles.targetRow} ${isAchieved ? styles.targetAchieved : ''}`}>
                                        <span className={styles.targetIndicator}>{isAchieved ? '✓' : '○'}</span>
                                        <span className={styles.targetName}>{target.name || formatTargetDescription(target)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className={styles.noTargets}>
                            {goal.description || 'No targets set for this goal.'}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default GoalRow;
