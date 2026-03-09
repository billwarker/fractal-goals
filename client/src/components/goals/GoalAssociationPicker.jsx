import React, { useMemo } from 'react';

import GoalIcon from '../atoms/GoalIcon';
import { Text } from '../atoms/Typography';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import styles from './GoalAssociationPicker.module.css';

function GoalAssociationPicker({
    goals = [],
    selectedGoalId = '',
    onSelectGoal,
    associatedGoalIds = [],
    associationLabel = 'Attached',
    getAssociationMeta,
    emptyState = 'No goals available.',
    inputName = 'goal',
}) {
    const { getGoalColor, getGoalSecondaryColor, getGoalIcon } = useGoalLevels();
    const associatedGoalIdSet = useMemo(() => new Set(associatedGoalIds), [associatedGoalIds]);
    const orderedGoals = useMemo(() => {
        return [...goals].sort((left, right) => {
            const leftAssociated = associatedGoalIdSet.has(left.id);
            const rightAssociated = associatedGoalIdSet.has(right.id);

            if (leftAssociated !== rightAssociated) {
                return leftAssociated ? -1 : 1;
            }

            return left.name.localeCompare(right.name);
        });
    }, [associatedGoalIdSet, goals]);

    if (orderedGoals.length === 0) {
        return <div className={styles.emptyState}>{emptyState}</div>;
    }

    return (
        <div className={styles.goalList}>
            {orderedGoals.map((goal) => {
                const goalType = goal.attributes?.type || goal.type || '';
                const isAssociated = associatedGoalIdSet.has(goal.id);
                const metaText = isAssociated && getAssociationMeta ? getAssociationMeta(goal) : null;

                return (
                    <label
                        key={goal.id}
                        className={`${styles.goalItem} ${isAssociated ? styles.goalItemAssociated : ''}`}
                    >
                        <input
                            type="radio"
                            name={inputName}
                            checked={selectedGoalId === goal.id}
                            onChange={() => onSelectGoal?.(goal)}
                            className={styles.radioInput}
                        />
                        <div className={styles.goalIconWrap}>
                            <GoalIcon
                                shape={getGoalIcon(goalType)}
                                color={getGoalColor(goalType)}
                                secondaryColor={getGoalSecondaryColor(goalType)}
                                isSmart={goal.is_smart}
                                size={18}
                            />
                        </div>
                        <div className={styles.goalInfo}>
                            <div className={styles.goalNameRow}>
                                <Text weight="medium">{goal.name}</Text>
                                {isAssociated && (
                                    <span className={styles.associatedBadge}>{associationLabel}</span>
                                )}
                            </div>
                            <span className={styles.goalType}>
                                {goalType.replace(/([A-Z])/g, ' $1').trim()}
                            </span>
                            {metaText && <span className={styles.goalMeta}>{metaText}</span>}
                        </div>
                    </label>
                );
            })}
        </div>
    );
}

export default GoalAssociationPicker;
