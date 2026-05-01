import React, { Suspense, useMemo, useState } from 'react';

import { useGoalLevels } from '../contexts/GoalLevelsContext';
import { useTimezone } from '../contexts/TimezoneContext';
import { useGoalAssociationMutations } from '../hooks/useGoalAssociationMutations';
import useGoalDetailController from '../hooks/useGoalDetailController';
import useGoalDurationModal from '../hooks/useGoalDurationModal';
import { useGoalForm } from '../hooks/useGoalForm';
import { useGoalNotes } from '../hooks/useGoalNotes';
import { useGoalAssociations, useGoalMetrics } from '../hooks/useGoalQueries';
import { deriveEvidenceGoalIds, getActiveLineageIds } from '../hooks/useFlowTreeMetrics';
import { getChildType, getValidChildTypes, getTypeDisplayName } from '../utils/goalHelpers';
import { flattenGoalTree, isExecutionGoalType } from '../utils/goalNodeModel';
import { isSMART } from '../utils/smartHelpers';
import notify from '../utils/notify';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import { formatDateInTimezone } from '../utils/dateUtils';
import { getParentGoalInfo } from './goals/goalDetailUtils';
import GoalCompletionModal from './goals/GoalCompletionModal';
import GoalUncompletionModal from './goals/GoalUncompletionModal';
import GoalHeader from './goals/GoalHeader';
import GoalViewMode from './goals/GoalViewMode';
import GoalEditForm from './goals/GoalEditForm';
import GoalIcon from './atoms/GoalIcon';
import SidePaneNotePanel from './common/SidePaneNotePanel';
import { GOAL_DETAIL_NAVIGATION_EVENT } from '../utils/navigationEvents';

import styles from './GoalDetailModal.module.css';

const TargetManager = lazyWithRetry(() => import('./goalDetail/TargetManager'), 'components/goalDetail/TargetManager');
const ActivityAssociator = lazyWithRetry(() => import('./goalDetail/ActivityAssociator'), 'components/goalDetail/ActivityAssociator');
const InlineActivityBuilder = lazyWithRetry(() => import('./goalDetail/InlineActivityBuilderModal'), 'components/goalDetail/InlineActivityBuilderModal');
const GenericGraphModal = lazyWithRetry(() => import('./analytics/GenericGraphModal'), 'components/analytics/GenericGraphModal');
const GoalOptionsView = lazyWithRetry(() => import('./goals/GoalOptionsView'), 'components/goals/GoalOptionsView');
const GoalNotesView = lazyWithRetry(() => import('./goalDetail/GoalNotesView'), 'components/goalDetail/GoalNotesView');
const GoalTimelineView = lazyWithRetry(() => import('./goalDetail/GoalTimelineView'), 'components/goalDetail/GoalTimelineView');

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
    sessions: sessionsRaw = [],
    evidenceGoalIds: evidenceGoalIdsRaw = null,
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
    const { timezone } = useTimezone();
    const {
        getGoalColor = () => '#4caf50',
        getGoalTextColor = () => '#ffffff',
        getGoalSecondaryColor = () => '#2e7d32',
        getGoalIcon = () => 'circle',
        getLevelByName = () => null,
    } = useGoalLevels() || {};
    // Normalize activityDefinitions to always be an array (handles null case)
    const activityDefinitions = useMemo(
        () => (Array.isArray(activityDefinitionsRaw) ? activityDefinitionsRaw : []),
        [activityDefinitionsRaw]
    );
    const sessions = useMemo(
        () => (Array.isArray(sessionsRaw) ? sessionsRaw : []),
        [sessionsRaw]
    );
    const evidenceGoalIds = useMemo(() => {
        if (evidenceGoalIdsRaw instanceof Set) {
            return evidenceGoalIdsRaw;
        }
        if (Array.isArray(evidenceGoalIdsRaw)) {
            return new Set(evidenceGoalIdsRaw.map((goalId) => String(goalId)).filter(Boolean));
        }
        return null;
    }, [evidenceGoalIdsRaw]);
    const activityGroupsFromProps = useMemo(
        () => (Array.isArray(activityGroupsRaw) ? activityGroupsRaw : []),
        [activityGroupsRaw]
    );
    // Normalize programs to always be an array (handles null case)
    const programs = Array.isArray(programsRaw) ? programsRaw : [];

    // Use extracted form hook
    const {
        name, setName,
        description, setDescription,
        deadline, setDeadline,
        relevanceStatement, setRelevanceStatement,
        completedViaChildren, setCompletedViaChildren,
        inheritParentActivities, setInheritParentActivities,
        trackActivities, setTrackActivities,
        allowManualCompletion, setAllowManualCompletion,
        targets, setTargets,
        resetForm,
        errors, validateForm
    } = useGoalForm(goal, mode);
    // In create mode, compute all valid child types for the parent.
    // When multiple levels are valid, show a level picker step before the form.
    const parentType = parentGoal?.attributes?.type || parentGoal?.type;
    const validChildTypes = mode === 'create' ? getValidChildTypes(parentType) : [];
    const defaultChildType = validChildTypes[0] ?? getChildType(parentType);
    const needsLevelPicker = mode === 'create' && validChildTypes.length > 1;
    // null = picker not yet confirmed; a type string = level chosen, show form
    const [selectedChildType, setSelectedChildType] = useState(needsLevelPicker ? null : defaultChildType);
    // Reset when the parent changes (e.g. modal reused for a different goal)
    React.useEffect(() => {
        if (mode === 'create') {
            setSelectedChildType(needsLevelPicker ? null : defaultChildType);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parentType, mode]);

    // Derive goal type. In create mode, use the confirmed selected type (or default for
    // single-option cases). If the picker is still showing, fall back to defaultChildType
    // for color/header purposes only — the form won't render yet.
    const goalType = mode === 'create'
        ? (selectedChildType || defaultChildType)
        : (goal?.attributes?.type || goal?.type);
    const goalId = mode === 'create' ? null : (goal?.attributes?.id || goal?.id);
    const { createNote: createGoalNote } = useGoalNotes(rootId, goalId);
    const goalColor = getGoalColor(goalType);
    const goalSecondaryColor = getGoalSecondaryColor(goalType);
    const goalIcon = getGoalIcon(goalType);
    const goalIsSmart = isSMART(goal);

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
        goalIcon,
        goalSecondaryColor,
        isSmart: goalIsSmart,
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

    React.useEffect(() => {
        const handleNavigationIntent = () => {
            if (displayMode === 'modal' && !isOpen) return;
            handleClose();
        };

        window.addEventListener(GOAL_DETAIL_NAVIGATION_EVENT, handleNavigationIntent);
        return () => {
            window.removeEventListener(GOAL_DETAIL_NAVIGATION_EVENT, handleNavigationIntent);
        };
    }, [displayMode, handleClose, isOpen]);

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
        activityGroupsRaw: activityGroupsFromProps,
        initialActivities,
        initialActivityGroups,
        fetchedActivities,
        fetchedGroups,
        onAssociationsChanged,
    });

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
            inherit_parent_activities: inheritParentActivities,
            track_activities: trackActivities,
            allow_manual_completion: allowManualCompletion
        } : {
            name,
            description,
            deadline: deadline || null,
            targets: targets,
            relevance_statement: relevanceStatement,
            completed_via_children: completedViaChildren,
            inherit_parent_activities: inheritParentActivities,
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
    const completedColor = getGoalColor('Completed');
    const completedTextColor = getGoalTextColor('Completed');
    const childType = getChildType(goalType);
    const levelConfig = getLevelByName(goalType) || {};

    const parentGoalInfo = getParentGoalInfo({ mode, parentGoal, goal, treeData });
    const parentGoalName = parentGoalInfo?.name;
    const parentGoalColor = parentGoalInfo?.type ? getGoalColor(parentGoalInfo.type) : null;
    const isPaused = Boolean(
        goal?.paused
        || goal?.attributes?.paused
        || goal?.frozen
        || goal?.attributes?.frozen
    );

    const goalStatus = useMemo(() => {
        if (mode === 'create') {
            return 'active';
        }

        if (isPaused) {
            return 'paused';
        }

        if (!depGoalId || !treeData) {
            return 'active';
        }

        const hasSignalInputs = evidenceGoalIds !== null
            || activityDefinitions.length > 0
            || activityGroupsFromProps.length > 0;
        if (!hasSignalInputs) {
            return 'active';
        }

        const flattenedTree = flattenGoalTree(treeData, { includeRoot: true });
        const parentById = new Map(
            flattenedTree.map((node) => [String(node.id), node.parent_id ? String(node.parent_id) : null])
        );
        const activeEvidenceGoalIds = evidenceGoalIds || deriveEvidenceGoalIds(sessions, activityDefinitions, activityGroupsFromProps);
        if (activeEvidenceGoalIds.size === 0) {
            return 'inactive';
        }

        const activeLineageIds = getActiveLineageIds(activeEvidenceGoalIds, parentById);
        return activeLineageIds.has(String(depGoalId)) ? 'active' : 'inactive';
    }, [activityDefinitions, activityGroupsFromProps, depGoalId, evidenceGoalIds, isPaused, mode, sessions, treeData]);

    const handleQuickGoalNote = async (content) => {
        if (!rootId || !goalId) {
            return;
        }
        await createGoalNote({
            content,
            context_type: 'goal',
            context_id: goalId,
            goal_id: goalId,
        });
    };

    const completionFooterState = useMemo(() => {
        const isManualAllowed = levelConfig.allow_manual_completion !== false;
        const canShowManual = allowManualCompletion && isManualAllowed && !isPaused;
        const canToggleCompletion = !isPaused && Boolean(onToggleCompletion) && (isCompleted || canShowManual);
        const isTargetsAllowed = levelConfig.track_activities !== false;
        const isChildrenAllowed = !isExecutionGoalType(goalType);
        const completedAt = localCompletedAt || goal?.attributes?.completed_at || goal?.completed_at;
        const completedLabel = completedAt
            ? `Completed on ${formatDateInTimezone(completedAt, timezone, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
            })}`
            : 'Completed';
        const label = isPaused
            ? 'Paused'
            : isCompleted
                ? completedLabel
                : canShowManual
                    ? 'Mark Complete'
                    : trackActivities && isTargetsAllowed && completedViaChildren && isChildrenAllowed
                        ? 'Complete via Children & Targets'
                        : trackActivities && isTargetsAllowed
                            ? 'Complete via Target(s)'
                            : completedViaChildren && isChildrenAllowed
                                ? 'Complete via Children'
                                : 'Auto-completing...';

        return { canShowManual, canToggleCompletion, label };
    }, [
        allowManualCompletion,
        completedViaChildren,
        goalType,
        goal?.attributes?.completed_at,
        goal?.completed_at,
        isCompleted,
        isPaused,
        levelConfig.allow_manual_completion,
        levelConfig.track_activities,
        localCompletedAt,
        onToggleCompletion,
        timezone,
        trackActivities,
    ]);

    const handleCompletionFooterClick = () => {
        if (!completionFooterState.canToggleCompletion || isPaused) {
            return;
        }
        setViewState(isCompleted ? 'uncomplete-confirm' : 'complete-confirm');
    };

    const canAddChildGoal = Boolean(onAddChild && childType && goalType !== 'ImmediateGoal' && !isCompleted);

    const handleAddChildGoal = () => {
        if (!canAddChildGoal) {
            return;
        }
        if (displayMode === 'modal' && handleClose) {
            handleClose();
        }
        onAddChild(goal);
    };

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
            inherit_parent_activities: inheritParentActivities,
            // CRITICAL: Remove pre-calculated status so helper recalculates using our overrides
            smart_status: undefined,
            is_smart: undefined
        },
        // Also override top-level props if they exist there (the helper checks both)
        description: description,
        targets: Array.isArray(targets) ? targets : [],
        deadline: deadline,
        relevance_statement: relevanceStatement,
        completed_via_children: completedViaChildren,
        inherit_parent_activities: inheritParentActivities
    };

    // For modal mode, check isOpen
    if (displayMode === 'modal' && !isOpen) return null;
    // Allow rendering without goal in create mode
    if (!goal && mode !== 'create') return null;

    // ============ LEVEL PICKER (CREATE MODE — multiple valid levels) ============
    const renderLevelPicker = () => (
        <div className={styles.levelPickerContainer}>
            <div className={styles.levelPickerHeader}>
                <button
                    onClick={handleClose}
                    aria-label="Close"
                    className={styles.levelPickerClose}
                >
                    ×
                </button>
            </div>
            <p className={styles.levelPickerPrompt}>
                What level of goal do you want to create under{' '}
                <strong style={{ color: getGoalColor(parentType) }}>{parentGoal?.attributes?.name || parentGoal?.name}</strong>?
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
                            style={{ borderColor: color, color: color }}
                            onClick={() => setSelectedChildType(type)}
                        >
                            <GoalIcon
                                shape={icon}
                                color={color}
                                secondaryColor={secondaryColor}
                                size={20}
                                style={{ flexShrink: 0 }}
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

    // ============ GOAL CONTENT (VIEW/EDIT) ============
    const renderGoalContent = () => {
        return (
            <>
                <Suspense fallback={null}>
                    <GenericGraphModal
                        isOpen={!!graphModalConfig}
                        onClose={closeDurationModal}
                        title={graphModalConfig?.title}
                        goalType={graphModalConfig?.goalType}
                        goalColor={graphModalConfig?.goalColor}
                        goalIcon={graphModalConfig?.goalIcon}
                        goalSecondaryColor={graphModalConfig?.goalSecondaryColor}
                        isSmart={graphModalConfig?.isSmart}
                        graphData={graphModalConfig?.graphData}
                        options={graphModalConfig?.options}
                        type={graphModalConfig?.type}
                    />
                </Suspense>

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
                            setViewState(view);
                        }}
                        refreshAssociations={refreshAssociations}
                        handleCancel={handleCancel}
                        handleSave={handleSave}
                        showActions={mode === 'create'}
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
                        onClose={handleClose}
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
                                targets: newTargets,
                                inherit_parent_activities: inheritParentActivities,
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
                    headerColor="var(--color-text-primary)"
                    onClose={handleClose}
                    onSave={!isEditing ? persistAssociations : undefined}
                    onRefreshAssociations={refreshAssociations}
                    inheritParentActivities={inheritParentActivities}
                    setInheritParentActivities={setInheritParentActivities}
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
                    onSuccess={async (newActivity) => {
                        if (newActivity && newActivity.id) {
                            await attachInlineCreatedActivity(newActivity);
                            if (goalId) {
                                notify.success(`Associated "${newActivity.name}" with goal`);
                            }
                        }
                        setViewState('activity-associator');
                    }}
                    onCancel={() => setViewState('activity-associator')}
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
                    goalColor={goalColor}
                    textColor={textColor}
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
                />
            </Suspense>
        );
    } else if (viewState === 'goal-timeline') {
        content = (
            <Suspense fallback={null}>
                <GoalTimelineView
                    rootId={rootId}
                    goalId={goalId}
                />
            </Suspense>
        );
    } else if (needsLevelPicker && selectedChildType === null) {
        // Show level picker before the create form when multiple levels are valid.
        content = renderLevelPicker();
    } else {
        content = renderGoalContent();
    }

    const shouldShowPersistentHeader = (viewState === 'goal' || viewState === 'goal-options' || viewState === 'goal-notes' || viewState === 'goal-timeline')
        && !(needsLevelPicker && selectedChildType === null);
    if (shouldShowPersistentHeader) {
        const headerActions = mode !== 'create' ? (
            <div className={styles.headerActions}>
                <button
                    type="button"
                    className={`${styles.headerActionButton} ${isEditing && viewState === 'goal' ? styles.headerActionActive : ''}`}
                    onClick={() => {
                        setViewState('goal');
                        setIsEditing(true);
                    }}
                    style={{ '--goal-tab-accent': goalColor }}
                >
                    Edit
                </button>
                <button
                    type="button"
                    className={`${styles.headerActionButton} ${viewState === 'goal-options' ? styles.headerActionActive : ''}`}
                    onClick={() => setViewState('goal-options')}
                    style={{ '--goal-tab-accent': goalColor }}
                >
                    Options
                </button>
            </div>
        ) : null;
        const headerTabs = mode !== 'create' ? (
            <div className={styles.goalTabRow} aria-label="Goal detail views">
                <button
                    type="button"
                    className={`${styles.goalTabButton} ${viewState === 'goal' ? styles.goalTabActive : ''}`}
                    onClick={() => setViewState('goal')}
                    style={{ '--goal-tab-accent': goalColor }}
                >
                    Details
                </button>
                <button
                    type="button"
                    className={`${styles.goalTabButton} ${viewState === 'goal-timeline' ? styles.goalTabActive : ''}`}
                    onClick={() => setViewState('goal-timeline')}
                    style={{ '--goal-tab-accent': goalColor }}
                >
                    Timeline
                </button>
                <button
                    type="button"
                    className={`${styles.goalTabButton} ${viewState === 'goal-notes' ? styles.goalTabActive : ''}`}
                    onClick={() => setViewState('goal-notes')}
                    style={{ '--goal-tab-accent': goalColor }}
                >
                    Notes
                </button>
            </div>
        ) : null;

        content = (
            <>
                <GoalHeader
                    mode={mode}
                    name={name}
                    goal={goalForSmart}
                    goalType={goalType}
                    goalColor={goalColor}
                    textColor={textColor}
                    parentGoal={parentGoal}
                    onClose={handleClose}
                    onCollapse={onMobileCollapse}
                    deadline={deadline}
                    goalStatus={goalStatus}
                    headerActions={headerActions}
                    headerTabs={headerTabs}
                />
                <div className={styles.afterHeaderContent}>
                    {content}
                </div>
            </>
        );
    }

    // ============ RENDER ============
    const showGoalNoteComposer = viewState === 'goal-notes'
        && mode !== 'create'
        && Boolean(rootId && goalId)
        && !['complete-confirm', 'uncomplete-confirm'].includes(viewState);
    const showEditFooter = viewState === 'goal'
        && mode !== 'create'
        && isEditing;
    const showCompletionFooter = viewState === 'goal'
        && mode !== 'create'
        && !isEditing
        && Boolean(onToggleCompletion);
    const footerContent = showGoalNoteComposer ? (
        <SidePaneNotePanel
            composerOnly
            onSubmit={handleQuickGoalNote}
            placeholder="Add a goal note..."
            className={styles.modalFooterComposer}
        />
    ) : showEditFooter ? (
        <div className={styles.completionFooter}>
            <div className={`${styles.completionFooterActions} ${styles.completionFooterSplit}`}>
                <button
                    type="button"
                    onClick={handleCancel}
                    className={styles.completionFooterButton}
                    style={{
                        '--completion-accent': goalColor,
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
                        '--completion-accent': goalColor,
                        '--completion-text': textColor,
                    }}
                >
                    Save
                </button>
            </div>
        </div>
    ) : showCompletionFooter ? (
        <div className={styles.completionFooter}>
            <div className={`${styles.completionFooterActions} ${canAddChildGoal ? styles.completionFooterSplit : ''}`}>
                {canAddChildGoal && (
                    <button
                        type="button"
                        onClick={handleAddChildGoal}
                        className={styles.completionFooterButton}
                        style={{
                            '--completion-accent': goalColor,
                            '--completion-text': 'var(--color-text-primary)',
                        }}
                    >
                        + Add Child Goal
                    </button>
                )}
                <button
                    type="button"
                    onClick={handleCompletionFooterClick}
                    disabled={!completionFooterState.canToggleCompletion}
                    className={`${styles.completionFooterButton} ${isCompleted ? styles.completionFooterDone : ''} ${isPaused ? styles.completionFooterPaused : ''}`}
                    style={{
                        '--completion-accent': isCompleted ? completedColor : goalColor,
                        '--completion-text': isCompleted ? completedTextColor : 'var(--color-text-primary)',
                    }}
                >
                    {completionFooterState.label}
                </button>
            </div>
        </div>
    ) : null;


    if (displayMode === 'panel') {
        return (
            <>
                <div className={styles.panelContainer}>
                    <div className={styles.panelContent}>
                        {content}
                    </div>
                    {footerContent && (
                        <div className={styles.panelNoteComposer}>
                            {footerContent}
                        </div>
                    )}
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
                >
                    <div className={styles.modalScrollArea}>
                        {content}
                    </div>
                    {footerContent && (
                        <div className={styles.modalNoteComposer}>
                            {footerContent}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

export default GoalDetailModal;
