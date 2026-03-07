import React, { Suspense, lazy, useState, useEffect, useRef } from 'react';
import notify from '../utils/notify';
import { useQueryClient } from '@tanstack/react-query';
import { useGoalLevels } from '../contexts/GoalLevelsContext';
import { getChildType } from '../utils/goalHelpers';
import { fractalApi } from '../utils/api';
import GoalCompletionModal from './goals/GoalCompletionModal';
import GoalUncompletionModal from './goals/GoalUncompletionModal';
import GoalHeader from './goals/GoalHeader';
import GoalViewMode from './goals/GoalViewMode';
import { getParentGoalInfo } from './goals/goalDetailUtils';
import GoalEditForm from './goals/GoalEditForm';
import { useGoalForm } from '../hooks/useGoalForm';
import { useGoalAssociations, useGoalMetrics, useGoalDailyDurations } from '../hooks/useGoalQueries';
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
    const queryClient = useQueryClient();
    // Normalize activityDefinitions to always be an array (handles null case)
    const activityDefinitions = Array.isArray(activityDefinitionsRaw) ? activityDefinitionsRaw : [];
    // Normalize programs to always be an array (handles null case)
    const programs = Array.isArray(programsRaw) ? programsRaw : [];
    const [activityGroups, setActivityGroups] = useState(Array.isArray(activityGroupsRaw) ? activityGroupsRaw : []);
    const [isEditing, setIsEditing] = useState(mode === 'create' || mode === 'edit');

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
    } = useGoalForm(goal, mode, isOpen);

    // Local completion state for optimistic UI
    const [localCompleted, setLocalCompleted] = useState(false);
    const [localCompletedAt, setLocalCompletedAt] = useState(null);
    const isCompleted = localCompleted || goal?.completed || false;

    // Target editing state
    const [targetToEdit, setTargetToEdit] = useState(null);

    // View state: 'goal' (main view), 'complete-confirm', 'uncomplete-confirm', 'target-manager', 'activity-associator', 'activity-builder'
    const [viewState, setViewState] = useState('goal');

    // Associated activities state
    const [associatedActivities, setAssociatedActivities] = useState([]);
    const [associatedActivityGroups, setAssociatedActivityGroups] = useState([]); // Array of {id, name}
    // Snapshots of initial associations for diffing on save
    const initialActivitiesRef = useRef([]);
    const initialGroupsRef = useRef([]);
    const associatedActivitiesRef = useRef([]);
    const associatedGroupsRef = useRef([]);

    // Metrics state
    const [metrics, setMetrics] = useState(null);

    // Graph Modal State
    const [graphModalConfig, setGraphModalConfig] = useState(null);
    const [shouldFetchDurations, setShouldFetchDurations] = useState(false);

    // Derive goal type - in create mode, use child type of parent; otherwise use goal's type
    const goalType = mode === 'create'
        ? getChildType(parentGoal?.attributes?.type || parentGoal?.type)
        : (goal?.attributes?.type || goal?.type);
    const goalId = mode === 'create' ? null : (goal?.attributes?.id || goal?.id);
    const goalColor = getGoalColor(goalType);

    const depGoalId = goal?.attributes?.id || goal?.id;
    const { data: durationsData, isSuccess: isDurationsSuccess } = useGoalDailyDurations(depGoalId, shouldFetchDurations);

    useEffect(() => {
        if (shouldFetchDurations && isDurationsSuccess && durationsData) {
            const points = durationsData.points || [];

            // Transform to Chart.js data
            const labels = points.map(p => new Date(p.date)); // X-axis dates
            const activityData = points.map(p => Math.round(p.activity_duration / 60)); // Minutes

            setGraphModalConfig({
                title: goal?.name || name,
                goalType: goalType,
                goalColor: goalColor,
                graphData: {
                    labels,
                    datasets: [
                        {
                            label: 'Activity Duration',
                            data: activityData
                        }
                    ]
                },
                options: {
                    scales: {
                        y: {
                            title: { display: true, text: 'Duration (min)' },
                            beginAtZero: true
                        }
                    }
                }
            });
            setShouldFetchDurations(false); // Reset trigger
        }
    }, [shouldFetchDurations, isDurationsSuccess, durationsData, goal?.name, name, goalType, goalColor]);

    const handleTimeSpentClick = () => {
        setShouldFetchDurations(true);
    };


    // Scroll state for sticky header
    const [isScrolled, setIsScrolled] = useState(false);

    const handleScroll = (e) => {
        const scrollTop = e.target.scrollTop;
        setIsScrolled(scrollTop > 0);
    };

    // Initialize form state from goal - use specific dependencies for completion state

    const depGoalCompleted = goal?.attributes?.completed;
    const depGoalCompletedAt = goal?.attributes?.completed_at;

    // Reset local completion state and handle initial associations when goal or mode changes
    useEffect(() => {
        if (mode === 'create') {
            setLocalCompleted(false);
            setLocalCompletedAt(null);
            setIsEditing(true);  // Start in edit mode for creation
            setViewState('goal');

            // Handle pre-selected associations for creation flow
            if (initialActivities.length > 0 || initialActivityGroups.length > 0) {
                setAssociatedActivities(initialActivities);
                setAssociatedActivityGroups(initialActivityGroups);
                // Also update the refs immediately so handleSave can see them
                associatedActivitiesRef.current = initialActivities;
                associatedGroupsRef.current = initialActivityGroups;
                // Update mutation snapshots so they aren't marked as "changed" if identical
                initialActivitiesRef.current = initialActivities.map(a => a.id);
                initialGroupsRef.current = initialActivityGroups.map(g => g.id);
            }
        } else if (goal) {
            setLocalCompleted(goal.attributes?.completed || false);
            setLocalCompletedAt(goal.attributes?.completed_at || null);
            setIsEditing(mode === 'edit');
            setViewState('goal');
        }
    }, [goal, depGoalId, depGoalCompleted, depGoalCompletedAt, mode, isOpen, initialActivities, initialActivityGroups]);

    // Sync activityGroups when prop changes (only if valid array provided)
    useEffect(() => {
        if (activityGroupsRaw && Array.isArray(activityGroupsRaw)) {
            setActivityGroups(activityGroupsRaw);
        }
    }, [activityGroupsRaw]);

    useEffect(() => {
        associatedActivitiesRef.current = associatedActivities;
    }, [associatedActivities]);

    useEffect(() => {
        associatedGroupsRef.current = associatedActivityGroups;
    }, [associatedActivityGroups]);

    // Use centralized React Query hooks for fetches
    const {
        activities: fetchedActivities,
        groups: fetchedGroups,
    } = useGoalAssociations(rootId, mode === 'create' ? null : depGoalId);

    const {
        metrics: fetchedMetrics,
    } = useGoalMetrics(mode === 'create' ? null : depGoalId);

    // Sync metrics from Query to internal state
    useEffect(() => {
        setMetrics(fetchedMetrics);
    }, [fetchedMetrics]);

    // Sync associations from Query to internal state for editing
    useEffect(() => {
        if (mode !== 'create' && depGoalId) {
            setAssociatedActivities(fetchedActivities);
            setAssociatedActivityGroups(fetchedGroups);

            initialActivitiesRef.current = fetchedActivities.map(a => a.id);
            initialGroupsRef.current = fetchedGroups.map(g => g.id);
        }
    }, [fetchedActivities, fetchedGroups, mode, depGoalId]);

    const refreshAssociations = () => {
        if (!rootId || !depGoalId || mode === 'create') {
            return Promise.resolve();
        }

        return Promise.all([
            queryClient.invalidateQueries({ queryKey: ['goalActivities', rootId, depGoalId] }),
            queryClient.invalidateQueries({ queryKey: ['goalActivityGroups', rootId, depGoalId] }),
            queryClient.invalidateQueries({ queryKey: ['goalMetrics', depGoalId] }),
            queryClient.invalidateQueries({ queryKey: ['activities', rootId] }),
        ]);
    };

    // For modal mode, check isOpen
    if (displayMode === 'modal' && !isOpen) return null;
    // Allow rendering without goal in create mode
    if (!goal && mode !== 'create') return null;

    const persistAssociations = async (updatedActivities, updatedGroups, overrideGoalId) => {
        // Use provided values or fall back to state
        const activs = updatedActivities || associatedActivitiesRef.current || associatedActivities;
        const groups = updatedGroups || associatedGroupsRef.current || associatedActivityGroups;
        const targetGoalId = overrideGoalId || goalId;

        if (!targetGoalId) {
            console.warn('persistAssociations: no goalId available, skipping');
            return false;
        }

        try {
            const currentActivityIds = activs.map(a => a.id);
            const currentGroupIds = groups.map(g => g.id);
            await fractalApi.setGoalAssociationsBatch(rootId, targetGoalId, {
                activity_ids: currentActivityIds,
                group_ids: currentGroupIds
            });

            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['goalActivities', rootId, targetGoalId] }),
                queryClient.invalidateQueries({ queryKey: ['goalActivityGroups', rootId, targetGoalId] }),
                queryClient.invalidateQueries({ queryKey: ['goalMetrics', targetGoalId] }),
                queryClient.invalidateQueries({ queryKey: ['activities', rootId] }),
            ]);

            // Update snapshots to reflect persisted state
            initialActivitiesRef.current = currentActivityIds;
            initialGroupsRef.current = currentGroupIds;

            // Notify parent and fire global events
            if (onAssociationsChanged) onAssociationsChanged();

            window.dispatchEvent(new CustomEvent('goalAssociationsChanged', {
                detail: { goalId: targetGoalId, rootId: rootId }
            }));

            return true;
        } catch (err) {
            console.error('Error persisting activity associations:', err);
            return false;
        }
    };

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

    const handleCancel = () => {
        if (mode === 'create') {
            // In create mode, cancel means close the modal
            if (onClose) onClose();
            return;
        }
        resetForm();
        // Also reset local UI state
        if (goal) {
            setLocalCompleted(goal.attributes?.completed || false);
            setLocalCompletedAt(goal.attributes?.completed_at || null);
        }
        setIsEditing(false);
    };

    const textColor = getGoalTextColor(goalType);
    const childType = getChildType(goalType);
    const levelConfig = getLevelByName(goalType) || {};

    const parentGoalInfo = getParentGoalInfo({ mode, parentGoal, goal, treeData });
    const parentGoalName = parentGoalInfo?.name;
    const parentGoalColor = parentGoalInfo?.type ? getGoalColor(parentGoalInfo.type) : null;

    // ============ COMPLETION CONFIRMATION VIEW ============
    // ============ CONFIRMATION HANDLERS ============
    const handleCompletionConfirm = (completionDate) => {
        setLocalCompleted(true);
        setLocalCompletedAt(completionDate.toISOString());
        onToggleCompletion(goalId, false); // false = currently not completed
        setViewState('goal');
    };

    const handleUncompletionConfirm = () => {
        setLocalCompleted(false);
        setLocalCompletedAt(null);
        onToggleCompletion(goalId, true); // true = currently completed
        setViewState('goal');
    };

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
                        onClose={() => setGraphModalConfig(null)}
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
                    onClose={onClose}
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
                        metrics={metrics}
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
                        onClose={onClose}
                        onToggleCompletion={onToggleCompletion}
                        onAddChild={onAddChild}
                        onDelete={onDelete}
                        onGoalSelect={onGoalSelect}
                        onUpdate={onUpdate}
                        setTargets={setTargets}
                        handleTimeSpentClick={handleTimeSpentClick}
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
                    onClose={onClose}
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
                            if (goalId) {
                                // Goal already exists: persist association immediately
                                await fractalApi.setActivityGoals(rootId, newActivity.id, [goalId]);
                                await refreshAssociations();
                            } else {
                                // Create mode: buffer the association in local state for deferred persistence
                                setAssociatedActivities(prev => {
                                    const updated = [...prev, newActivity];
                                    return Array.from(new Map(updated.map(item => [item.id, item])).values());
                                });
                            }
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
                onClick={onClose}
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
