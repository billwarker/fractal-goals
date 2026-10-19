import React from 'react';
import Input from '../atoms/Input';
import CompletionConditionEditor from '../goalDetail/CompletionConditionEditor';
import { deadlineContextForGoal, deadlineWarnings, describeDeadlineWarning } from '../../utils/goalDeadlineRules';
import { formatDueDate } from '../../utils/goalDueFormat';
import { getValidChildTypes } from '../../utils/goalHelpers';
import { isExecutionGoalType } from '../../utils/goalNodeModel';
import styles from '../GoalDetailModal.module.css'; // Reusing the same styles for now

function GoalEditForm({
    mode,
    goal,
    goalType,
    goalColor,
    textColor,
    parentGoal,
    parentGoalName,
    deadlineParentGoal = null,
    levelConfig = null,
    // Level selection in create mode
    // Form state from useGoalForm
    name, setName,
    description, setDescription,
    deadline, setDeadline,
    relevanceStatement, setRelevanceStatement,
    startedAt, setStartedAt,
    completionCondition, setCompletionCondition,
    conditionDraft, setConditionDraft,
    conditionErrors = {},
    activityDefinitions = [],
    associatedActivities = [],
    // Handlers
    handleCancel,
    handleSave,
    showActions = true,
    errors = {}
}) {
    const canCompleteViaChildren = getValidChildTypes(goalType).length > 0;
    // Due-date rules are soft guidance: the date is saved either way, with these warnings.
    const deadlineIssues = deadlineWarnings(deadline, deadlineContextForGoal(
        { ...(goal?.attributes || goal || {}), started_at: startedAt || goal?.attributes?.started_at || goal?.attributes?.created_at },
        { parent: deadlineParentGoal || parentGoal, children: mode === 'create' ? [] : goal?.children || [], level: levelConfig },
    ));
    return (
        <div
            className={styles.editContainer}
            style={{ '--goal-edit-accent': goalColor }}
        >
            <div className={styles.fieldGroup}>
                <label className={styles.label} style={{ color: 'var(--color-text-primary)' }} htmlFor="goal-name">
                    Name
                </label>
                <Input
                    id="goal-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={errors.name ? styles.inputError : ''}
                />
                {errors.name && <div className={styles.errorText}>{errors.name}</div>}
            </div>

            {(
                <div className={styles.fieldGroup}>
                    <label className={styles.label} style={{ color: 'var(--color-text-primary)' }} htmlFor="goal-description">
                        Description
                    </label>
                    <textarea
                        id="goal-description"
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

            <div className={styles.dateRow}>
                <div className={styles.fieldGroup}>
                    <label className={styles.label} style={{ color: 'var(--color-text-primary)' }} htmlFor="goal-started-at">
                        Start date
                    </label>
                    <Input
                        id="goal-started-at"
                        type="date"
                        value={startedAt}
                        onChange={(e) => setStartedAt(e.target.value)}
                        max={deadline || undefined}
                    />
                </div>
                {!isExecutionGoalType(goalType) && (
                    <div className={styles.fieldGroup}>
                        <label className={styles.label} style={{ color: 'var(--color-text-primary)' }} htmlFor="goal-deadline">
                            Deadline
                        </label>
                        <Input
                            id="goal-deadline"
                            type="date"
                            value={deadline}
                            onChange={(e) => setDeadline(e.target.value)}
                            min={startedAt || undefined}
                            aria-describedby={deadlineIssues.length ? 'goal-deadline-warnings' : undefined}
                        />
                    </div>
                )}
            </div>
            <p className={styles.fieldHint}>Activity before the start date and after the deadline doesn’t count toward completion.</p>
            {deadlineIssues.length > 0 ? (
                <ul className={styles.deadlineWarnings} id="goal-deadline-warnings">
                    {deadlineIssues.map((warning) => (
                        <li key={warning.code}>{describeDeadlineWarning(warning, (iso) => formatDueDate(iso, deadline))}</li>
                    ))}
                </ul>
            ) : null}

            <div className={styles.fieldGroup}>
                <label className={styles.label} style={{ color: 'var(--color-text-primary)' }}>
                    How does this goal complete?
                </label>
                <CompletionConditionEditor
                    completionCondition={completionCondition}
                    onCompletionConditionChange={setCompletionCondition}
                    draft={conditionDraft}
                    onDraftChange={setConditionDraft}
                    activityDefinitions={activityDefinitions}
                    associatedActivityIds={(associatedActivities || []).map((activity) => activity.id)}
                    canCompleteViaChildren={canCompleteViaChildren}
                    errors={conditionErrors}
                />
            </div>

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
