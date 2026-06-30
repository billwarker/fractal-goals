import React from 'react';

import styles from './GoalUncompletionModal.module.css';

function GoalUncompletionModal({
    goal,
    goalType,
    programs = [],
    treeData,
    targets = [],
    activityDefinitions = [],
    onConfirm,
    onCancel,
    completedAt
}) {
    // Find programs this goal belongs to
    const findProgramsForGoal = () => {
        if (!treeData) return [];
        const foundPrograms = [];
        if (programs && programs.length > 0) {
            foundPrograms.push(...programs);
        } else if (treeData) {
            foundPrograms.push({ name: treeData.name || 'Current Program', id: treeData.id });
        }
        return foundPrograms;
    };

    const associatedPrograms = findProgramsForGoal();

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                <button
                    onClick={onCancel}
                    className={styles.backButton}
                >
                    ←
                </button>
                <h3 className={styles.title}>
                    ⚠ Confirm Mark as Incomplete
                </h3>
            </div>

            {/* Goal Name */}
            <div className={styles.goalCard}>
                <div className={styles.eyebrow}>
                    Marking as Incomplete:
                </div>
                <div className={styles.goalName}>
                    {goal.name}
                </div>
                <div className={styles.mutedMeta}>
                    Type: {goalType}
                </div>
            </div>

            {/* Originally Completed Date */}
            {completedAt && (
                <div>
                    <label className={styles.fieldLabel}>
                        Was completed on:
                    </label>
                    <div className={styles.completedDate}>
                        📅 {new Date(completedAt).toLocaleDateString()} at {new Date(completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
            )}

            {/* Warning */}
            <div className={styles.warning}>
                ⚠️ This will remove the completion status and completion date from this goal.
            </div>

            {/* Associated Programs */}
            <div>
                <label className={styles.fieldLabel}>
                    Programs that will update:
                </label>
                {associatedPrograms.length === 0 ? (
                    <div className={styles.emptyText}>
                        No programs found
                    </div>
                ) : (
                    <div className={styles.list}>
                        {associatedPrograms.map((program, idx) => (
                            <div key={idx} className={styles.listItem}>
                                <span className={styles.warningIcon}>📁</span>
                                {program.name}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Associated Targets */}
            <div>
                <label className={styles.fieldLabel}>
                    Targets that will be marked incomplete ({targets.length}):
                </label>
                {targets.length === 0 ? (
                    <div className={styles.emptyText}>
                        No targets defined for this goal
                    </div>
                ) : (
                    <div className={styles.list}>
                        {targets.map(target => {
                            const activity = activityDefinitions.find(a => a.id === target.activity_id);
                            return (
                                <div key={target.id} className={styles.targetItem}>
                                    <div className={styles.targetName}>
                                        🎯 {target.name || activity?.name || 'Target'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className={styles.actions}>
                <button
                    onClick={onCancel}
                    className={`${styles.button} ${styles.cancelButton}`}
                >
                    Cancel
                </button>
                <button
                    onClick={onConfirm}
                    className={`${styles.button} ${styles.confirmButton}`}
                >
                    Mark Incomplete
                </button>
            </div>
        </div>
    );
}

export default GoalUncompletionModal;
