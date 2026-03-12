import React, { Suspense, lazy } from 'react';
import Input from '../atoms/Input';
import Checkbox from '../atoms/Checkbox';
import { isAboveShortTermGoal } from '../../utils/goalHelpers';
import { isExecutionGoalType } from '../../utils/goalNodeModel';
import styles from '../GoalDetailModal.module.css'; // Reusing the same styles for now

const TargetManager = lazy(() => import('../goalDetail/TargetManager'));
const ActivityAssociator = lazy(() => import('../goalDetail/ActivityAssociator'));

function GoalEditForm({
    mode,
    goal,
    goalId,
    rootId,
    goalType,
    goalColor,
    textColor,
    parentGoal,
    parentGoalName,
    parentGoalColor,
    isCompleted,
    // Form state from useGoalForm
    name, setName,
    description, setDescription,
    deadline, setDeadline,
    relevanceStatement, setRelevanceStatement,
    trackActivities, setTrackActivities,
    completedViaChildren, setCompletedViaChildren,
    inheritParentActivities, setInheritParentActivities,
    allowManualCompletion, setAllowManualCompletion,
    targets, setTargets,
    // Association state
    associatedActivities, setAssociatedActivities,
    associatedActivityGroups, setAssociatedActivityGroups,
    activityDefinitions,
    activityGroups, setActivityGroups,
    // Handlers
    setViewState,
    refreshAssociations,
    handleCancel,
    handleSave,
    errors = {}
}) {
    return (
        <div className={styles.editContainer}>
            <div className={styles.fieldGroup}>
                <label className={styles.label} style={{ color: goalColor }}>
                    Name
                </label>
                <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={errors.name ? styles.inputError : ''}
                />
                {errors.name && <div className={styles.errorText}>{errors.name}</div>}
            </div>

            {goalType !== 'NanoGoal' && (
                <div className={styles.fieldGroup}>
                    <label className={styles.label} style={{ color: goalColor }}>
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
            {goalType !== 'NanoGoal' && ((goal?.attributes?.parent_id || mode === 'create' && parentGoalName) || goalType === 'UltimateGoal') && (
                <div className={styles.fieldGroup}>
                    <label className={styles.label} style={{ color: goalColor }}>
                        Relevance (SMART)
                    </label>
                    <div className={styles.relevanceInfo}>
                        {goalType === 'UltimateGoal'
                            ? "Why does this Ultimate Goal matter to you?"
                            : <span>How does this goal help you achieve <span style={{ color: parentGoalColor || 'var(--color-text-primary)', fontWeight: 'bold' }}>{parentGoalName}</span><span style={{ color: parentGoalColor || 'var(--color-text-primary)', fontWeight: 'bold' }}>?</span></span>
                        }
                    </div>
                    <textarea
                        value={relevanceStatement}
                        onChange={(e) => setRelevanceStatement(e.target.value)}
                        rows={2}
                        placeholder={goalType === 'UltimateGoal' ? "Explain why this ultimate goal is important to you..." : "Explain how this goal contributes to your higher-level objective..."}
                        className={styles.textarea}
                        style={{
                            border: relevanceStatement?.trim() ? '1px solid #4caf50' : null
                        }}
                    />
                </div>
            )}

            {!isExecutionGoalType(goalType) && (
                <div className={styles.fieldGroup}>
                    <label className={styles.label} style={{ color: goalColor }}>
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
            {goalType !== 'NanoGoal' && (
                <div className={styles.progressBox}>
                    <label className={styles.label} style={{ marginBottom: '10px', color: goalColor }}>
                        How is progress measured? (Select all that apply)
                    </label>
                    <div className={styles.checkboxGroup}>
                        <Checkbox
                            label="Activities & Targets"
                            checked={trackActivities}
                            onChange={(e) => setTrackActivities(e.target.checked)}
                            className={styles.checkboxLabel}
                        />
                        {isAboveShortTermGoal(goalType) && (
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
                        {trackActivities && (
                            <div className={styles.infoItem}>
                                <span style={{ fontSize: '13px' }}>✓</span>
                                <span>Goal is complete when target(s) are achieved.</span>
                            </div>
                        )}

                        {completedViaChildren && (
                            <div className={styles.infoItem}>
                                <span style={{ fontSize: '13px' }}>✓</span>
                                <span>Goal is complete when all child goals are done (Delegated).</span>
                            </div>
                        )}

                        {allowManualCompletion && (
                            <div className={styles.infoItem}>
                                <span style={{ fontSize: '13px' }}>✓</span>
                                <span>Goal can be marked as complete by the user.</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Associated Activities Section - Edit/Create Mode */}
            {trackActivities && goalType !== 'NanoGoal' && (
                <Suspense fallback={null}>
                    <ActivityAssociator
                        associatedActivities={associatedActivities}
                        setAssociatedActivities={setAssociatedActivities}
                        associatedActivityGroups={associatedActivityGroups}
                        setAssociatedActivityGroups={setAssociatedActivityGroups}
                        activityDefinitions={activityDefinitions}
                        activityGroups={activityGroups}
                        setActivityGroups={setActivityGroups}
                        rootId={rootId}
                        goalId={goalId}
                        parentGoalId={mode === 'create' ? (parentGoal?.attributes?.id || parentGoal?.id) : (goal?.attributes?.parent_id || goal?.parent_id)}
                        setTargets={setTargets}
                        isEditing={true}
                        targets={targets}
                        goalName={name}
                        viewMode="list"
                        onOpenSelector={() => setViewState('activity-associator')}
                        completedViaChildren={completedViaChildren}
                        isAboveShortTermGoal={isAboveShortTermGoal(goalType)}
                        headerColor={goalColor}
                        goalType={goalType}
                        onRefreshAssociations={refreshAssociations}
                        inheritParentActivities={inheritParentActivities}
                        setInheritParentActivities={setInheritParentActivities}
                    />
                </Suspense>
            )}

            {/* Targets Section - Edit/Create Mode */}
            {trackActivities && goalType !== 'NanoGoal' && (
                <Suspense fallback={null}>
                    <TargetManager
                        targets={targets}
                        setTargets={setTargets}
                        activityDefinitions={activityDefinitions}
                        associatedActivities={associatedActivities}
                        goalId={goalId}
                        rootId={rootId}
                        isEditing={true}
                        viewMode="list"
                        onOpenBuilder={(target) => {
                            // Let the parent modal handle this state change
                            setViewState('target-manager', target);
                        }}
                        headerColor={goalColor}
                        goalType={goalType}
                        goalCompleted={isCompleted}
                    />
                </Suspense>
            )}

            {/* Edit Actions */}
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
        </div>
    );
}

export default GoalEditForm;
