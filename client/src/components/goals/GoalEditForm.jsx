import React from 'react';
import Input from '../atoms/Input';
import CompletionConditionEditor from '../goalDetail/CompletionConditionEditor';
import GoalReviewCadence from '../goalDetail/GoalReviewCadence';
import { deadlineContextForGoal, deadlineWarnings, describeDeadlineWarning } from '../../utils/goalDeadlineRules';
import { useTimezone } from '../../contexts/TimezoneContext';
import { getISOYMDInTimezone } from '../../utils/dateUtils';
import { formatDueDate } from '../../utils/goalDueFormat';
import { getGoalReview } from '../../utils/goalReview';
import { getValidChildTypes } from '../../utils/goalHelpers';
import { isExecutionGoalType } from '../../utils/goalNodeModel';
import AttachableField from '../notes/AttachableField';
import GoalDescriptionMedia from './GoalDescriptionMedia';
import styles from '../GoalDetailModal.module.css'; // Reusing the same styles for now

function GoalEditForm({
    mode,
    goal,
    rootId,
    goalType,
    goalColor,
    textColor,
    parentGoal,
    deadlineParentGoal = null,
    levelConfig = null,
    // Level selection in create mode
    // Form state from useGoalForm
    name, setName,
    description, setDescription,
    descriptionAttachments = null,
    deadline, setDeadline,
    startedAt, setStartedAt,
    reviewCadence = null, setReviewCadence,
    reviewsOn = true, setReviewsOn,
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
    const { timezone } = useTimezone();
    const today = getISOYMDInTimezone(new Date(), timezone || 'UTC');
    const canCompleteViaChildren = getValidChildTypes(goalType).length > 0;
    const usesReviews = Boolean(levelConfig?.uses_reviews);
    const levelCadence = levelConfig?.review_cadence_value && levelConfig?.review_cadence_unit
        ? { value: levelConfig.review_cadence_value, unit: levelConfig.review_cadence_unit }
        : null;
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

            <div className={styles.fieldGroup}>
                <label className={styles.label} style={{ color: 'var(--color-text-primary)' }} htmlFor="goal-description">
                    Description
                </label>
                {descriptionAttachments ? (
                    <>
                        <AttachableField draft={descriptionAttachments} label="Attachments for this description">
                            <textarea
                                id="goal-description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                onPaste={descriptionAttachments.handlePaste}
                                placeholder="Write your goal's description here. Optionally attach pictures or video with the paperclip, or paste or drop them in."
                                rows={3}
                                className={styles.textarea}
                            />
                        </AttachableField>
                        <GoalDescriptionMedia draft={descriptionAttachments} rootId={rootId} />
                    </>
                ) : (
                    <textarea
                        id="goal-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Write your goal's description here."
                        rows={3}
                        className={styles.textarea}
                    />
                )}
            </div>

            {/* Review - SMART "R" (Reviewed), on levels that review goals */}
            {usesReviews && mode !== 'create' && setReviewCadence && (
                <div className={styles.fieldGroup}>
                    <label className={styles.label} style={{ color: 'var(--color-text-primary)' }}>
                        Review (SMART)
                    </label>
                    <GoalReviewCadence
                        review={getGoalReview(goal)}
                        today={today}
                        startedAt={startedAt}
                        createdAt={goal?.attributes?.created_at}
                        paused={Boolean(goal?.paused)}
                        enabled={reviewsOn}
                        onEnabledChange={setReviewsOn}
                        cadence={reviewCadence}
                        levelCadence={levelCadence}
                        onChange={setReviewCadence}
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
                    goalName={name}
                    canCompleteViaChildren={canCompleteViaChildren}
                    errors={conditionErrors}
                    rootId={rootId}
                    goalId={mode === 'create' ? null : (goal?.id ?? goal?.attributes?.id ?? null)}
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
