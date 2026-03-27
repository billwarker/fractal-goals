import React, { useMemo } from 'react';

import Button from '../atoms/Button';
import GoalIcon from '../atoms/GoalIcon';
import styles from '../ActivityBuilder.module.css';
import { buildGoalAssociationSummary } from './activityBuilderUtils';

const GOAL_TYPE_ORDER = ['UltimateGoal', 'LongTermGoal', 'MidTermGoal', 'ShortTermGoal', 'ImmediateGoal', 'MicroGoal'];
const GOAL_TYPE_LABELS = {
    UltimateGoal: 'Ultimate',
    LongTermGoal: 'Long Term',
    MidTermGoal: 'Mid Term',
    ShortTermGoal: 'Short Term',
    ImmediateGoal: 'Immediate',
    MicroGoal: 'Micro',
};

function ActivityAssociationsField({
    allGoals,
    selectedGoalIds,
    onOpenModal,
    getGoalColor,
    getGoalIcon,
}) {
    const summary = useMemo(
        () => buildGoalAssociationSummary(allGoals, selectedGoalIds),
        [allGoals, selectedGoalIds]
    );

    return (
        <div>
            <div className={styles.goalHeader}>
                <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                    Associated Goals ({selectedGoalIds.length})
                </label>
                <Button
                    type="button"
                    onClick={onOpenModal}
                    variant="ghost"
                    size="sm"
                    style={{ color: 'var(--color-brand-primary)' }}
                >
                    Select Goals
                </Button>
            </div>

            {selectedGoalIds.length > 0 && (
                <div className={styles.associationSummary}>
                    <div className={styles.summaryGrid}>
                        {GOAL_TYPE_ORDER.map((type) => {
                            const stats = summary[type];
                            if (!stats) {
                                return null;
                            }

                            const color = getGoalColor(type);

                            const icon = getGoalIcon ? getGoalIcon(type) : 'circle';

                            const countParts = [];
                            if (stats.direct > 0) countParts.push(`${stats.direct} direct`);
                            if (stats.inherited > 0) countParts.push(`${stats.inherited} inherited`);

                            return (
                                <div key={type} className={styles.summaryItem}>
                                    <GoalIcon shape={icon} color={color} size={12} />
                                    <div className={styles.summaryItemContent}>
                                        <span className={styles.summaryLabel} style={{ color }}>
                                            {GOAL_TYPE_LABELS[type] || type}
                                        </span>
                                        <span className={styles.summaryCounts}>
                                            {countParts.join(', ')}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                Goals with associated activities meet the SMART &quot;Achievable&quot; criterion
            </div>
        </div>
    );
}

export default ActivityAssociationsField;
