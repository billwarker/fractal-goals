import React, { useState, useEffect } from 'react';
import styles from './GoalCompletionModal.module.css';

function GoalCompletionModal({
    goal,
    goalType,
    programs = [],
    treeData,
    targets = [],
    activityDefinitions = [],
    onConfirm,
    onCancel
}) {
    const completionDate = new Date();

    // Find programs this goal belongs to (traverse up the tree to find program)
    const findProgramsForGoal = () => {
        if (!treeData) return [];

        // For now, the root of the tree is typically the program
        // We'll show the root as the associated program
        const foundPrograms = [];
        if (programs && programs.length > 0) {
            foundPrograms.push(...programs);
        } else if (treeData) {
            // Fallback: use the root node name as the program
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
                    ✓ Confirm Goal Completion
                </h3>
            </div>

            {/* Goal Name */}
            <div className={styles.goalCard}>
                <div className={styles.cardLabel}>
                    Completing Goal:
                </div>
                <div className={styles.cardTitle}>
                    {goal.name}
                </div>
                <div className={styles.cardType}>
                    Type: {goalType}
                </div>
            </div>

            {/* Completion Date */}
            <div>
                <label className={styles.sectionLabel}>
                    Will be marked as completed:
                </label>
                <div className={styles.infoBox}>
                    📅 {completionDate.toLocaleDateString()} at {completionDate.toLocaleTimeString()}
                </div>
            </div>

            {/* Associated Programs */}
            <div>
                <label className={styles.sectionLabel}>
                    Programs that will log this completion:
                </label>
                {associatedPrograms.length === 0 ? (
                    <div className={styles.emptyText}>
                        No programs found
                    </div>
                ) : (
                    <div className={styles.listColumn}>
                        {associatedPrograms.map((program, idx) => (
                            <div key={idx} className={styles.listItem}>
                                <span className={styles.programIcon}>📁</span>
                                {program.name}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Associated Targets */}
            <div>
                <label className={styles.sectionLabel}>
                    Targets associated with this goal ({targets.length}):
                </label>
                {targets.length === 0 ? (
                    <div className={styles.emptyText}>
                        No targets defined for this goal
                    </div>
                ) : (
                    <div className={styles.listColumn}>
                        {targets.map(target => {
                            const activity = activityDefinitions.find(a => a.id === target.activity_id);
                            return (
                                <div key={target.id} className={styles.targetItem}>
                                    <div className={styles.targetName}>
                                        🎯 {target.name || activity?.name || 'Target'}
                                    </div>
                                    {target.metrics && target.metrics.length > 0 && (
                                        <div className={styles.metricList}>
                                            {target.metrics.map(metric => {
                                                const metricDef = activity?.metric_definitions?.find(m => m.id === metric.metric_id);
                                                return (
                                                    <span key={metric.metric_id} className={styles.metricBadge}>
                                                        {metricDef?.name || 'Metric'}: {metric.value} {metricDef?.unit || ''}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}
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
                    className={styles.cancelButton}
                >
                    Cancel
                </button>
                <button
                    onClick={() => onConfirm(completionDate)}
                    className={styles.confirmButton}
                >
                    ✓ Complete Goal
                </button>
            </div>
        </div>
    );
}

export default GoalCompletionModal;
