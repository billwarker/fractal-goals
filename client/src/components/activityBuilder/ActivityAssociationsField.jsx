import React, { useMemo } from 'react';

import Button from '../atoms/Button';
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

                            return (
                                <div key={type} className={styles.summaryItem} style={{ borderColor: color }}>
                                    <div className={styles.summaryLabel} style={{ color }}>
                                        {GOAL_TYPE_LABELS[type] || type}
                                    </div>
                                    <div className={styles.summaryCounts}>
                                        {stats.direct > 0 && (
                                            <span className={styles.countDirect} title="Directly Associated">
                                                {stats.direct} Direct
                                            </span>
                                        )}
                                        {stats.inherited > 0 && (
                                            <span className={styles.countInherited} title="Inherited from Selection">
                                                {stats.inherited} Inherited
                                            </span>
                                        )}
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
