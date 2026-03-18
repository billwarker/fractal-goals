import React from 'react';

import EmptyState from '../common/EmptyState';
import StepContainer from '../common/StepContainer';
import StepHeader from './StepHeader';
import ImmediateGoalSection from './ImmediateGoalSection';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import styles from './GoalAssociation.module.css';

function GoalAssociation({
    goals,
    selectedGoalIds,
    selectedImmediateGoalIds,
    immediateGoals,
    onToggleGoal,
    onToggleImmediateGoal,
    onRemoveImmediateGoal,
    onCreateImmediateGoal,
}) {
    return (
        <StepContainer>
            <StepHeader
                stepNumber={2}
                title="Associate with Goals"
                subtitle="Select short-term goals and optionally attach their immediate goals to this session."
            />

            {goals.length === 0 ? (
                <EmptyState description="No short-term goals found. Create goals in the Goals page first." />
            ) : (
                <div className={styles.list}>
                    {goals.map((stg) => {
                        const isSelected = selectedGoalIds.includes(stg.id);
                        const stgImmediateGoals = stg.immediateGoals || [];
                        const newGoalsForSTG = immediateGoals.filter((goal) => goal.parent_id === stg.id);
                        const hasImmediateGoals = stgImmediateGoals.length > 0 || newGoalsForSTG.length > 0;

                        return (
                            <GoalCard
                                key={stg.id}
                                stg={stg}
                                isSelected={isSelected}
                                totalImmediateCount={stgImmediateGoals.length + newGoalsForSTG.length}
                                hasImmediateGoals={hasImmediateGoals}
                                onToggle={() => onToggleGoal(stg.id)}
                            >
                                {isSelected ? (
                                    <ImmediateGoalSection
                                        existingImmediateGoals={stgImmediateGoals}
                                        newImmediateGoals={newGoalsForSTG}
                                        selectedImmediateGoalIds={selectedImmediateGoalIds}
                                        onToggleExistingGoal={onToggleImmediateGoal}
                                        onRemoveNewGoal={onRemoveImmediateGoal}
                                        onCreateNewGoal={() => onCreateImmediateGoal(stg)}
                                    />
                                ) : null}
                            </GoalCard>
                        );
                    })}
                </div>
            )}
        </StepContainer>
    );
}

function GoalCard({ stg, isSelected, totalImmediateCount, hasImmediateGoals, onToggle, children }) {
    const { getGoalColor } = useGoalLevels();
    const goalColor = getGoalColor('ShortTermGoal');

    return (
        <div
            className={styles.goalCard}
            style={{ borderColor: isSelected ? goalColor : undefined }}
        >
            <button
                type="button"
                onClick={onToggle}
                className={`${styles.goalHeader} ${isSelected ? styles.goalHeaderSelected : ''}`}
                style={{
                    '--goal-color': goalColor,
                    background: isSelected ? `${goalColor}1A` : undefined,
                }}
            >
                <div
                    className={`${styles.checkbox} ${isSelected ? styles.checkboxSelected : ''}`}
                    style={{
                        borderColor: isSelected ? goalColor : undefined,
                        background: isSelected ? goalColor : undefined,
                    }}
                >
                    {isSelected ? '✓' : null}
                </div>
                <div className={styles.goalText}>
                    <div className={styles.goalName} style={{ color: isSelected ? goalColor : undefined }}>
                        {stg.name}
                    </div>
                    {stg.description ? <div className={styles.goalDescription}>{stg.description}</div> : null}
                </div>
                {hasImmediateGoals ? (
                    <div className={styles.immediateCount}>
                        {totalImmediateCount} immediate goal{totalImmediateCount !== 1 ? 's' : ''}
                    </div>
                ) : null}
            </button>
            {children}
        </div>
    );
}

export default GoalAssociation;
