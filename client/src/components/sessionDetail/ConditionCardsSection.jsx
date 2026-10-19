import React from 'react';

import { getTypeDisplayName } from '../../utils/goalHelpers';
import { describeCondition, describeProgress, progressFraction } from '../../utils/goalConditions';
import ConditionProgressBar from '../goalDetail/ConditionProgressBar';
import styles from './SessionGoalHierarchyPanel.module.css';

/**
 * Goals in this session that complete on an activity threshold, with live progress.
 * Progress is derived on the server, so it reflects every set once it syncs.
 */
function ConditionCardsSection({
    cards = [],
    activityDefinitions = [],
    scopedActivityName = null,
    getGoalColor = () => 'var(--color-brand-primary)',
    onCardClick = null,
}) {
    if (cards.length === 0) return null;
    const activityById = new Map(activityDefinitions.map((activity) => [activity.id, activity]));

    return (
        <div className={styles.contextSection} style={{ marginTop: '24px' }}>
            <div className={styles.headerContainer}>
                <div className={styles.contextLabel}>
                    {scopedActivityName ? `Goal thresholds: ${scopedActivityName}` : 'Goal thresholds'}
                </div>
            </div>
            <div className={styles.targetsList}>
                {cards.map((card) => {
                    const accent = getGoalColor(card.completed ? 'Completed' : card.goalType);
                    const activity = activityById.get(card.condition.activity_definition_id) || null;
                    const content = (
                        <>
                            <div className={styles.targetGoalLabel}>
                                {card.goalName}
                                <span className={styles.targetGoalType}>
                                    • {getTypeDisplayName(card.goalType).replace(/\s*Goal$/, '')}
                                </span>
                            </div>
                            <p className={styles.conditionSentence}>{describeCondition(card.condition, activity)}</p>
                            <ConditionProgressBar
                                compact
                                fraction={card.completed ? 1 : progressFraction(card.progress)}
                                label={card.completed ? 'Complete' : describeProgress(card.progress, card.condition)}
                                met={card.completed || Boolean(card.progress?.met)}
                                accentColor={accent}
                            />
                        </>
                    );
                    return onCardClick ? (
                        <button
                            key={card.goalId}
                            type="button"
                            className={`${styles.targetWrapper} ${styles.conditionCard}`}
                            style={{ '--condition-accent': accent }}
                            onClick={() => onCardClick(card)}
                        >
                            {content}
                        </button>
                    ) : (
                        <div key={card.goalId} className={`${styles.targetWrapper} ${styles.conditionCard}`} style={{ '--condition-accent': accent }}>
                            {content}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default ConditionCardsSection;
