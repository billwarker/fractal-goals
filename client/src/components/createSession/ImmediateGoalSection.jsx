import React from 'react';

import Button from '../atoms/Button';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import styles from './ImmediateGoalSection.module.css';

function ImmediateGoalSection({
    existingImmediateGoals,
    newImmediateGoals,
    selectedImmediateGoalIds,
    onToggleExistingGoal,
    onRemoveNewGoal,
    onCreateNewGoal,
}) {
    const { getGoalColor } = useGoalLevels();
    const goalColor = getGoalColor('ImmediateGoal');
    const hasExistingGoals = existingImmediateGoals.length > 0;
    const hasNewGoals = newImmediateGoals.length > 0;

    return (
        <div
            className={styles.container}
            style={{
                '--goal-color': goalColor,
                '--goal-color-soft': `${goalColor}15`,
                '--goal-color-soft-border': `${goalColor}50`,
            }}
        >
            <div className={styles.sectionLabel}>
                <span className={styles.sectionLabelIcon}>◇</span>
                <span>Immediate Goals (optional)</span>
            </div>

            {hasExistingGoals ? (
                <div className={`${styles.list} ${hasNewGoals ? styles.listWithGap : ''}`}>
                    {existingImmediateGoals.map((goal) => (
                        <ExistingGoalCheckbox
                            key={goal.id}
                            goal={goal}
                            isSelected={selectedImmediateGoalIds.includes(goal.id)}
                            onToggle={() => onToggleExistingGoal(goal.id)}
                        />
                    ))}
                </div>
            ) : null}

            {hasNewGoals ? (
                <div className={styles.list}>
                    {newImmediateGoals.map((goal) => (
                        <NewGoalCard
                            key={goal.tempId}
                            goal={goal}
                            onRemove={() => onRemoveNewGoal(goal.tempId)}
                        />
                    ))}
                </div>
            ) : null}

            <Button
                onClick={(event) => {
                    event.stopPropagation();
                    onCreateNewGoal();
                }}
                variant="secondary"
                size="sm"
                className={styles.addButton}
            >
                + Add Immediate Goal
            </Button>
        </div>
    );
}

function ExistingGoalCheckbox({ goal, isSelected, onToggle }) {
    const { getGoalColor } = useGoalLevels();
    const goalColor = getGoalColor('ImmediateGoal');

    return (
        <button
            type="button"
            onClick={(event) => {
                event.stopPropagation();
                onToggle();
            }}
            className={styles.goalRow}
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
            <div className={styles.goalContent}>
                <div
                    className={styles.goalName}
                    style={{ color: isSelected ? goalColor : undefined }}
                >
                    {goal.name}
                </div>
                {goal.deadline ? (
                    <div className={styles.goalMeta}>
                        {new Date(goal.deadline).toLocaleDateString()}
                    </div>
                ) : null}
            </div>
            {goal.completed ? <span className={styles.doneText}>✓ Done</span> : null}
        </button>
    );
}

function NewGoalCard({ goal, onRemove }) {
    return (
        <div className={styles.newGoalCard}>
            <span className={styles.newGoalBadge}>✨ New</span>
            <div className={styles.goalContent}>
                <div className={styles.newGoalName}>{goal.name}</div>
            </div>
            <Button
                onClick={(event) => {
                    event.stopPropagation();
                    onRemove();
                }}
                variant="danger"
                size="sm"
                className={styles.removeButton}
            >
                ×
            </Button>
        </div>
    );
}

export default ImmediateGoalSection;
