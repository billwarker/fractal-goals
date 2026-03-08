import React, { Suspense, lazy } from 'react';

import { useGoalLevels } from '../contexts/GoalLevelsContext';
import useGoalAssociationMutations from '../hooks/useGoalAssociationMutations';
import useGoalDetailController from '../hooks/useGoalDetailController';
import useGoalDurationModal from '../hooks/useGoalDurationModal';
import { useGoalForm } from '../hooks/useGoalForm';
import { useGoalAssociations, useGoalMetrics } from '../hooks/useGoalQueries';
import { getChildType } from '../utils/goalHelpers';
import notify from '../utils/notify';
import { getParentGoalInfo } from './goals/goalDetailUtils';
import GoalCompletionModal from './goals/GoalCompletionModal';
import GoalUncompletionModal from './goals/GoalUncompletionModal';
import GoalHeader from './goals/GoalHeader';
import GoalViewMode from './goals/GoalViewMode';
import GoalEditForm from './goals/GoalEditForm';

import styles from './GoalDetailModal.module.css';

const TargetManager = lazy(() => import('./goalDetail/TargetManager'));
const ActivityAssociator = lazy(() => import('./goalDetail/ActivityAssociator'));
const InlineActivityBuilder = lazy(() => import('./goalDetail/InlineActivityBuilder'));
const GenericGraphModal = lazy(() => import('./analytics/GenericGraphModal'));

/**
 * GoalDetailModal Component
 * 
 * A comprehensive, shared component for viewing and editing goal details.
 * Supports two display modes:
 * - "modal" (default): Renders as a fixed overlay modal
 * - "panel": Renders inline as a sidebar panel
 * 
 * Session Relationships:
 * - ShortTermGoals: Sessions are CHILDREN (sessions reference this goal as parent_id)
 * - ImmediateGoals: Sessions are PARENTS (this goal's parent_id is a session)
 */
function GoalDetailModal({
    isOpen,
    onClose,
    goal,
    onUpdate,
    activityDefinitions: activityDefinitionsRaw = [],
    onToggleCompletion,
    onDelete,
    onAddChild,  // Handler for adding child goals
    rootId,
    treeData,
    displayMode = 'modal',  // 'modal' or 'panel'
    programs: programsRaw = [],  // For showing associated programs on completion
    activityGroups: activityGroupsRaw,  // For activities modal grouping
    // Create mode props
    mode = 'view',  // 'view', 'edit', or 'create'
    onCreate,  // Function to call when creating a new goal
    parentGoal,  // Parent goal for context when creating
    onGoalSelect, // Handler for selecting a goal (e.g. child)
    onAssociationsChanged, // Callback when activity associations change
    onMobileCollapse,
    initialActivities = [], // Initial associated activities for create mode
    initialActivityGroups = [] // Initial associated groups for create mode
}) {
    const { getGoalColor, getGoalTextColor, getLevelByName } = useGoalLevels();
    // Normalize activityDefinitions to always be an array (handles null case)
    const activityDefinitions = Array.isArray(activityDefinitionsRaw) ? activityDefinitionsRaw : [];
    // Normalize programs to always be an array (handles null case)
    const programs = Array.isArray(programsRaw) ? programsRaw : [];

    // Use extracted form hook
    const {
        name, setName,
        description, setDescription,
        deadline, setDeadline,
        relevanceStatement, setRelevanceStatement,
        completedViaChildren, setCompletedViaChildren,
        trackActivities, setTrackActivities,
        allowManualCompletion, setAllowManualCompletion,
        targets, setTargets,
        resetForm,
        errors, validateForm
    } = useGoalForm(goal, mode);
    // Derive goal type - in create mode, use child type of parent; otherwise use goal's type
    const goalType = mode === 'create'
        ? getChildType(parentGoal?.attributes?.type || parentGoal?.type)
        : (goal?.attributes?.type || goal?.type);
    const goalId = mode === 'create' ? null : (goal?.attributes?.id || goal?.id);
    const goalColor = getGoalColor(goalType);

    const depGoalId = goal?.attributes?.id || goal?.id;
    const {
        graphModalConfig,
        openDurationModal,
        closeDurationModal,
    } = useGoalDurationModal({
        goalId: depGoalId,
        goalName: goal?.name,
        fallbackName: name,
        goalType,
        goalColor,
    });


    const {
        isEditing,
        setIsEditing,
        localCompletedAt,
        isCompleted,
        targetToEdit,
        setTargetToEdit,
        viewState,
        setViewState,
        isScrolled,
        handleScroll,
        handleClose,
        handleCancel,
        handleCompletionConfirm,
        handleUncompletionConfirm,
    } = useGoalDetailController({
        goal,
        goalId,
        mode,
        onClose,
        onToggleCompletion,
        resetForm,
    });

    // Use centralized React Query hooks for fetches
    const {
        activities: fetchedActivities,
        groups: fetchedGroups,
    } = useGoalAssociations(rootId, mode === 'create' ? null : depGoalId);

    const {
        metrics: fetchedMetrics,
    } = useGoalMetrics(mode === 'create' ? null : depGoalId);
    const {
        activityGroups,
        setActivityGroups,
        associatedActivities,
        setAssociatedActivities,
        associatedActivityGroups,
        setAssociatedActivityGroups,
        refreshAssociations,
        persistAssociations,
        attachInlineCreatedActivity,
    } = useGoalAssociationMutations({
        rootId,
        goalId: depGoalId,
        mode,
        isOpen,
        activityGroupsRaw,
        initialActivities,
        initialActivityGroups,
        fetchedActivities,
        fetchedGroups,
        onAssociationsChanged,
    });

    // For modal mode, check isOpen
    if (displayMode === 'modal' && !isOpen) return null;
    // Allow rendering without goal in create mode
    if (!goal && mode !== 'create') return null;

    const handleSave = async () => {
        if (!validateForm()) {
            notify.error('Please fix the errors before saving.');
            return;
        }

        const payload = mode === 'create' ? {
            name,
            description,
            deadline: deadline || null,
            type: goalType,
            relevance_statement: relevanceStatement,
            parent_id: parentGoal?.attributes?.id || parentGoal?.id,
            targets: targets,
            completed_via_children: completedViaChildren,
            track_activities: trackActivities,
            allow_manual_completion: allowManualCompletion
        } : {
            name,
            description,
            deadline: deadline || null,
            targets: targets,
            relevance_statement: relevanceStatement,
            completed_via_children: completedViaChildren,
            track_activities: trackActivities,
            allow_manual_completion: allowManualCompletion
        };

        if (mode === 'create') {
            try {
                const newGoal = await onCreate(payload);

                // Persist any pending activity/group associations using the new goal's ID
                const newGoalId = newGoal?.id || newGoal?.attributes?.id;
                const hasPendingActivities = associatedActivities.length > 0;
                const hasPendingGroups = associatedActivityGroups.length > 0;

                if (newGoalId && (hasPendingActivities || hasPendingGroups)) {
                    const ok = await persistAssociations(null, null, newGoalId);
                    if (ok) {
                        notify.success(`Goal created with ${hasPendingActivities ? associatedActivities.length + ' activities' : ''}${hasPendingActivities && hasPendingGroups ? ' and ' : ''}${hasPendingGroups ? associatedActivityGroups.length + ' groups' : ''} associated`);
                    } else {
                        notify.error('Goal created, but failed to associate activities');
                    }
                } else if (newGoalId) {
                    notify.success(`Goal created: ${newGoal?.name || newGoal?.attributes?.name || name}`);
                }
            } catch (err) {
                console.error('Goal creation failed EXCEPTION:', err);
                if (err.response) {
                    console.error('Goal creation error response:', err.response.data);
                }
                notify.error('Failed to create goal: ' + (err.response?.data?.error || err.message));
            }
        } else {
            onUpdate(goalId, payload);

            // Persist activity and group associations
            await persistAssociations();

            setIsEditing(false);
        }
    };

    const textColor = getGoalTextColor(goalType);
    const childType = getChildType(goalType);
    const levelConfig = getLevelByName(goalType) || {};

    const parentGoalInfo = getParentGoalInfo({ mode, parentGoal, goal, treeData });
    const parentGoalName = parentGoalInfo?.name;
    const parentGoalColor = parentGoalInfo?.type ? getGoalColor(parentGoalInfo.type) : null;

    // ============ GOAL CONTENT (VIEW/EDIT) ============
    const renderGoalContent = () => {
        // Construct a goal object with current local state for SMART status calculation
        // This ensures the indicators update immediately as user edits fields (adds targets, activities, etc.)
        const goalForSmart = {
            ...goal,
            attributes: {
                ...goal?.attributes,
                description: description,
                targets: Array.isArray(targets) ? targets : [],
                associated_activity_ids: associatedActivities ? associatedActivities.map(a => a.id) : [],
                deadline: deadline,
                relevance_statement: relevanceStatement,
                completed_via_children: completedViaChildren,
                // CRITICAL: Remove pre-calculated status so helper recalculates using our overrides
                smart_status: undefined,
                is_smart: undefined
            },
            // Also override top-level props if they exist there (the helper checks both)
            description: description,
            targets: Array.isArray(targets) ? targets : [],
            deadline: deadline,
            relevance_statement: relevanceStatement,
            completed_via_children: completedViaChildren
        };

        return (
            <>
                <Suspense fallback={null}>
                    <GenericGraphModal
                        isOpen={!!graphModalConfig}
                        onClose={closeDurationModal}
                        title={graphModalConfig?.title}
                        goalType={graphModalConfig?.goalType}
                        goalColor={graphModalConfig?.goalColor}
                        graphData={graphModalConfig?.graphData}
                        options={graphModalConfig?.options}
                    />
                </Suspense>

                <GoalHeader
                    mode={mode}
                    name={name}
                    goal={goalForSmart}
                    goalType={goalType}
                    goalColor={goalColor}
                    textColor={textColor}
                    parentGoal={parentGoal}
                    isCompleted={isCompleted}
                    onClose={handleClose}
                    onCollapse={onMobileCollapse}
                    deadline={deadline}
                    isCompact={isScrolled}
                />

                {isEditing ? (
                    /* ============ EDIT MODE ============ */
                    <GoalEditForm
                        mode={mode}
                        goal={goal}
                        goalId={goalId}
                        rootId={rootId}
                        goalType={goalType}
                        goalColor={goalColor}
                        textColor={textColor}
                        parentGoal={parentGoal}
                        parentGoalName={parentGoalName}
                        parentGoalColor={parentGoalColor}
                        isCompleted={isCompleted}
                        name={name} setName={setName}
                        description={description} setDescription={setDescription}
                        deadline={deadline} setDeadline={setDeadline}
                        relevanceStatement={relevanceStatement} setRelevanceStatement={setRelevanceStatement}
                        trackActivities={trackActivities} setTrackActivities={setTrackActivities}
                        completedViaChildren={completedViaChildren} setCompletedViaChildren={setCompletedViaChildren}
                        allowManualCompletion={allowManualCompletion} setAllowManualCompletion={setAllowManualCompletion}
                        targets={targets} setTargets={setTargets}
                        associatedActivities={associatedActivities} setAssociatedActivities={setAssociatedActivities}
                        associatedActivityGroups={associatedActivityGroups} setAssociatedActivityGroups={setAssociatedActivityGroups}
                        activityDefinitions={activityDefinitions}
                        activityGroups={activityGroups} setActivityGroups={setActivityGroups}
                        setViewState={(view, target) => {
                            if (target) setTargetToEdit(target);
                            setViewState(view);
                        }}
                        refreshAssociations={refreshAssociations}
                        handleCancel={handleCancel}
                        handleSave={handleSave}
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
                        goalColor={goalColor}
                        textColor={textColor}
                        parentGoalName={parentGoalName}
                        parentGoalColor={parentGoalColor}
                        isCompleted={isCompleted}
                        levelConfig={levelConfig}
                        allowManualCompletion={allowManualCompletion}
                        trackActivities={trackActivities}
                        completedViaChildren={completedViaChildren}
                        childType={childType}
                        displayMode={displayMode}
                        programs={programs}
                        metrics={fetchedMetrics}
                        targets={targets}
                        associatedActivities={associatedActivities}
                        activityDefinitions={activityDefinitions}
                        treeData={treeData}
                        name={name}
                        description={description}
                        deadline={deadline}
                        relevanceStatement={relevanceStatement}
                        setViewState={setViewState}
                        setIsEditing={setIsEditing}
                        onClose={handleClose}
                        onToggleCompletion={onToggleCompletion}
                        onAddChild={onAddChild}
                        onDelete={onDelete}
                        onGoalSelect={onGoalSelect}
                        onUpdate={onUpdate}
                        setTargets={setTargets}
                        handleTimeSpentClick={openDurationModal}
                    />
                )
                }
            </>
        );
    };

    // ============ DETERMINE WHICH CONTENT TO RENDER ============
    let content;
    if (viewState === 'complete-confirm') {
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
                        setViewState('goal');
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
                                targets: newTargets
                            });
                        }
                        setViewState('goal');
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
                    headerColor={goalColor}
                    onClose={handleClose}
                    onSave={!isEditing ? persistAssociations : undefined}
                    onRefreshAssociations={refreshAssociations}
                    onCreateActivity={() => {
                        // Switch to activity builder view
                        setViewState('activity-builder');
                    }}
                />
            </Suspense>
        );
    } else if (viewState === 'activity-builder') {
        content = (
            <Suspense fallback={null}>
                <InlineActivityBuilder
                    rootId={rootId}
                    goalId={goalId}
                    activityGroups={activityGroups}
                    onSuccess={async (newActivity, newActivityName) => {
                        // Automatically associate with this goal
                        if (newActivity && newActivity.id) {
                            await attachInlineCreatedActivity(newActivity);
                            notify.success(`Created activity "${newActivity.name || newActivityName}"${goalId ? ' and associated with goal' : ''}`);
                        }

                        // Go back to activity-associator view
                        setViewState('activity-associator');
                    }}
                    onCancel={() => setViewState('activity-associator')}
                />
            </Suspense>
        );
    } else {
        content = renderGoalContent();
    }

    // ============ RENDER ============


    if (displayMode === 'panel') {
        return (
            <>
                <div className={styles.panelContainer}>
                    <div
                        className={styles.panelContent}
                        onScroll={handleScroll}
                    >
                        {content}
                    </div>
                </div>
            </>
        );
    }

    // Modal mode
    return (
        <>
            <div
                className={styles.modalOverlay}
                onClick={handleClose}
            >
                <div
                    onClick={(e) => e.stopPropagation()}
                    className={styles.modalContent}
                    style={{
                        borderTop: `4px solid ${goalColor}`,
                    }}
                    onScroll={handleScroll}
                >
                    {content}
                </div>
            </div>
        </>
    );
}

export default GoalDetailModal;
