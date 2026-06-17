import React, { Suspense, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { useGoalLevels } from '../contexts/GoalLevelsContext';
import { useTimezone } from '../contexts/TimezoneContext';
import { useGoalAssociationMutations } from '../hooks/useGoalAssociationMutations';
import useGoalDetailController from '../hooks/useGoalDetailController';
import useGoalDurationModal from '../hooks/useGoalDurationModal';
import { useGoalForm } from '../hooks/useGoalForm';
import { useGoalNotes } from '../hooks/useGoalNotes';
import { useGoalAssociations, useGoalMetrics } from '../hooks/useGoalQueries';
import { getActiveLineageIds } from '../hooks/useFlowTreeMetrics';
import { getChildType, getValidChildTypes, getTypeDisplayName } from '../utils/goalHelpers';
import { flattenGoalTree, isExecutionGoalType } from '../utils/goalNodeModel';
import { isSMART } from '../utils/smartHelpers';
import notify from '../utils/notify';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import { formatDateInTimezone } from '../utils/dateUtils';
import { prepareActivityDefinitionCopy } from '../utils/activityBuilder';
import { getParentGoalInfo } from './goals/goalDetailUtils';
import GoalCompletionModal from './goals/GoalCompletionModal';
import GoalUncompletionModal from './goals/GoalUncompletionModal';
import GoalHeader from './goals/GoalHeader';
import GoalViewMode from './goals/GoalViewMode';
import GoalEditForm from './goals/GoalEditForm';
import CloseIcon from './atoms/CloseIcon';
import GoalIcon from './atoms/GoalIcon';
import ModalBackdrop from './atoms/ModalBackdrop';
import SidePaneNotePanel from './common/SidePaneNotePanel';
import ViewToggleTabs from './common/ViewToggleTabs';
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
    const [embeddedTargetBuilderTarget, setEmbeddedTargetBuilderTarget] = useState(undefined);
    const [embeddedTargetActivityId, setEmbeddedTargetActivityId] = useState(null);
    const [isTargetSelectionMode, setIsTargetSelectionMode] = useState(false);
    const [targetManagerReturnView, setTargetManagerReturnView] = useState('goal');
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
    const { createNote: createGoalNote } = useGoalNotes(queryRootId, queryGoalId);
    const goalColor = getGoalColor(goalType);
    const goalSecondaryColor = getGoalSecondaryColor(goalType);
    const goalIcon = getGoalIcon(goalType);
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
        resetForm,
    });
    const textColor = getGoalTextColor(goalType);
    const completedColor = getGoalColor('Completed');
    const completedSecondaryColor = getGoalSecondaryColor('Completed');
    const completedTextColor = getGoalTextColor('Completed');
    const displayGoalColor = mode !== 'create' && isCompleted ? completedColor : goalColor;
    const displayGoalSecondaryColor = mode !== 'create' && isCompleted ? completedSecondaryColor : goalSecondaryColor;
    const displayTextColor = mode !== 'create' && isCompleted ? completedTextColor : textColor;
    const {
        graphModalConfig,
        openDurationModal,
        closeDurationModal,
    } = useGoalDurationModal({
        goalId: depGoalId,
        goalName: goal?.name,
        fallbackName: name,
        goalType,
        goalColor: displayGoalColor,
        goalIcon,
        goalSecondaryColor: displayGoalSecondaryColor,
        isSmart: goalIsSmart,
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
                console.error('Goal creation failed EXCEPTION:', err);
                if (err.response) {
                    console.error('Goal creation error response:', err.response.data);
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
        setEmbeddedTargetActivityId(null);
        setIsTargetSelectionMode(true);
    };

    const handleCloseEmbeddedTargetBuilder = () => {
        setEmbeddedTargetBuilderTarget(undefined);
        setEmbeddedTargetActivityId(null);
        setIsTargetSelectionMode(false);
    };

    const handleSelectTargetActivity = (activity) => {
        if (!activity?.id) return;
        const fullActivity = activityDefinitions.find((candidate) => candidate.id === activity.id) || activity;
        if (!Array.isArray(fullActivity.metric_definitions) || fullActivity.metric_definitions.length === 0) {
            notify.error('Choose an activity with metrics to create a target.');
            return;
        }
        setEmbeddedTargetActivityId(fullActivity.id);
        setEmbeddedTargetBuilderTarget(null);
        setIsTargetSelectionMode(false);
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
            setEmbeddedTargetBuilderTarget(undefined);
            setEmbeddedTargetActivityId(null);
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

    // ============ LEVEL PICKER (CREATE MODE — multiple valid levels) ============
    const renderLevelPicker = () => (
        <div className={styles.levelPickerContainer}>
            <div className={styles.levelPickerHeader}>
                <button
                    onClick={handleClose}
                    aria-label="Close"
                    className={styles.levelPickerClose}
                >
                    <CloseIcon size={16} />
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
                        readOnly={readOnly}
                    />
                )
                }
            </>
        );
    };

    // ============ DETERMINE WHICH CONTENT TO RENDER ============
    // Read-only supports the same navigation tabs as the editable modal
    // (Details / Timeline / Activities / Notes), all fed from the goal snapshot.
    // Any other viewState is an editing flow that has no read-only surface, so
    // fall back to the Details content.
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
                {embeddedTargetBuilderTarget !== undefined ? (
                    <TargetManager
                        targets={targets}
                        setTargets={setTargets}
                        activityDefinitions={activityDefinitions}
                        associatedActivities={associatedActivities}
                        goalId={goalId}
                        rootId={rootId}
                        isEditing
                        viewMode="builder"
                        key={embeddedTargetActivityId || embeddedTargetBuilderTarget?.id || 'target-builder'}
                        initialTarget={embeddedTargetBuilderTarget}
                        initialActivityId={embeddedTargetActivityId}
                        lockActivitySelection={Boolean(embeddedTargetActivityId)}
                        onCloseBuilder={handleCloseEmbeddedTargetBuilder}
                        onSave={persistTargetChanges}
                        headerColor="var(--color-text-primary)"
                        goalType={goalType}
                        goalCompleted={isCompleted}
                    />
                ) : (
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
                )}
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
                    onTimeSpentClick={readOnly ? undefined : openDurationModal}
                    readOnlyEntries={readOnlyTimelineEntries}
                />
            </Suspense>
        );
    } else if (needsLevelPicker && selectedChildType === null) {
        // Show level picker before the create form when multiple levels are valid.
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

    // ============ RENDER ============
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
        && embeddedTargetBuilderTarget === undefined
        && Boolean(activitiesAssociateAction);
    const isTargetFlowActive = isTargetSelectionMode;
    const isAssociationFlowActive = isActivitiesAssociationMode;
    const footerContent = showGoalNoteComposer ? (
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

    // Modal mode
    const modalMarkup = (
        <ModalBackdrop
            className={styles.modalOverlay}
            onClose={handleClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className={`${styles.modalContent} ${readOnly ? styles.readOnlySurface : ''}`}
                style={{
                    borderTop: `4px solid ${displayGoalColor}`,
                }}
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

    return createPortal(modalMarkup, document.body);
}

function shouldMeasureStickyHeader(viewState) {
    return viewState === 'goal-activities';
}

export default GoalDetailModal;
