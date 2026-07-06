import React, { useMemo, useState } from 'react';

import { useGoalLevels } from '../contexts/GoalLevelsContext';
import { useTimezone } from '../contexts/TimezoneContext';
import { useGoalAssociationMutations } from '../hooks/useGoalAssociationMutations';
import useGoalDetailController from '../hooks/useGoalDetailController';
import { useGoalForm } from '../hooks/useGoalForm';
import { useGoalNotes } from '../hooks/useGoalNotes';
import { useGoalAssociations, useGoalDailyDurations, useGoalMetrics } from '../hooks/useGoalQueries';
import { getActiveLineageIds } from '../hooks/useFlowTreeMetrics';
import { getChildType, getValidChildTypes } from '../utils/goalHelpers';
import { flattenGoalTree, isExecutionGoalType } from '../utils/goalNodeModel';
import { isSMART } from '../utils/smartHelpers';
import notify from '../utils/notify';
import { importWithRetry } from '../utils/lazyWithRetry';
import { formatDateInTimezone } from '../utils/dateUtils';
import { prepareActivityDefinitionCopy } from '../utils/activityBuilder';
import { getParentGoalInfo } from './goals/goalDetailUtils';
import GoalDetailModalRenderSurface from './goalDetail/GoalDetailModalRenderSurface';
import { GOAL_DETAIL_NAVIGATION_EVENT } from '../utils/navigationEvents';

import { logError } from '../utils/logger';

const loadGraphProfileModal = () => import('./analytics/graphs/GraphProfileModal');

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
    readOnly = false,
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
    const [activitiesAssociateAction, setActivitiesAssociateAction] = useState(null);
    const [activitiesAssociateCancelAction, setActivitiesAssociateCancelAction] = useState(null);
    const [isActivitiesAssociationMode, setIsActivitiesAssociationMode] = useState(false);
    const [activityPickerFooterActions, setActivityPickerFooterActions] = useState(null);
    const [activityBuilderReturnView, setActivityBuilderReturnView] = useState('activity-associator');
    const [activityBuilderTemplate, setActivityBuilderTemplate] = useState(null);
    const [isActivityBuilderOpen, setIsActivityBuilderOpen] = useState(false);
    const [isTargetSelectionMode, setIsTargetSelectionMode] = useState(false);
    const [targetManagerReturnView, setTargetManagerReturnView] = useState('goal');
    const [activeAnalyticsTarget, setActiveAnalyticsTarget] = useState(null);
    const [isTimeGraphOpen, setIsTimeGraphOpen] = useState(false);
    // Builder modal config: null = closed; otherwise { target, activityId, lock }.
    const [builderConfig, setBuilderConfig] = useState(null);
    const goalHeaderRef = React.useRef(null);
    const contentScrollRef = React.useRef(null);
    const [goalHeaderStickyOffset, setGoalHeaderStickyOffset] = useState(0);
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
    const queryRootId = readOnly ? null : rootId;
    const queryGoalId = readOnly ? null : goalId;
    const {
        createNote: createGoalNote,
        deleteGoalCompletionNotes,
    } = useGoalNotes(queryRootId, queryGoalId);
    const goalColor = getGoalColor(goalType);
    const goalSecondaryColor = getGoalSecondaryColor(goalType);
    const goalIsSmart = isSMART(goal);
    const depGoalId = goal?.attributes?.id || goal?.id;

    // In read-only mode (e.g. the public landing page) the Activities, Timeline,
    // and Notes tabs cannot hit authenticated endpoints, so their data is embedded
    // in the goal snapshot itself. Read it off the goal attributes here.
    const readOnlyAssociatedActivities = useMemo(() => (
        readOnly && Array.isArray(goal?.attributes?.associated_activities)
            ? goal.attributes.associated_activities
            : null
    ), [readOnly, goal?.attributes?.associated_activities]);
    const readOnlyTimelineEntries = useMemo(() => (
        readOnly && Array.isArray(goal?.attributes?.timeline_events)
            ? goal.attributes.timeline_events
            : null
    ), [readOnly, goal?.attributes?.timeline_events]);
    const readOnlyNotes = useMemo(() => (
        readOnly && Array.isArray(goal?.attributes?.notes)
            ? goal.attributes.notes
            : null
    ), [readOnly, goal?.attributes?.notes]);

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
        onBeforeCompletionConfirm: async ({ noteContent }) => {
            const trimmedContent = noteContent?.trim();
            if (!trimmedContent) return;
            await createGoalNote({
                content: trimmedContent,
                context_type: 'goal',
                context_id: goalId,
                goal_id: goalId,
                note_kind: 'goal_completion',
            });
        },
        onBeforeUncompletionConfirm: async () => {
            await deleteGoalCompletionNotes();
        },
        resetForm,
    });
    const textColor = getGoalTextColor(goalType);
    const completedColor = getGoalColor('Completed');
    const completedSecondaryColor = getGoalSecondaryColor('Completed');
    const completedTextColor = getGoalTextColor('Completed');
    const displayGoalColor = mode !== 'create' && isCompleted ? completedColor : goalColor;
    const displayGoalSecondaryColor = mode !== 'create' && isCompleted ? completedSecondaryColor : goalSecondaryColor;
    const displayTextColor = mode !== 'create' && isCompleted ? completedTextColor : textColor;
    const shouldPreloadTimeGraph = viewState === 'goal-timeline' && !readOnly;
    const shouldLoadTimeGraph = isTimeGraphOpen || shouldPreloadTimeGraph;
    const {
        data: dailyDurationsData,
        isLoading: isDailyDurationsLoading,
        isFetching: isDailyDurationsFetching,
        isError: isDailyDurationsError,
    } = useGoalDailyDurations(depGoalId, shouldLoadTimeGraph);

    React.useEffect(() => {
        if (!shouldPreloadTimeGraph) {
            return;
        }
        importWithRetry(loadGraphProfileModal, 'components/analytics/graphs/GraphProfileModal').catch(() => {});
    }, [shouldPreloadTimeGraph]);

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
    } = useGoalAssociations(queryRootId, mode === 'create' ? null : queryGoalId);

    const {
        metrics: fetchedMetrics,
    } = useGoalMetrics(mode === 'create' ? null : queryGoalId);
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
    const readOnlyAssociatedActivityGroups = useMemo(() => {
        if (!readOnly) return null;
        if (Array.isArray(goal?.attributes?.associated_activity_groups)) {
            return goal.attributes.associated_activity_groups;
        }
        const ids = Array.isArray(goal?.attributes?.associated_activity_group_ids)
            ? goal.attributes.associated_activity_group_ids
            : [];
        if (ids.length === 0) return [];
        const groupsById = new Map((activityGroups || []).map((group) => [group.id, group]));
        return ids.map((id) => groupsById.get(id) || { id, name: 'Linked group' });
    }, [
        activityGroups,
        goal?.attributes?.associated_activity_group_ids,
        goal?.attributes?.associated_activity_groups,
        readOnly,
    ]);

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
                logError('Goal creation failed EXCEPTION:', err);
                if (err.response) {
                    logError('Goal creation error response:', err.response.data);
                }
                notify.error('Failed to create goal: ' + (err.response?.data?.error || err.message));
            }
        } else {
            await onUpdate?.(goalId, payload);

            // Persist activity and group associations
            await persistAssociations();

            notify.success('Goal updated');
            setIsEditing(false);
        }
    };

    const childType = getChildType(goalType);
    const levelConfig = getLevelByName(goalType) || {};

    const parentGoalInfo = getParentGoalInfo({ mode, parentGoal, goal, treeData });
    const parentGoalName = parentGoalInfo?.name;
    const parentGoalColor = parentGoalInfo?.type ? getGoalColor(parentGoalInfo.type) : null;
    const isPaused = Boolean(
        goal?.paused
        || goal?.attributes?.paused
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

        if (evidenceGoalIds === null) {
            return 'active';
        }

        const flattenedTree = flattenGoalTree(treeData, { includeRoot: true });
        const parentById = new Map(
            flattenedTree.map((node) => [String(node.id), node.parent_id ? String(node.parent_id) : null])
        );
        const nodeById = new Map(
            flattenedTree.map((node) => [String(node.id), node])
        );
        const activeEvidenceGoalIds = evidenceGoalIds || new Set();
        if (activeEvidenceGoalIds.size === 0) {
            return 'inactive';
        }

        const activeLineageIds = getActiveLineageIds(activeEvidenceGoalIds, parentById, nodeById);
        return activeLineageIds.has(String(depGoalId)) ? 'active' : 'inactive';
    }, [depGoalId, evidenceGoalIds, isPaused, mode, treeData]);

    React.useEffect(() => {
        if (!shouldMeasureStickyHeader(viewState)) {
            setGoalHeaderStickyOffset(0);
            return undefined;
        }

        const headerElement = goalHeaderRef.current;
        if (!headerElement) {
            return undefined;
        }

        const updateOffset = () => {
            setGoalHeaderStickyOffset(Math.max(0, Math.round(headerElement.offsetHeight - 24)));
        };

        updateOffset();

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateOffset);
            return () => window.removeEventListener('resize', updateOffset);
        }

        const observer = new ResizeObserver(updateOffset);
        observer.observe(headerElement);
        return () => observer.disconnect();
    }, [viewState, name, deadline, goalStatus]);

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

    const registerActivitiesAssociateAction = React.useCallback((handler) => {
        setActivitiesAssociateAction(() => handler);
    }, []);

    const registerActivitiesAssociateCancelAction = React.useCallback((handler) => {
        setActivitiesAssociateCancelAction(() => handler);
    }, []);

    const registerActivityPickerFooterActions = React.useCallback((actions) => {
        setActivityPickerFooterActions(actions);
    }, []);

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
        if (readOnly || !completionFooterState.canToggleCompletion || isPaused) {
            return;
        }
        setViewState(isCompleted ? 'uncomplete-confirm' : 'complete-confirm');
    };

    const handleEditDetails = () => {
        if (readOnly) return;
        setViewState('goal');
        setIsEditing(true);
    };

    React.useEffect(() => {
        if (viewState !== 'goal-activities' || !isActivitiesAssociationMode) {
            return;
        }

        const schedule = typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame
            : (callback) => window.setTimeout(callback, 0);

        schedule(() => {
            contentScrollRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' });
        });
    }, [isActivitiesAssociationMode, viewState]);

    const handleAddTargetFromActivities = () => {
        if (isActivitiesAssociationMode) {
            activitiesAssociateCancelAction?.();
            return;
        }
        setTargetToEdit(null);
        setIsTargetSelectionMode(true);
    };

    const handleSelectTargetActivity = (activity) => {
        if (!activity?.id) return;
        const fullActivity = activityDefinitions.find((candidate) => candidate.id === activity.id) || activity;
        if (!Array.isArray(fullActivity.metric_definitions) || fullActivity.metric_definitions.length === 0) {
            notify.error('Choose an activity with metrics to create a target.');
            return;
        }
        // Open the builder in its dedicated modal, pre-scoped to the chosen activity.
        setIsTargetSelectionMode(false);
        setBuilderConfig({ target: null, activityId: fullActivity.id, lock: true });
    };

    const handleCancelTargetSelection = () => {
        setIsTargetSelectionMode(false);
    };

    const handleCreateActivityFromActivities = React.useCallback(() => {
        setActivityBuilderReturnView('goal-activities');
        setActivityBuilderTemplate(null);
        setIsActivityBuilderOpen(true);
    }, []);

    const handleCopyActivityFromActivities = React.useCallback((activity) => {
        setActivityBuilderReturnView('goal-activities');
        setActivityBuilderTemplate(prepareActivityDefinitionCopy(activity));
        setIsActivityBuilderOpen(true);
    }, []);

    const handleCancelActivitiesFlow = () => {
        if (isTargetSelectionMode) {
            handleCancelTargetSelection();
            return;
        }
        activitiesAssociateCancelAction?.();
    };

    const persistTargetChanges = (newTargets) => {
        if (onUpdate && goalId) {
            onUpdate(goalId, {
                name,
                description,
                deadline,
                relevance_statement: relevanceStatement,
                targets: newTargets,
                completed_via_children: completedViaChildren,
                inherit_parent_activities: inheritParentActivities,
                track_activities: trackActivities,
                allow_manual_completion: allowManualCompletion,
            });
        }
    };

    const handleGoalViewNavigation = (nextViewState) => {
        if (isEditing && viewState === 'goal' && nextViewState !== 'goal') {
            resetForm();
            setIsEditing(false);
        }
        if (nextViewState !== 'goal-activities') {
            setIsTargetSelectionMode(false);
            setIsActivitiesAssociationMode(false);
            setActivityPickerFooterActions(null);
        }
        setViewState(nextViewState);
    };

    const canAddChildGoal = !readOnly && Boolean(onAddChild && childType && goalType !== 'ImmediateGoal' && !isCompleted);

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

    return (
        <GoalDetailModalRenderSurface
            activeAnalyticsTarget={activeAnalyticsTarget}
            activitiesAssociateAction={activitiesAssociateAction}
            activityBuilderReturnView={activityBuilderReturnView}
            activityBuilderTemplate={activityBuilderTemplate}
            activityDefinitions={activityDefinitions}
            activityGroups={activityGroups}
            activityPickerFooterActions={activityPickerFooterActions}
            allowManualCompletion={allowManualCompletion}
            associatedActivities={associatedActivities}
            associatedActivityGroups={associatedActivityGroups}
            attachInlineCreatedActivity={attachInlineCreatedActivity}
            builderConfig={builderConfig}
            canAddChildGoal={canAddChildGoal}
            childType={childType}
            completedColor={completedColor}
            completedSecondaryColor={completedSecondaryColor}
            completedTextColor={completedTextColor}
            completedViaChildren={completedViaChildren}
            completionFooterState={completionFooterState}
            contentScrollRef={contentScrollRef}
            dailyDurationsData={dailyDurationsData}
            deadline={deadline}
            depGoalId={depGoalId}
            description={description}
            displayGoalColor={displayGoalColor}
            displayGoalSecondaryColor={displayGoalSecondaryColor}
            displayMode={displayMode}
            displayTextColor={displayTextColor}
            errors={errors}
            fetchedMetrics={fetchedMetrics}
            goal={goal}
            goalColor={goalColor}
            goalForSmart={goalForSmart}
            goalHeaderRef={goalHeaderRef}
            goalHeaderStickyOffset={goalHeaderStickyOffset}
            goalId={goalId}
            goalIsSmart={goalIsSmart}
            goalStatus={goalStatus}
            goalType={goalType}
            getGoalColor={getGoalColor}
            getGoalIcon={getGoalIcon}
            getGoalSecondaryColor={getGoalSecondaryColor}
            handleAddChildGoal={handleAddChildGoal}
            handleAddTargetFromActivities={handleAddTargetFromActivities}
            handleCancel={handleCancel}
            handleCancelActivitiesFlow={handleCancelActivitiesFlow}
            handleClose={handleClose}
            handleCompletionConfirm={handleCompletionConfirm}
            handleCompletionFooterClick={handleCompletionFooterClick}
            handleCopyActivityFromActivities={handleCopyActivityFromActivities}
            handleCreateActivityFromActivities={handleCreateActivityFromActivities}
            handleEditDetails={handleEditDetails}
            handleGoalViewNavigation={handleGoalViewNavigation}
            handleQuickGoalNote={handleQuickGoalNote}
            handleSave={handleSave}
            handleSelectTargetActivity={handleSelectTargetActivity}
            handleUncompletionConfirm={handleUncompletionConfirm}
            inheritParentActivities={inheritParentActivities}
            isActivitiesAssociationMode={isActivitiesAssociationMode}
            isActivityBuilderOpen={isActivityBuilderOpen}
            isCompleted={isCompleted}
            isDailyDurationsError={isDailyDurationsError}
            isDailyDurationsFetching={isDailyDurationsFetching}
            isDailyDurationsLoading={isDailyDurationsLoading}
            isEditing={isEditing}
            isPaused={isPaused}
            isTargetSelectionMode={isTargetSelectionMode}
            isTimeGraphOpen={isTimeGraphOpen}
            levelConfig={levelConfig}
            localCompletedAt={localCompletedAt}
            mode={mode}
            name={name}
            needsLevelPicker={needsLevelPicker}
            onDelete={onDelete}
            onGoalSelect={onGoalSelect}
            onMobileCollapse={onMobileCollapse}
            onToggleCompletion={onToggleCompletion}
            onUpdate={onUpdate}
            parentGoal={parentGoal}
            parentGoalColor={parentGoalColor}
            parentGoalName={parentGoalName}
            parentType={parentType}
            persistAssociations={persistAssociations}
            persistTargetChanges={persistTargetChanges}
            programs={programs}
            readOnly={readOnly}
            readOnlyAssociatedActivities={readOnlyAssociatedActivities}
            readOnlyAssociatedActivityGroups={readOnlyAssociatedActivityGroups}
            readOnlyNotes={readOnlyNotes}
            readOnlyTimelineEntries={readOnlyTimelineEntries}
            refreshAssociations={refreshAssociations}
            registerActivitiesAssociateAction={registerActivitiesAssociateAction}
            registerActivitiesAssociateCancelAction={registerActivitiesAssociateCancelAction}
            registerActivityPickerFooterActions={registerActivityPickerFooterActions}
            relevanceStatement={relevanceStatement}
            rootId={rootId}
            selectedChildType={selectedChildType}
            setActiveAnalyticsTarget={setActiveAnalyticsTarget}
            setActivityBuilderReturnView={setActivityBuilderReturnView}
            setActivityBuilderTemplate={setActivityBuilderTemplate}
            setActivityGroups={setActivityGroups}
            setAssociatedActivities={setAssociatedActivities}
            setAssociatedActivityGroups={setAssociatedActivityGroups}
            setAllowManualCompletion={setAllowManualCompletion}
            setBuilderConfig={setBuilderConfig}
            setCompletedViaChildren={setCompletedViaChildren}
            setDeadline={setDeadline}
            setDescription={setDescription}
            setInheritParentActivities={setInheritParentActivities}
            setIsActivitiesAssociationMode={setIsActivitiesAssociationMode}
            setIsActivityBuilderOpen={setIsActivityBuilderOpen}
            setIsEditing={setIsEditing}
            setIsTimeGraphOpen={setIsTimeGraphOpen}
            setName={setName}
            setRelevanceStatement={setRelevanceStatement}
            setSelectedChildType={setSelectedChildType}
            setTargetManagerReturnView={setTargetManagerReturnView}
            setTargetToEdit={setTargetToEdit}
            setTargets={setTargets}
            setTrackActivities={setTrackActivities}
            setViewState={setViewState}
            targetManagerReturnView={targetManagerReturnView}
            targetToEdit={targetToEdit}
            targets={targets}
            textColor={textColor}
            trackActivities={trackActivities}
            treeData={treeData}
            validChildTypes={validChildTypes}
            viewState={viewState}
        />
    );
}

function shouldMeasureStickyHeader(viewState) {
    return viewState === 'goal-activities';
}

export default GoalDetailModal;
