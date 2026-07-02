import { Suspense } from 'react';
import { createPortal } from 'react-dom';

import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { prepareActivityDefinitionCopy } from '../../utils/activityBuilder';
import { getTypeDisplayName } from '../../utils/goalHelpers';
import notify from '../../utils/notify';
import GoalCompletionModal from '../goals/GoalCompletionModal';
import GoalUncompletionModal from '../goals/GoalUncompletionModal';
import GoalHeader from '../goals/GoalHeader';
import GoalViewMode from '../goals/GoalViewMode';
import GoalEditForm from '../goals/GoalEditForm';
import CloseButton from '../atoms/CloseButton';
import GoalIcon from '../atoms/GoalIcon';
import ModalBackdrop from '../atoms/ModalBackdrop';
import ViewToggleTabs from '../common/ViewToggleTabs';
import GoalDetailModalFooter from './GoalDetailModalFooter';
import GraphProfileLoadingFallback from './GraphProfileLoadingFallback';
import styles from '../GoalDetailModal.module.css';

const TargetManager = lazyWithRetry(() => import('./TargetManager'), 'components/goalDetail/TargetManager');
const ActivityAssociator = lazyWithRetry(() => import('./ActivityAssociator'), 'components/goalDetail/ActivityAssociator');
const InlineActivityBuilder = lazyWithRetry(() => import('./InlineActivityBuilderModal'), 'components/goalDetail/InlineActivityBuilderModal');
const GraphProfileModal = lazyWithRetry(() => import('../analytics/graphs/GraphProfileModal'), 'components/analytics/graphs/GraphProfileModal');
const TargetAnalyticsModal = lazyWithRetry(() => import('./TargetAnalyticsModal'), 'components/goalDetail/TargetAnalyticsModal');
const GoalOptionsView = lazyWithRetry(() => import('../goals/GoalOptionsView'), 'components/goals/GoalOptionsView');
const GoalNotesView = lazyWithRetry(() => import('./GoalNotesView'), 'components/goalDetail/GoalNotesView');
const GoalTimelineView = lazyWithRetry(() => import('./GoalTimelineView'), 'components/goalDetail/GoalTimelineView');

function GoalDetailModalRenderSurface({
    activeAnalyticsTarget,
    activitiesAssociateAction,
    activityBuilderReturnView,
    activityBuilderTemplate,
    activityDefinitions,
    activityGroups,
    activityPickerFooterActions,
    allowManualCompletion,
    associatedActivities,
    associatedActivityGroups,
    attachInlineCreatedActivity,
    builderConfig,
    canAddChildGoal,
    childType,
    completedColor,
    completedSecondaryColor,
    completedTextColor,
    completedViaChildren,
    completionFooterState,
    contentScrollRef,
    dailyDurationsData,
    deadline,
    depGoalId,
    description,
    displayGoalColor,
    displayGoalSecondaryColor,
    displayMode,
    displayTextColor,
    errors,
    fetchedMetrics,
    goal,
    goalColor,
    goalForSmart,
    goalHeaderRef,
    goalHeaderStickyOffset,
    goalId,
    goalIsSmart,
    goalSecondaryColor,
    goalStatus,
    goalType,
    handleAddChildGoal,
    handleAddTargetFromActivities,
    handleCancel,
    handleCancelActivitiesFlow,
    handleClose,
    handleCompletionConfirm,
    handleCompletionFooterClick,
    handleCopyActivityFromActivities,
    handleCreateActivityFromActivities,
    handleEditDetails,
    handleGoalViewNavigation,
    handleQuickGoalNote,
    handleSave,
    handleSelectTargetActivity,
    handleUncompletionConfirm,
    inheritParentActivities,
    isActivitiesAssociationMode,
    isActivityBuilderOpen,
    isCompleted,
    isDailyDurationsError,
    isDailyDurationsFetching,
    isDailyDurationsLoading,
    isEditing,
    isPaused,
    isTargetSelectionMode,
    isTimeGraphOpen,
    levelConfig,
    localCompletedAt,
    mode,
    name,
    needsLevelPicker,
    onClose,
    onDelete,
    onGoalSelect,
    onMobileCollapse,
    onToggleCompletion,
    onUpdate,
    parentGoal,
    parentGoalColor,
    parentGoalName,
    parentType,
    persistAssociations,
    persistTargetChanges,
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
    setActiveAnalyticsTarget,
    setActivityBuilderReturnView,
    setActivityBuilderTemplate,
    setActivityGroups,
    setAssociatedActivities,
    setAssociatedActivityGroups,
    setAllowManualCompletion,
    setBuilderConfig,
    setCompletedViaChildren,
    setDeadline,
    setDescription,
    setInheritParentActivities,
    setIsActivitiesAssociationMode,
    setIsActivityBuilderOpen,
    setIsEditing,
    setIsTimeGraphOpen,
    setName,
    setRelevanceStatement,
    setSelectedChildType,
    setTargetManagerReturnView,
    setTargetToEdit,
    setTargets,
    setTrackActivities,
    setViewState,
    targetManagerReturnView,
    targetToEdit,
    targets,
    textColor,
    trackActivities,
    treeData,
    validChildTypes,
    viewState,
}) {
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
                        isCompleted={isCompleted}
                        validChildTypes={validChildTypes}
                        onLevelChange={setSelectedChildType}
                        name={name} setName={setName}
                        description={description} setDescription={setDescription}
                        deadline={deadline} setDeadline={setDeadline}
                        relevanceStatement={relevanceStatement} setRelevanceStatement={setRelevanceStatement}
                        trackActivities={trackActivities} setTrackActivities={setTrackActivities}
                        completedViaChildren={completedViaChildren} setCompletedViaChildren={setCompletedViaChildren}
                        inheritParentActivities={inheritParentActivities} setInheritParentActivities={setInheritParentActivities}
                        allowManualCompletion={allowManualCompletion} setAllowManualCompletion={setAllowManualCompletion}
                        targets={targets} setTargets={setTargets}
                        associatedActivities={associatedActivities} setAssociatedActivities={setAssociatedActivities}
                        associatedActivityGroups={associatedActivityGroups} setAssociatedActivityGroups={setAssociatedActivityGroups}
                        activityDefinitions={activityDefinitions}
                        activityGroups={activityGroups} setActivityGroups={setActivityGroups}
                        setViewState={(view, target) => {
                            if (target) setTargetToEdit(target);
                            if (view === 'target-manager') setTargetManagerReturnView('goal');
                            setViewState(view);
                        }}
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
                        allowManualCompletion={allowManualCompletion}
                        trackActivities={trackActivities}
                        childType={childType}
                        displayMode={displayMode}
                        programs={programs}
                        targets={targets}
                        associatedActivities={readOnly ? (readOnlyAssociatedActivities || []) : associatedActivities}
                        activityDefinitions={readOnly ? (readOnlyAssociatedActivities || []) : activityDefinitions}
                        treeData={treeData}
                        name={name}
                        description={description}
                        deadline={deadline}
                        relevanceStatement={relevanceStatement}
                        setViewState={setViewState}
                        onClose={handleClose}
                        onGoalSelect={onGoalSelect}
                        onUpdate={onUpdate}
                        setTargets={setTargets}
                        onTargetClick={readOnly ? undefined : setActiveAnalyticsTarget}
                        onRequestTargetBuilder={readOnly ? undefined : (target) => setBuilderConfig({ target: target ?? null })}
                        readOnly={readOnly}
                    />
                )
                }
            </>
        );
    };

    const READ_ONLY_VIEW_STATES = ['goal', 'goal-timeline', 'goal-activities', 'goal-notes'];
    let content;
    if (readOnly && !READ_ONLY_VIEW_STATES.includes(viewState)) {
        content = renderGoalContent();
    } else if (viewState === 'complete-confirm') {
        content = (
            <GoalCompletionModal
                goal={goal}
                goalType={goalType}
                programs={programs}
                treeData={treeData}
                targets={targets}
                activityDefinitions={activityDefinitions}
                onConfirm={handleCompletionConfirm}
                onCancel={() => setViewState('goal')}
            />
        );
    } else if (viewState === 'uncomplete-confirm') {
        content = (
            <GoalUncompletionModal
                goal={goal}
                goalType={goalType}
                programs={programs}
                treeData={treeData}
                targets={targets}
                activityDefinitions={activityDefinitions}
                completedAt={localCompletedAt}
                onConfirm={handleUncompletionConfirm}
                onCancel={() => setViewState('goal')}
            />
        );
    } else if (viewState === 'target-manager') {
        content = (
            <Suspense fallback={null}>
                <TargetManager
                    targets={targets}
                    setTargets={setTargets}
                    activityDefinitions={activityDefinitions}
                    associatedActivities={associatedActivities}
                    goalId={goalId}
                    rootId={rootId}
                    isEditing={true}
                    viewMode="builder"
                    headerColor="var(--color-text-muted)"
                    initialTarget={targetToEdit}
                    onCloseBuilder={() => {
                        setTargetToEdit(null);
                        setViewState(targetManagerReturnView);
                    }}
                    goalType={goalType}
                    goalCompleted={isCompleted}
                    onSave={(newTargets) => {
                        if (onUpdate && goalId) {
                            onUpdate(goalId, {
                                name,
                                description,
                                deadline,
                                relevance_statement: relevanceStatement,
                                targets: newTargets,
                                inherit_parent_activities: inheritParentActivities,
                            });
                        }
                        setViewState(targetManagerReturnView);
                    }}
                />
            </Suspense>
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
                    setTargets={setTargets}
                    isEditing={true}
                    targets={targets}
                    viewMode="selector"
                    onCloseSelector={() => setViewState('goal')}
                    goalType={goalType}
                    headerColor="var(--color-text-primary)"
                    onClose={handleClose}
                    onSave={!isEditing ? persistAssociations : undefined}
                    onRefreshAssociations={refreshAssociations}
                    inheritParentActivities={inheritParentActivities}
                    setInheritParentActivities={setInheritParentActivities}
                    onCreateActivity={() => {
                        setActivityBuilderReturnView('activity-associator');
                        setActivityBuilderTemplate(null);
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
                    setTargets={() => {}}
                    targets={targets}
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
                    setTargets={setTargets}
                    isEditing={true}
                    targets={targets}
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
                    isTargetSelectionMode={isTargetSelectionMode}
                    onSelectTargetActivity={handleSelectTargetActivity}
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
    } else if (viewState === 'goal-timeline') {
        content = (
            <Suspense fallback={null}>
                <GoalTimelineView
                    rootId={rootId}
                    goalId={goalId}
                    metrics={fetchedMetrics}
                    onTimeSpentClick={readOnly ? undefined : () => setIsTimeGraphOpen(true)}
                    readOnlyEntries={readOnlyTimelineEntries}
                />
            </Suspense>
        );
    } else if (needsLevelPicker && selectedChildType === null) {
        content = renderLevelPicker();
    } else {
        content = renderGoalContent();
    }

    const shouldShowPersistentHeader = (viewState === 'goal' || viewState === 'goal-options' || viewState === 'goal-notes' || viewState === 'goal-timeline' || viewState === 'goal-activities')
        && !(needsLevelPicker && selectedChildType === null);
    if (shouldShowPersistentHeader) {
        const headerTabs = mode !== 'create' ? (
            <ViewToggleTabs
                items={[
                    { value: 'goal', label: 'Details' },
                    { value: 'goal-timeline', label: 'Timeline' },
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
                    textColor={displayTextColor}
                    parentGoal={parentGoal}
                    onClose={handleClose}
                    onCollapse={onMobileCollapse}
                    deadline={deadline}
                    goalStatus={goalStatus}
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
    const isTargetFlowActive = isTargetSelectionMode;
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
            isTargetSelectionMode={isTargetSelectionMode}
            isAssociationFlowActive={isAssociationFlowActive}
            activityPickerFooterActions={activityPickerFooterActions}
            isTargetFlowActive={isTargetFlowActive}
            handleCancelActivitiesFlow={handleCancelActivitiesFlow}
            activitiesAssociateAction={activitiesAssociateAction}
            handleAddTargetFromActivities={handleAddTargetFromActivities}
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

    const timeGraphModal = isTimeGraphOpen ? (
        <Suspense fallback={
            <GraphProfileLoadingFallback
                title={name || goal?.name || 'Time Spent'}
                color={displayGoalColor}
                onClose={() => setIsTimeGraphOpen(false)}
            />
        }>
            <GraphProfileModal
                profileId="goalDuration"
                title={name || goal?.name || 'Time Spent'}
                onClose={() => setIsTimeGraphOpen(false)}
                data={{
                    goal: {
                        id: depGoalId,
                        name: name || goal?.name,
                        type: goalType,
                        color: displayGoalColor,
                    },
                    points: dailyDurationsData?.points || [],
                    metrics: fetchedMetrics,
                }}
                isLoading={isDailyDurationsLoading || isDailyDurationsFetching}
                isError={isDailyDurationsError}
            />
        </Suspense>
    ) : null;

    const activityBuilderModal = isActivityBuilderOpen ? (
        <Suspense fallback={null}>
            <InlineActivityBuilder
                rootId={rootId}
                goalId={goalId}
                activityGroups={activityGroups}
                activityTemplate={activityBuilderTemplate}
                onSuccess={async (newActivity) => {
                    if (newActivity && newActivity.id) {
                        await attachInlineCreatedActivity(newActivity);
                        if (goalId) {
                            notify.success(`Associated "${newActivity.name}" with goal`);
                        }
                    }
                    setActivityBuilderTemplate(null);
                    setIsActivityBuilderOpen(false);
                    setViewState(activityBuilderReturnView);
                }}
                onCancel={() => {
                    setActivityBuilderTemplate(null);
                    setIsActivityBuilderOpen(false);
                    setViewState(activityBuilderReturnView);
                }}
            />
        </Suspense>
    ) : null;


    const targetAnalyticsModal = activeAnalyticsTarget ? (
        <Suspense fallback={null}>
            <TargetAnalyticsModal
                mode="view"
                rootId={rootId}
                goalId={goalId}
                target={activeAnalyticsTarget}
                goalColor={displayGoalColor}
                goalType={goalType}
                goalCompleted={isCompleted}
                targets={targets}
                setTargets={setTargets}
                activityDefinitions={activityDefinitions}
                associatedActivities={associatedActivities}
                onSave={(newTargets) => { persistTargetChanges(newTargets); }}
                onDelete={(targetToDelete) => {
                    const remaining = (targets || []).filter((t) => t.id !== targetToDelete?.id);
                    setTargets?.(remaining);
                    persistTargetChanges(remaining);
                }}
                onClose={() => setActiveAnalyticsTarget(null)}
            />
        </Suspense>
    ) : null;

    const targetBuilderModal = (!readOnly && builderConfig) ? (
        <Suspense fallback={null}>
            <TargetAnalyticsModal
                mode={builderConfig.target ? 'edit' : 'add'}
                rootId={rootId}
                goalId={goalId}
                target={builderConfig.target ?? null}
                goalColor={displayGoalColor}
                goalType={goalType}
                goalCompleted={isCompleted}
                targets={targets}
                setTargets={setTargets}
                activityDefinitions={activityDefinitions}
                associatedActivities={associatedActivities}
                initialActivityId={builderConfig.activityId ?? null}
                lockActivitySelection={Boolean(builderConfig.lock)}
                onSave={(newTargets) => {
                    persistTargetChanges(newTargets);
                    setBuilderConfig(null);
                }}
                onSaved={({ action }) => {
                    if (action === 'create') {
                        setViewState('goal');
                    }
                }}
                onClose={() => setBuilderConfig(null)}
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
                {timeGraphModal}
                {activityBuilderModal}
                {targetAnalyticsModal}
                {targetBuilderModal}
            </>
        );
    }

    const modalMarkup = (
        <ModalBackdrop
            className={styles.modalOverlay}
            onClose={handleClose}
        >
            <div
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
            {createPortal(modalMarkup, document.body)}
            {timeGraphModal}
            {targetAnalyticsModal}
            {targetBuilderModal}
        </>
    );
}

export default GoalDetailModalRenderSurface;
