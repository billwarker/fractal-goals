import { Suspense, useEffect, useMemo, useState } from 'react';

import { prepareActivityDefinitionCopy, prepareActivityDefinitionDraft } from '../../utils/activityBuilder';
import { getProgramsAffectedByGoalCompletion } from '../../utils/goalCompletionPrograms';
import { getTypeDisplayName } from '../../utils/goalHelpers';
import { findGoalNodeById } from '../../utils/goalNodeModel';
import { getGoalCompletionCondition, getGoalCondition } from '../../utils/goalConditions';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { useSequenceCompletionChoice } from '../../hooks/useGoalSequenceQueries';
import notify from '../../utils/notify';
import CloseButton from '../atoms/CloseButton';
import GoalIcon from '../atoms/GoalIcon';
import ModalBackdrop from '../atoms/ModalBackdrop';
import ViewToggleTabs from '../common/ViewToggleTabs';
import GoalCompletionModal from '../goals/GoalCompletionModal';
import GoalEditForm from '../goals/GoalEditForm';
import GoalHeader from '../goals/GoalHeader';
import GoalUncompletionModal from '../goals/GoalUncompletionModal';
import GoalViewMode from '../goals/GoalViewMode';
import GoalDetailModalFooter from './GoalDetailModalFooter';
import GoalDetailModalPortal from './GoalDetailModalPortal';
import styles from '../GoalDetailModal.module.css';

const ActivityAssociator = lazyWithRetry(() => import('./ActivityAssociator'), 'components/goalDetail/ActivityAssociator');
const InlineActivityBuilder = lazyWithRetry(() => import('./InlineActivityBuilderModal'), 'components/goalDetail/InlineActivityBuilderModal');
const GoalOptionsView = lazyWithRetry(() => import('../goals/GoalOptionsView'), 'components/goals/GoalOptionsView');
const GoalNotesView = lazyWithRetry(() => import('./GoalNotesView'), 'components/goalDetail/GoalNotesView');
function GoalDetailModalRenderSurface({
    activitiesAssociateAction,
    activityBuilderReturnView,
    activityBuilderTemplate,
    activityDefinitions,
    activityGroups,
    activityPickerFooterActions,
    associatedActivities,
    associatedActivityGroups,
    attachInlineCreatedActivity,
    canAddChildGoal,
    childType,
    completedColor,
    completedSecondaryColor,
    completedTextColor,
    completionCondition,
    completionFooterState,
    conditionDraft,
    conditionErrors,
    conditionSnapshot,
    contentScrollRef,
    deadline,
    description,
    displayGoalColor,
    displayGoalSecondaryColor,
    displayMode,
    displayTextColor,
    errors,
    goal,
    goalColor,
    goalCompletionNote,
    goalForSmart,
    goalHeaderRef,
    goalHeaderStickyOffset,
    goalId,
    goalIsSmart,
    goalStatus,
    goalType,
    getGoalColor,
    getGoalIcon,
    getGoalSecondaryColor,
    handleAddChildGoal,
    handleCancel,
    handleCancelActivitiesFlow,
    handleClose,
    handleCompletionConfirm,
    handleCompletionFooterClick,
    handleCopyActivityFromActivities,
    handleCreateActivityFromActivities,
    handleEditDetails,
    handleGoalViewNavigation,
    onTimelineExplore,
    handleQuickGoalNote,
    handleSave,
    handleUncompletionConfirm,
    inheritParentActivities,
    isActivitiesAssociationMode,
    isActivityBuilderOpen,
    isCompleted,
    isEditing,
    isPaused,
    levelConfig,
    localCompletedAt,
    mode,
    name,
    needsLevelPicker,
    onDelete,
    onGoalSelect,
    onMobileCollapse,
    onToggleCompletion,
    parentGoal,
    parentGoalColor,
    parentGoalName,
    parentType,
    persistAssociations,
    portalTarget,
    overlayClassName,
    programs,
    readOnly,
    readOnlyAssociatedActivities,
    readOnlyAssociatedActivityGroups,
    readOnlyNotes,
    readOnlyTimelineEntries,
    refreshAssociations,
    registerActivitiesAssociateAction,
    registerActivitiesAssociateCancelAction,
    registerActivityPickerFooterActions,
    relevanceStatement,
    rootId,
    selectedChildType,
    setActivityBuilderReturnView,
    setActivityBuilderTemplate,
    setActivityGroups,
    setAssociatedActivities,
    setAssociatedActivityGroups,
    setCompletionCondition,
    setConditionDraft,
    setDeadline,
    setDescription,
    setInheritParentActivities,
    setIsActivitiesAssociationMode,
    setIsActivityBuilderOpen,
    setIsEditing,
    setName,
    setRelevanceStatement,
    setSelectedChildType,
    setStartedAt,
    startedAt,
    setViewState,
    textColor,
    treeData,
    validChildTypes,
    viewState,
}) {
    // Intentionally refresh the preview timestamp when entering a new modal subview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const completionPreviewDate = useMemo(() => new Date(), [viewState]);
    const programsAffectedByCompletion = useMemo(() => (
        getProgramsAffectedByGoalCompletion({
            programs,
            treeData,
            goalId,
            mode: 'complete',
            referenceDate: completionPreviewDate,
        })
    ), [completionPreviewDate, goalId, programs, treeData]);
    // The parent whose due date the edit form checks against: the create-mode parent, else the
    // goal's parent in the tree.
    const deadlineParentGoal = useMemo(() => {
        if (mode === 'create') return parentGoal || null;
        const parentId = goal?.attributes?.parent_id || goal?.parent_id;
        return parentId && treeData && !Array.isArray(treeData) ? findGoalNodeById(treeData, parentId) : null;
    }, [goal?.attributes?.parent_id, goal?.parent_id, mode, parentGoal, treeData]);
    const programsAffectedByUncompletion = useMemo(() => (
        getProgramsAffectedByGoalCompletion({
            programs,
            treeData,
            goalId,
            mode: 'uncomplete',
            completedAt: localCompletedAt || goal?.attributes?.completed_at || goal?.completed_at,
        })
    ), [
        goal?.attributes?.completed_at,
        goal?.completed_at,
        goalId,
        localCompletedAt,
        programs,
        treeData,
    ]);
    const savedConditionActivityId = getGoalCompletionCondition(goal) === 'activity_threshold'
        ? (getGoalCondition(goal)?.activity_definition_id ?? null)
        : null;
    const uncompletionCompletedAt = localCompletedAt || goal?.attributes?.completed_at || goal?.completed_at;
    const [completionNoteDraft, setCompletionNoteDraft] = useState('');
    const sequenceChoice = useSequenceCompletionChoice({ rootId, goalId, goal, viewState, readOnly });
    useEffect(() => {
        if (viewState !== 'complete-confirm') {
            setCompletionNoteDraft('');
        }
    }, [viewState]);

    const renderLevelPicker = () => (
        <div className={styles.levelPickerContainer}>
            <div className={styles.levelPickerHeader}>
                <CloseButton
                    onClick={handleClose}
                    className={styles.levelPickerClose}
                    size={20}
                />
            </div>
            <p className={styles.levelPickerPrompt}>
                What level of goal do you want to create under{' '}
                <strong
                    className={styles.levelPickerParentName}
                    style={{ '--level-picker-accent': getGoalColor(parentType) }}
                >
                    {parentGoal?.attributes?.name || parentGoal?.name}
                </strong>?
            </p>
            <div className={styles.levelPickerGrid}>
                {validChildTypes.map((type) => {
                    const color = getGoalColor(type);
                    const secondaryColor = getGoalSecondaryColor(type);
                    const icon = getGoalIcon(type);
                    return (
                        <button
                            key={type}
                            className={styles.levelPickerOption}
                            style={{ '--level-picker-accent': color }}
                            onClick={() => setSelectedChildType(type)}
                        >
                            <GoalIcon
                                shape={icon}
                                color={color}
                                secondaryColor={secondaryColor}
                                size={20}
                                className={styles.levelPickerIcon}
                            />
                            {getTypeDisplayName(type)}
                        </button>
                    );
                })}
            </div>
            {onGoalSelect && parentGoal && (
                <button
                    onClick={() => onGoalSelect(parentGoal)}
                    className={styles.levelPickerBack}
                >
                    ← Back
                </button>
            )}
        </div>
    );

    const renderGoalContent = () => {
        return (
            <>
                {isEditing ? (
                    /* ============ EDIT MODE ============ */
                    <GoalEditForm
                        mode={mode}
                        goal={goal}
                        goalId={goalId}
                        rootId={rootId}
                        goalType={goalType}
                        goalColor={displayGoalColor}
                        textColor={displayTextColor}
                        parentGoal={parentGoal}
                        parentGoalName={parentGoalName}
                        parentGoalColor={parentGoalColor}
                        deadlineParentGoal={deadlineParentGoal}
                        levelConfig={levelConfig}
                        isCompleted={isCompleted}
                        validChildTypes={validChildTypes}
                        onLevelChange={setSelectedChildType}
                        name={name} setName={setName}
                        description={description} setDescription={setDescription}
                        deadline={deadline} setDeadline={setDeadline}
                        relevanceStatement={relevanceStatement} setRelevanceStatement={setRelevanceStatement}
                        startedAt={startedAt} setStartedAt={setStartedAt}
                        completionCondition={completionCondition} setCompletionCondition={setCompletionCondition}
                        conditionDraft={conditionDraft} setConditionDraft={setConditionDraft}
                        conditionErrors={conditionErrors}
                        associatedActivities={associatedActivities} setAssociatedActivities={setAssociatedActivities}
                        associatedActivityGroups={associatedActivityGroups} setAssociatedActivityGroups={setAssociatedActivityGroups}
                        activityDefinitions={activityDefinitions}
                        activityGroups={activityGroups} setActivityGroups={setActivityGroups}
                        setViewState={setViewState}
                        refreshAssociations={refreshAssociations}
                        handleCancel={handleCancel}
                        handleSave={handleSave}
                        showActions={false}
                        errors={errors}
                    />
                ) : (
                    /* ============ VIEW MODE ============ */
                    <GoalViewMode
                        mode={mode}
                        goal={goal}
                        goalId={goalId}
                        rootId={rootId}
                        goalType={goalType}
                        goalColor={displayGoalColor}
                        textColor={displayTextColor}
                        parentGoalName={parentGoalName}
                        parentGoalColor={parentGoalColor}
                        isCompleted={isCompleted}
                        levelConfig={levelConfig}
                        childType={childType}
                        displayMode={displayMode}
                        programs={programs}
                        associatedActivities={readOnly ? (readOnlyAssociatedActivities || []) : associatedActivities}
                        activityDefinitions={readOnly ? (readOnlyAssociatedActivities || []) : activityDefinitions}
                        conditionSnapshot={conditionSnapshot}
                        portalTarget={portalTarget}
                        overlayClassName={overlayClassName}
                        onCompleteNow={readOnly || isPaused || !onToggleCompletion ? undefined : () => setViewState('complete-confirm')}
                        treeData={treeData}
                        name={name}
                        description={description}
                        deadline={deadline}
                        relevanceStatement={relevanceStatement}
                        goalCompletionNote={goalCompletionNote}
                        onTimelineExplore={onTimelineExplore}
                        readOnlyTimelineEntries={readOnlyTimelineEntries}
                        setViewState={setViewState}
                        onClose={handleClose}
                        onGoalSelect={onGoalSelect}
                        readOnly={readOnly}
                    />
                )
                }
            </>
        );
    };

    const READ_ONLY_VIEW_STATES = ['goal', 'goal-activities', 'goal-notes'];
    let content;
    if (readOnly && !READ_ONLY_VIEW_STATES.includes(viewState)) {
        content = renderGoalContent();
    } else if (viewState === 'complete-confirm') {
        content = (
            <GoalCompletionModal
                programs={programsAffectedByCompletion}
                goal={goal}
                activityDefinitions={activityDefinitions}
                completionDate={completionPreviewDate}
                accentColor={goalColor}
                goalType={goalType}
                completionNote={completionNoteDraft}
                onCompletionNoteChange={setCompletionNoteDraft}
                sequenceNextStep={sequenceChoice.nextStep}
                beginNext={sequenceChoice.beginNext}
                onBeginNextChange={sequenceChoice.setBeginNext}
            />
        );
    } else if (viewState === 'uncomplete-confirm') {
        content = (
            <GoalUncompletionModal
                programs={programsAffectedByUncompletion}
                goal={goal}
                activityDefinitions={activityDefinitions}
                completedAt={uncompletionCompletedAt}
                accentColor={completedColor}
                goalType={goalType}
                goalCompletionNote={goalCompletionNote}
                sequenceResumedStep={sequenceChoice.resumedStep}
                pauseNext={sequenceChoice.pauseNext}
                onPauseNextChange={sequenceChoice.setPauseNext}
            />
        );
    } else if (viewState === 'activity-associator') {
        content = (
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
                    goalName={name}
                    isEditing={true}
                    conditionActivityId={savedConditionActivityId}
                    viewMode="selector"
                    onCloseSelector={() => setViewState('goal')}
                    goalType={goalType}
                    headerColor="var(--color-text-primary)"
                    onClose={handleClose}
                    onSave={!isEditing ? persistAssociations : undefined}
                    onRefreshAssociations={refreshAssociations}
                    inheritParentActivities={inheritParentActivities}
                    setInheritParentActivities={setInheritParentActivities}
                    onCreateActivity={(seed) => {
                        setActivityBuilderReturnView('activity-associator');
                        setActivityBuilderTemplate(prepareActivityDefinitionDraft(seed));
                        setIsActivityBuilderOpen(true);
                    }}
                    onCopyActivity={(activity) => {
                        setActivityBuilderReturnView('activity-associator');
                        setActivityBuilderTemplate(prepareActivityDefinitionCopy(activity));
                        setIsActivityBuilderOpen(true);
                    }}
                />
            </Suspense>
        );
    } else if (viewState === 'goal-activities' && readOnly) {
        content = (
            <Suspense fallback={null}>
                <ActivityAssociator
                    associatedActivities={readOnlyAssociatedActivities || []}
                    setAssociatedActivities={() => {}}
                    associatedActivityGroups={readOnlyAssociatedActivityGroups || []}
                    setAssociatedActivityGroups={() => {}}
                    activityDefinitions={activityDefinitions}
                    activityGroups={activityGroups}
                    setActivityGroups={() => {}}
                    rootId={rootId}
                    goalId={goalId}
                    parentGoalId={goal?.attributes?.parent_id || goal?.parent_id}
                    goalName={name}
                    embedded
                    readOnly
                    inheritParentActivities={inheritParentActivities}
                    dividerColor={displayGoalColor}
                />
            </Suspense>
        );
    } else if (viewState === 'goal-activities') {
        content = (
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
                    goalName={name}
                    isEditing={true}
                    conditionActivityId={savedConditionActivityId}
                    embedded
                    useFooterAssociateAction
                    registerAssociateAction={registerActivitiesAssociateAction}
                    registerAssociateCancelAction={registerActivitiesAssociateCancelAction}
                    onAssociationFlowChange={setIsActivitiesAssociationMode}
                    registerPickerFooterActions={registerActivityPickerFooterActions}
                    onClose={handleClose}
                    onSave={persistAssociations}
                    onRefreshAssociations={refreshAssociations}
                    inheritParentActivities={inheritParentActivities}
                    setInheritParentActivities={setInheritParentActivities}
                    dividerColor={displayGoalColor}
                    onCreateActivity={handleCreateActivityFromActivities}
                    onCopyActivity={handleCopyActivityFromActivities}
                />
            </Suspense>
        );
    } else if (viewState === 'goal-options') {
        content = (
            <Suspense fallback={null}>
                <GoalOptionsView
                    goal={goal}
                    goalId={goalId}
                    rootId={rootId}
                    goalColor={displayGoalColor}
                    textColor={displayTextColor}
                    goalType={goalType}
                    treeData={treeData}
                    onGoalSelect={onGoalSelect}
                    setViewState={setViewState}
                    setIsEditing={setIsEditing}
                    onDelete={onDelete}
                    onClose={handleClose}
                    displayMode={displayMode}
                />
            </Suspense>
        );
    } else if (viewState === 'goal-notes') {
        content = (
            <Suspense fallback={null}>
                <GoalNotesView
                    rootId={rootId}
                    goalId={goalId}
                    hideComposer
                    readOnlyNotes={readOnlyNotes}
                />
            </Suspense>
        );
    } else if (needsLevelPicker && selectedChildType === null) {
        content = renderLevelPicker();
    } else {
        content = renderGoalContent();
    }

    const shouldShowPersistentHeader = (viewState === 'goal' || viewState === 'goal-options' || viewState === 'goal-notes' || viewState === 'goal-activities' || viewState === 'complete-confirm' || viewState === 'uncomplete-confirm')
        && !(needsLevelPicker && selectedChildType === null);
    if (shouldShowPersistentHeader) {
        const headerTabs = mode !== 'create' ? (
            <ViewToggleTabs
                items={[
                    { value: 'goal', label: 'Details' },
                    { value: 'goal-activities', label: 'Activities' },
                    { value: 'goal-notes', label: 'Notes' },
                ]}
                value={viewState}
                onChange={handleGoalViewNavigation}
                ariaLabel="Goal detail views"
                className={styles.goalViewTabs}
                style={{
                    '--view-toggle-panel-bg': 'var(--color-bg-surface)',
                }}
            />
        ) : null;

        content = (
            <>
                <GoalHeader
                    mode={mode}
                    name={name}
                    goal={goalForSmart}
                    goalType={goalType}
                    goalColor={displayGoalColor}
                    goalSecondaryColor={mode !== 'create' && (isCompleted || goalIsSmart) ? displayGoalSecondaryColor : null}
                    goalIcon={getGoalIcon(goalType)}
                    goalIsSmart={mode !== 'create' && goalIsSmart}
                    parentGoal={parentGoal}
                    onClose={handleClose}
                    onCollapse={onMobileCollapse}
                    deadline={deadline}
                    goalStatus={goalStatus}
                    isCompleted={isCompleted}
                    completedAt={localCompletedAt || goal?.attributes?.completed_at || goal?.completed_at}
                    headerTabs={headerTabs}
                    headerRef={goalHeaderRef}
                />
                <div
                    className={styles.afterHeaderContent}
                    style={{ '--goal-detail-sticky-offset': `${goalHeaderStickyOffset}px` }}
                >
                    {content}
                </div>
            </>
        );
    }

    const showGoalNoteComposer = !readOnly
        && viewState === 'goal-notes'
        && mode !== 'create'
        && Boolean(rootId && goalId)
        && !['complete-confirm', 'uncomplete-confirm'].includes(viewState);
    const showCreateFooter = viewState === 'goal'
        && mode === 'create'
        && isEditing
        && !(needsLevelPicker && selectedChildType === null);
    const showEditFooter = viewState === 'goal'
        && mode !== 'create'
        && !readOnly
        && isEditing;
    const showDetailFooter = viewState === 'goal'
        && mode !== 'create'
        && !readOnly
        && !isEditing;
    const showActivitiesFooter = viewState === 'goal-activities'
        && mode !== 'create'
        && !readOnly
        && Boolean(activitiesAssociateAction);
    const showCompletionConfirmFooter = (viewState === 'complete-confirm' || viewState === 'uncomplete-confirm')
        && mode !== 'create'
        && !readOnly;
    const showOptionsFooter = viewState === 'goal-options'
        && mode !== 'create'
        && !readOnly;
    const completionConfirmAccentColor = viewState === 'uncomplete-confirm' ? completedColor : goalColor;
    const completionConfirmTextColor = viewState === 'uncomplete-confirm' ? completedTextColor : textColor;
    const isAssociationFlowActive = isActivitiesAssociationMode;
    const footerContent = (
        <GoalDetailModalFooter
            showGoalNoteComposer={showGoalNoteComposer}
            handleQuickGoalNote={handleQuickGoalNote}
            showCreateFooter={showCreateFooter}
            showEditFooter={showEditFooter}
            handleCancel={handleCancel}
            handleSave={handleSave}
            displayGoalColor={displayGoalColor}
            displayTextColor={displayTextColor}
            showActivitiesFooter={showActivitiesFooter}
            showCompletionConfirmFooter={showCompletionConfirmFooter}
            isUncompletionConfirm={viewState === 'uncomplete-confirm'}
            completionConfirmAccentColor={completionConfirmAccentColor}
            completionConfirmTextColor={completionConfirmTextColor}
            onCancelCompletionConfirm={() => setViewState('goal')}
            onConfirmCompletion={() => handleCompletionConfirm(completionPreviewDate, completionNoteDraft, sequenceChoice.completionOptions)}
            onConfirmUncompletion={() => handleUncompletionConfirm(sequenceChoice.uncompletionOptions)}
            isAssociationFlowActive={isAssociationFlowActive}
            activityPickerFooterActions={activityPickerFooterActions}
            handleCancelActivitiesFlow={handleCancelActivitiesFlow}
            activitiesAssociateAction={activitiesAssociateAction}
            showOptionsFooter={showOptionsFooter}
            onCancelOptions={() => handleGoalViewNavigation('goal')}
            showDetailFooter={showDetailFooter}
            handleEditDetails={handleEditDetails}
            handleGoalViewNavigation={handleGoalViewNavigation}
            canAddChildGoal={canAddChildGoal}
            handleAddChildGoal={handleAddChildGoal}
            onToggleCompletion={onToggleCompletion}
            handleCompletionFooterClick={handleCompletionFooterClick}
            completionFooterState={completionFooterState}
            isCompleted={isCompleted}
            isPaused={isPaused}
            completedColor={completedColor}
            completedSecondaryColor={completedSecondaryColor}
            displayGoalSecondaryColor={displayGoalSecondaryColor}
            completedTextColor={completedTextColor}
        />
    );

    const activityBuilderModal = isActivityBuilderOpen ? (
        <Suspense fallback={null}>
            <InlineActivityBuilder
                rootId={rootId}
                goalId={goalId}
                activityGroups={activityGroups}
                activityTemplate={activityBuilderTemplate}
                onSuccess={async (newActivity) => {
                    if (newActivity && newActivity.id) {
                        const attachment = await attachInlineCreatedActivity(newActivity);
                        if (goalId && !attachment.associatedImmediately) {
                            notify.error(`Created "${newActivity.name}", but could not associate it with this goal.`);
                        }
                    }
                }}
                onCancel={() => {
                    setActivityBuilderTemplate(null);
                    setIsActivityBuilderOpen(false);
                    setViewState(activityBuilderReturnView);
                }}
            />
        </Suspense>
    ) : null;
    if (displayMode === 'panel') {
        return (
            <>
                <div className={`${styles.panelContainer} ${readOnly ? styles.readOnlySurface : ''}`}>
                    <div className={styles.panelContent} ref={contentScrollRef}>
                        {content}
                    </div>
                    {footerContent && (
                        <div className={styles.panelNoteComposer}>
                            {footerContent}
                        </div>
                    )}
                </div>
                {activityBuilderModal}
            </>
        );
    }

    const modalMarkup = (
        <ModalBackdrop
            className={`${styles.modalOverlay} ${overlayClassName}`}
            onClose={handleClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={mode === 'create' ? 'New goal' : (goal?.attributes?.name || goal?.name || name || 'Goal details')}
                onClick={(e) => e.stopPropagation()}
                className={`${styles.modalContent} ${readOnly ? styles.readOnlySurface : ''}`}
                style={{ '--goal-detail-accent': displayGoalColor }}
            >
                <div className={styles.modalScrollArea} ref={contentScrollRef}>
                    {content}
                </div>
                {footerContent && (
                    <div className={styles.modalNoteComposer}>
                        {footerContent}
                    </div>
                )}
            </div>
            {activityBuilderModal}
        </ModalBackdrop>
    );

    return (
        <>
            <GoalDetailModalPortal portalTarget={portalTarget}>{modalMarkup}</GoalDetailModalPortal>
        </>
    );
}

export default GoalDetailModalRenderSurface;
