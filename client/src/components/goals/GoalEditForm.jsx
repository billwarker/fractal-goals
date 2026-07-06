import React from 'react';
import Input from '../atoms/Input';
import Checkbox from '../atoms/Checkbox';
import CheckIcon from '../atoms/CheckIcon';
import { getValidChildTypes } from '../../utils/goalHelpers';
import { getGoalNodeChildren, isExecutionGoalType } from '../../utils/goalNodeModel';
import styles from '../GoalDetailModal.module.css'; // Reusing the same styles for now

function GoalEditForm({
    mode,
    goal,
    goalType,
    goalColor,
    textColor,
    parentGoal,
    parentGoalName,
    // Level selection in create mode
    // Form state from useGoalForm
    name, setName,
    description, setDescription,
    deadline, setDeadline,
    relevanceStatement, setRelevanceStatement,
    trackActivities, setTrackActivities,
    completedViaChildren, setCompletedViaChildren,
    allowManualCompletion, setAllowManualCompletion,
    // Handlers
    handleCancel,
    handleSave,
    showActions = true,
    errors = {}
}) {
    const showActivityTargetProgress = mode !== 'create';
    const canCompleteViaChildren = getValidChildTypes(goalType).length > 0;
    const hasChildGoals = mode !== 'create' && getGoalNodeChildren(goal).length > 0;
    const completedViaChildrenInfo = hasChildGoals
        ? 'Goal will be marked as complete when all child goals are completed.'
        : 'Goal will be marked as complete when all child goals are completed (no child goals created yet).';

    return (
        <div
            className={styles.editContainer}
            style={{ '--goal-edit-accent': goalColor }}
        >
            <div className={styles.fieldGroup}>
                <label className={styles.label} style={{ color: 'var(--color-text-primary)' }}>
                    Name
                </label>
                <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={errors.name ? styles.inputError : ''}
                />
                {errors.name && <div className={styles.errorText}>{errors.name}</div>}
            </div>

            {(
                <div className={styles.fieldGroup}>
                    <label className={styles.label} style={{ color: 'var(--color-text-primary)' }}>
                        Description
                    </label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        className={styles.textarea}
                    />
                </div>
            )}

            {/* Relevance Statement - SMART "R" Criterion */}
            {((goal?.attributes?.parent_id || mode === 'create' && parentGoalName) || goalType === 'UltimateGoal') && (
                <div className={styles.fieldGroup}>
                    <label className={styles.label} style={{ color: 'var(--color-text-primary)' }}>
                        Relevance (SMART)
                    </label>
                    <div className={styles.relevanceInfo}>
                        {goalType === 'UltimateGoal'
                            ? "Why does this Ultimate Goal matter to you?"
                            : <span>How does this goal help you achieve <span style={{ color: 'var(--color-text-primary)', fontWeight: 'bold' }}>{parentGoalName}</span><span style={{ color: 'var(--color-text-primary)', fontWeight: 'bold' }}>?</span></span>
                        }
                    </div>
                    <textarea
                        value={relevanceStatement}
                        onChange={(e) => setRelevanceStatement(e.target.value)}
                        rows={2}
                        placeholder={goalType === 'UltimateGoal' ? "Explain why this ultimate goal is important to you..." : "Explain how this goal contributes to your higher-level objective..."}
                        className={`${styles.textarea} ${relevanceStatement?.trim() ? styles.relevanceTextareaFilled : ''}`}
                    />
                </div>
            )}

            {!isExecutionGoalType(goalType) && (
                <div className={styles.fieldGroup}>
                    <label className={styles.label} style={{ color: 'var(--color-text-primary)' }}>
                        Deadline
                    </label>
                    <Input
                        type="date"
                        value={deadline}
                        onChange={(e) => setDeadline(e.target.value)}
                        max={parentGoal?.attributes?.deadline?.split('T')[0] || parentGoal?.deadline?.split('T')[0]}
                    />
                </div>
            )}

            {/* How is progress measured? */}
            {(
                <div className={styles.fieldGroup}>
                    <label className={styles.label} style={{ color: 'var(--color-text-primary)' }}>
                        How is progress measured? (Select all that apply)
                    </label>
                    <div className={styles.progressBox}>
                        <div className={styles.checkboxGroup}>
                            {showActivityTargetProgress && (
                                <Checkbox
                                    label="Activities & Targets"
                                    checked={trackActivities}
                                    onChange={(e) => setTrackActivities(e.target.checked)}
                                    className={styles.checkboxLabel}
                                />
                            )}
                            {canCompleteViaChildren && (
                                <Checkbox
                                    label="Completed via Children"
                                    checked={completedViaChildren}
                                    onChange={(e) => setCompletedViaChildren(e.target.checked)}
                                    className={styles.checkboxLabel}
                                />
                            )}
                            <Checkbox
                                label="Manual Completion"
                                checked={allowManualCompletion}
                                onChange={(e) => setAllowManualCompletion(e.target.checked)}
                                className={styles.checkboxLabel}
                            />
                        </div>

                        <div className={styles.infoList}>
                            {showActivityTargetProgress && trackActivities && (
                                <div className={styles.infoItem}>
                                    <CheckIcon size={13} />
                                    <span>Goal is complete when target(s) are achieved.</span>
                                </div>
                            )}

                            {completedViaChildren && (
                                <div className={styles.infoItem}>
                                    <CheckIcon size={13} />
                                    <span>{completedViaChildrenInfo}</span>
                                </div>
                            )}

                            {allowManualCompletion && (
                                <div className={styles.infoItem}>
                                    <CheckIcon size={13} />
                                    <span>Goal can be marked as complete by the user.</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showActions && (
                <div className={styles.editActions}>
                    <button
                        onClick={handleCancel}
                        className={styles.btnCancel}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className={styles.btnSave}
                        style={{
                            background: goalColor,
                            color: textColor,
                        }}
                    >
                        {mode === 'create' ? 'Create' : 'Save'}
                    </button>
                </div>
            )}
        </div>
    );
}

export default GoalEditForm;
