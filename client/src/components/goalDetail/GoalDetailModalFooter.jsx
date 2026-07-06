import SidePaneNotePanel from '../common/SidePaneNotePanel';
import styles from '../GoalDetailModal.module.css';

function GoalDetailModalFooter({
    showGoalNoteComposer,
    handleQuickGoalNote,
    showCreateFooter,
    showEditFooter,
    handleCancel,
    handleSave,
    displayGoalColor,
    displayTextColor,
    showCompletionConfirmFooter,
    isUncompletionConfirm,
    completionConfirmAccentColor,
    completionConfirmTextColor,
    onCancelCompletionConfirm,
    onConfirmCompletion,
    onConfirmUncompletion,
    showActivitiesFooter,
    isTargetSelectionMode,
    isAssociationFlowActive,
    activityPickerFooterActions,
    isTargetFlowActive,
    handleCancelActivitiesFlow,
    activitiesAssociateAction,
    handleAddTargetFromActivities,
    showOptionsFooter,
    onCancelOptions,
    showDetailFooter,
    handleEditDetails,
    handleGoalViewNavigation,
    canAddChildGoal,
    handleAddChildGoal,
    onToggleCompletion,
    handleCompletionFooterClick,
    completionFooterState,
    isCompleted,
    isPaused,
    completedColor,
    completedSecondaryColor,
    displayGoalSecondaryColor,
    completedTextColor,
}) {
    return showGoalNoteComposer ? (
        <SidePaneNotePanel
            composerOnly
            onSubmit={handleQuickGoalNote}
            placeholder="Add a goal note..."
            className={styles.modalFooterComposer}
        />
    ) : (showCreateFooter || showEditFooter) ? (
        <div className={styles.completionFooter}>
            <div className={`${styles.completionFooterActions} ${styles.completionFooterSplit}`}>
                <button
                    type="button"
                    onClick={handleCancel}
                    className={styles.completionFooterButton}
                    style={{
                        '--completion-accent': displayGoalColor,
                        '--completion-text': 'var(--color-text-primary)',
                    }}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    className={`${styles.completionFooterButton} ${styles.editFooterSaveButton}`}
                    style={{
                        '--completion-accent': displayGoalColor,
                        '--completion-text': displayTextColor,
                    }}
                >
                    {showCreateFooter ? 'Create' : 'Save'}
                </button>
            </div>
        </div>
    ) : showCompletionConfirmFooter ? (
        <div className={styles.completionFooter}>
            <div className={`${styles.completionFooterActions} ${styles.completionFooterSplit}`}>
                <button
                    type="button"
                    onClick={onCancelCompletionConfirm}
                    className={styles.completionFooterButton}
                    style={{
                        '--completion-accent': completionConfirmAccentColor,
                        '--completion-text': 'var(--color-text-primary)',
                    }}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={isUncompletionConfirm ? onConfirmUncompletion : onConfirmCompletion}
                    className={`${styles.completionFooterButton} ${styles.editFooterSaveButton}`}
                    style={{
                        '--completion-accent': completionConfirmAccentColor,
                        '--completion-text': completionConfirmTextColor,
                    }}
                >
                    {isUncompletionConfirm ? 'Mark Incomplete' : 'Complete Goal'}
                </button>
            </div>
        </div>
    ) : showActivitiesFooter ? (
        <div className={styles.completionFooter}>
            {isTargetSelectionMode && (
                <div
                    className={styles.targetSelectionBanner}
                    role="status"
                    style={{ '--target-selection-accent': displayGoalColor }}
                >
                    Select the activity you want to create a target for.
                </div>
            )}
            {isAssociationFlowActive && activityPickerFooterActions ? (
                <div className={`${styles.completionFooterActions} ${styles.activitiesFooterSelectionActions}`}>
                    <button
                        type="button"
                        onClick={activityPickerFooterActions.onCancel}
                        className={styles.completionFooterButton}
                        style={{
                            '--completion-accent': displayGoalColor,
                            '--completion-text': 'var(--color-text-primary)',
                        }}
                    >
                        {activityPickerFooterActions.cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={activityPickerFooterActions.onClear}
                        className={styles.completionFooterButton}
                        disabled={!activityPickerFooterActions.canClear}
                        style={{
                            '--completion-accent': displayGoalColor,
                            '--completion-text': 'var(--color-text-primary)',
                        }}
                    >
                        {activityPickerFooterActions.clearLabel}
                    </button>
                    <button
                        type="button"
                        onClick={activityPickerFooterActions.onConfirm}
                        className={`${styles.completionFooterButton} ${styles.activitiesFooterConfirmButton}`}
                        disabled={!activityPickerFooterActions.canConfirm}
                        style={{
                            '--completion-accent': displayGoalColor,
                            '--completion-text': activityPickerFooterActions.canConfirm
                                ? displayTextColor
                                : 'var(--color-text-secondary)',
                        }}
                    >
                        {activityPickerFooterActions.confirmLabel}
                    </button>
                </div>
            ) : (
                <div className={`${styles.completionFooterActions} ${styles.completionFooterSplit}`}>
                    <button
                        type="button"
                        onClick={isTargetFlowActive ? handleCancelActivitiesFlow : activitiesAssociateAction}
                        className={`${styles.completionFooterButton} ${isAssociationFlowActive ? styles.completionFooterButtonActive : ''}`}
                        disabled={isAssociationFlowActive}
                        style={{
                            '--completion-accent': displayGoalColor,
                            '--completion-text': 'var(--color-text-primary)',
                        }}
                    >
                        {isTargetFlowActive ? 'Cancel' : '+ Associate Activities'}
                    </button>
                    <button
                        type="button"
                        onClick={isAssociationFlowActive ? handleCancelActivitiesFlow : handleAddTargetFromActivities}
                        className={`${styles.completionFooterButton} ${isTargetFlowActive ? styles.completionFooterButtonActive : ''}`}
                        disabled={isTargetFlowActive}
                        style={{
                            '--completion-accent': displayGoalColor,
                            '--completion-text': 'var(--color-text-primary)',
                        }}
                    >
                        {isAssociationFlowActive ? 'Cancel' : '+ Add Target'}
                    </button>
                </div>
            )}
        </div>
    ) : showOptionsFooter ? (
        <div className={styles.completionFooter}>
            <div className={styles.completionFooterActions}>
                <button
                    type="button"
                    onClick={onCancelOptions}
                    className={styles.completionFooterButton}
                    style={{
                        '--completion-accent': displayGoalColor,
                        '--completion-text': 'var(--color-text-primary)',
                    }}
                >
                    Cancel
                </button>
            </div>
        </div>
    ) : showDetailFooter ? (
        <div className={styles.completionFooter}>
            <div className={`${styles.completionFooterActions} ${styles.completionFooterMulti}`}>
                <button
                    type="button"
                    onClick={handleEditDetails}
                    className={styles.completionFooterButton}
                    style={{
                        '--completion-accent': displayGoalColor,
                        '--completion-text': 'var(--color-text-primary)',
                    }}
                >
                    Edit
                </button>
                <button
                    type="button"
                    onClick={() => handleGoalViewNavigation('goal-options')}
                    className={styles.completionFooterButton}
                    style={{
                        '--completion-accent': displayGoalColor,
                        '--completion-text': 'var(--color-text-primary)',
                    }}
                >
                    Options
                </button>
                {canAddChildGoal && (
                    <button
                        type="button"
                        onClick={handleAddChildGoal}
                        className={styles.completionFooterButton}
                        style={{
                            '--completion-accent': displayGoalColor,
                            '--completion-text': 'var(--color-text-primary)',
                        }}
                    >
                        + Add Child Goal
                    </button>
                )}
                {onToggleCompletion && (
                    <button
                        type="button"
                        onClick={handleCompletionFooterClick}
                        disabled={!completionFooterState.canToggleCompletion}
                        className={`${styles.completionFooterButton} ${isCompleted ? styles.completionFooterDone : ''} ${isPaused ? styles.completionFooterPaused : ''}`}
                        style={{
                            '--completion-accent': isCompleted ? completedColor : displayGoalColor,
                            '--completion-secondary': isCompleted ? completedSecondaryColor : displayGoalSecondaryColor,
                            '--completion-text': isCompleted ? completedTextColor : 'var(--color-text-primary)',
                        }}
                    >
                        {completionFooterState.label}
                    </button>
                )}
            </div>
        </div>
    ) : null;
}

export default GoalDetailModalFooter;
