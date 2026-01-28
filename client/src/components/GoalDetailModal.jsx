import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getGoalColor, getGoalTextColor } from '../utils/goalColors';
import { getChildType, getTypeDisplayName, calculateGoalAge, isAboveShortTermGoal, findGoalById } from '../utils/goalHelpers';
import SMARTIndicator from './SMARTIndicator';
import { fractalApi } from '../utils/api';
import TargetManager from './goalDetail/TargetManager';
import ActivityAssociator from './goalDetail/ActivityAssociator';
import GoalSessionList from './goalDetail/GoalSessionList';
import GoalCompletionModal from './goals/GoalCompletionModal';
import GoalUncompletionModal from './goals/GoalUncompletionModal';
import GoalHeader from './goals/GoalHeader';
import GoalSmartSection from './goals/GoalSmartSection';
import GoalChildrenList from './goals/GoalChildrenList';
import { useGoalForm } from '../hooks/useGoalForm';
import styles from './GoalDetailModal.module.css';

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
    sessions: sessionsRaw = [],
    rootId,
    treeData,
    displayMode = 'modal',  // 'modal' or 'panel'
    programs: programsRaw = [],  // For showing associated programs on completion
    activityGroups: activityGroupsRaw = [],  // For activities modal grouping
    // Create mode props
    mode = 'view',  // 'view', 'edit', or 'create'
    onCreate,  // Function to call when creating a new goal
    parentGoal  // Parent goal for context when creating
}) {
    const navigate = useNavigate();
    // Normalize activityDefinitions to always be an array (handles null case)
    const activityDefinitions = Array.isArray(activityDefinitionsRaw) ? activityDefinitionsRaw : [];
    // Normalize sessions to always be an array (handles null case)
    const sessions = Array.isArray(sessionsRaw) ? sessionsRaw : [];
    // Normalize programs to always be an array (handles null case)
    const programs = Array.isArray(programsRaw) ? programsRaw : [];
    // Normalize activityGroups to always be an array (handles null case) - use state so we can update it
    // Normalize activityGroups to always be an array (handles null case) - use state so we can update it
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
        resetForm
    } = useGoalForm(goal, mode, isOpen);

    // Local completion state for optimistic UI
    const [localCompleted, setLocalCompleted] = useState(false);
    const [localCompletedAt, setLocalCompletedAt] = useState(null);

    // Target editing state
    const [targetToEdit, setTargetToEdit] = useState(null);

    // View state: 'goal' (main view), 'complete-confirm', 'uncomplete-confirm', 'target-manager', 'activity-associator', 'activity-builder'
    const [viewState, setViewState] = useState('goal');

    // Associated activities state
    const [associatedActivities, setAssociatedActivities] = useState([]);
    const [associatedActivityGroups, setAssociatedActivityGroups] = useState([]); // Array of {id, name}
    const [isLoadingActivities, setIsLoadingActivities] = useState(false);

    // Inline activity builder form state
    const [newActivityName, setNewActivityName] = useState('');
    const [newActivityDescription, setNewActivityDescription] = useState('');
    const [newActivityHasMetrics, setNewActivityHasMetrics] = useState(true);
    const [newActivityMetrics, setNewActivityMetrics] = useState([{ name: '', unit: '' }]);
    const [newActivityHasSets, setNewActivityHasSets] = useState(false);
    const [newActivityGroupId, setNewActivityGroupId] = useState('');
    const [isCreatingActivity, setIsCreatingActivity] = useState(false);

    // Initialize form state from goal - use specific dependencies for completion state
    const depGoalId = goal?.attributes?.id || goal?.id;
    const depGoalCompleted = goal?.attributes?.completed;
    const depGoalCompletedAt = goal?.attributes?.completed_at;

    // Reset local completion state when goal changes
    useEffect(() => {
        if (mode === 'create') {
            setLocalCompleted(false);
            setLocalCompletedAt(null);
            setIsEditing(true);  // Start in edit mode for creation
            setViewState('goal');
        } else if (goal) {
            setLocalCompleted(goal.attributes?.completed || false);
            setLocalCompletedAt(goal.attributes?.completed_at || null);
            setIsEditing(mode === 'edit');
            setViewState('goal');
        }
    }, [goal, depGoalId, depGoalCompleted, depGoalCompletedAt, mode, isOpen]);

    // Sync activityGroups when prop changes
    useEffect(() => {
        setActivityGroups(Array.isArray(activityGroupsRaw) ? activityGroupsRaw : []);
    }, [activityGroupsRaw]);

    // Fetch associated activities when goal changes
    useEffect(() => {
        const fetchAssociatedActivities = async () => {
            if (mode === 'create' || !rootId || !depGoalId) {
                setAssociatedActivities([]);
                setAssociatedActivityGroups([]);
                return;
            }

            setIsLoadingActivities(true);
            try {
                // Fetch both individual activities and linked groups
                const [activitiesResponse, groupsResponse] = await Promise.all([
                    fractalApi.getGoalActivities(rootId, depGoalId),
                    fractalApi.getGoalActivityGroups(rootId, depGoalId)
                ]);

                setAssociatedActivities(activitiesResponse.data || []);
                setAssociatedActivityGroups(groupsResponse.data || []);
            } catch (error) {
                console.error('Error fetching associations:', error);
                // Fallback to empty if failed, but don't wipe existing if partial failure strictly
                setAssociatedActivities([]); // or keep previous
                setAssociatedActivityGroups([]);
            } finally {
                setIsLoadingActivities(false);
            }
        };

        fetchAssociatedActivities();
    }, [rootId, depGoalId, mode]);

    // For modal mode, check isOpen
    if (displayMode === 'modal' && !isOpen) return null;
    // Allow rendering without goal in create mode
    if (!goal && mode !== 'create') return null;

    // Derive goal type - in create mode, use child type of parent; otherwise use goal's type
    const goalType = mode === 'create'
        ? getChildType(parentGoal?.attributes?.type || parentGoal?.type)
        : (goal.attributes?.type || goal.type);
    const goalId = mode === 'create' ? null : (goal.attributes?.id || goal.id);

    const handleSave = () => {
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
            onCreate(payload);
        } else {
            onUpdate(goalId, payload);
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

    const goalColor = getGoalColor(goalType);
    const textColor = getGoalTextColor(goalType);
    const isCompleted = localCompleted;  // Use local state for optimistic UI
    const childType = getChildType(goalType);

    // Session relationships
    const isShortTermGoal = goalType === 'ShortTermGoal';
    const isImmediateGoal = goalType === 'ImmediateGoal';

    // Get activities with metrics for target builder
    // First, filter by associated activities, then by having metrics
    const associatedActivityIds = associatedActivities.map(a => a.id);
    const activitiesWithMetrics = activityDefinitions.filter(a =>
        a.has_metrics && a.metric_definitions && a.metric_definitions.length > 0
    );
    // For targets: only activities that are BOTH associated AND have metrics
    const activitiesForTargets = activitiesWithMetrics.filter(a =>
        associatedActivityIds.includes(a.id)
    );

    // Find parent goal name and type for SMART relevance question
    const findParentGoalInfo = () => {
        if (mode === 'create' && parentGoal) {
            return {
                name: parentGoal.name,
                type: parentGoal.attributes?.type || parentGoal.type
            };
        }

        const parentId = goal?.attributes?.parent_id;
        if (!parentId || !treeData) return null;

        // Recursively search the tree for the parent
        const findNode = (node, targetId) => {
            if (!node) return null;
            const nodeId = node.id || node.attributes?.id;
            if (nodeId === targetId) return node;

            if (node.children && node.children.length > 0) {
                for (const child of node.children) {
                    const found = findNode(child, targetId);
                    if (found) return found;
                }
            }
            return null;
        };

        const parentNode = findNode(treeData, parentId);
        if (!parentNode) return null;

        return {
            name: parentNode.name,
            type: parentNode.attributes?.type || parentNode.type
        };
    };

    const parentGoalInfo = findParentGoalInfo();
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
                    deadline={deadline}
                />

                {isEditing ? (
                    /* ============ EDIT MODE ============ */
                    <div className={styles.editContainer}>
                        <div className={styles.fieldGroup}>
                            <label className={styles.label} style={{ color: goalColor }}>
                                Name
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className={styles.input}
                            />
                        </div>

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

                        {/* Relevance Statement - SMART "R" Criterion */}
                        {((goal?.attributes?.parent_id || mode === 'create' && parentGoalName) || goalType === 'UltimateGoal') && (
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

                        <div className={styles.fieldGroup}>
                            <label className={styles.label} style={{ color: goalColor }}>
                                Deadline
                            </label>
                            <input
                                type="date"
                                value={deadline}
                                onChange={(e) => setDeadline(e.target.value)}
                                className={styles.inputDate}
                            />
                        </div>

                        {/* How is progress measured? */}
                        <div className={styles.progressBox}>
                            <label className={styles.label} style={{ marginBottom: '10px', color: goalColor }}>
                                How is progress measured? (Select all that apply)
                            </label>
                            <div className={styles.checkboxGroup}>
                                <label className={styles.checkboxLabel}>
                                    <input
                                        type="checkbox"
                                        checked={trackActivities}
                                        onChange={(e) => setTrackActivities(e.target.checked)}
                                    />
                                    Activities & Targets
                                </label>
                                {isAboveShortTermGoal(goalType) && (
                                    <label className={styles.checkboxLabel}>
                                        <input
                                            type="checkbox"
                                            checked={completedViaChildren}
                                            onChange={(e) => setCompletedViaChildren(e.target.checked)}
                                        />
                                        Completed via Children
                                    </label>
                                )}
                                <label className={styles.checkboxLabel}>
                                    <input
                                        type="checkbox"
                                        checked={allowManualCompletion}
                                        onChange={(e) => setAllowManualCompletion(e.target.checked)}
                                    />
                                    Manual Completion
                                </label>
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

                        {/* Associated Activities Section - Edit/Create Mode */}
                        {trackActivities && (
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
                                isEditing={true}
                                targets={targets}
                                goalName={name}
                                viewMode="list"
                                onOpenSelector={() => setViewState('activity-associator')}
                                completedViaChildren={completedViaChildren}
                                isAboveShortTermGoal={isAboveShortTermGoal(goalType)}
                                headerColor={goalColor}
                            />
                        )}

                        {/* Targets Section - Edit/Create Mode */}
                        {trackActivities && (
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
                                    setTargetToEdit(target || null);
                                    setViewState('target-manager');
                                }}
                                headerColor={goalColor}
                            />
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
                    </div >
                ) : (
                    /* ============ VIEW MODE ============ */
                    <div className={styles.viewContainer}>

                        {/* Action Buttons - 2x2 Grid */}
                        <div className={styles.actionGrid}>
                            {onToggleCompletion && (
                                <button
                                    onClick={() => {
                                        if (isCompleted) {
                                            setViewState('uncomplete-confirm');
                                        } else if (allowManualCompletion) {
                                            setViewState('complete-confirm');
                                        }
                                    }}
                                    disabled={!isCompleted && !allowManualCompletion}
                                    className={styles.btnAction}
                                    style={{
                                        background: isCompleted ? '#4caf50' : 'transparent',
                                        border: `1px solid ${isCompleted ? '#4caf50' : (allowManualCompletion ? 'var(--color-border)' : 'var(--color-border-hover)')}`,
                                        color: isCompleted ? 'white' : (allowManualCompletion ? 'var(--color-text-primary)' : 'var(--color-text-muted)'),
                                        cursor: (isCompleted || allowManualCompletion) ? 'pointer' : 'default',
                                        fontWeight: isCompleted ? 'bold' : 'normal',
                                        opacity: (!isCompleted && !allowManualCompletion) ? 0.8 : 1
                                    }}
                                >
                                    {isCompleted ? '✓ Completed' : (
                                        allowManualCompletion ? 'Mark Complete' : (
                                            trackActivities && completedViaChildren ? 'Complete via Children & Targets' :
                                                trackActivities ? 'Complete via Target(s)' :
                                                    completedViaChildren ? 'Complete via Children' :
                                                        'Auto-completing...'
                                        )
                                    )}
                                </button>
                            )}

                            {onAddChild && childType && (
                                <button
                                    onClick={() => {
                                        if (displayMode === 'modal' && onClose) onClose();
                                        onAddChild(goal);
                                    }}
                                    className={styles.btnAction}
                                    style={{
                                        background: 'transparent',
                                        border: `1px solid ${getGoalColor(childType)}`,
                                        color: getGoalColor(childType),
                                        fontWeight: 'bold'
                                    }}
                                >
                                    + Add {childType}
                                </button>
                            )}

                            <button
                                onClick={() => setIsEditing(true)}
                                className={styles.btnAction}
                                style={{
                                    background: goalColor,
                                    border: 'none',
                                    color: textColor,
                                    fontWeight: 600
                                }}
                            >
                                Edit Goal
                            </button>

                            {onDelete && (
                                <button
                                    onClick={() => {
                                        if (displayMode === 'modal' && onClose) onClose();
                                        onDelete(goal);
                                    }}
                                    className={`${styles.btnAction} ${styles.btnDelete}`}
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid #d32f2f',
                                        color: '#d32f2f',
                                    }}
                                >
                                    Delete Goal
                                </button>
                            )}
                        </div>

                        <GoalSmartSection
                            goal={goal}
                            goalColor={goalColor}
                            parentGoalName={parentGoalName}
                            parentGoalColor={parentGoalColor}
                            mode={mode}
                            goalType={goalType}
                            relevanceStatement={relevanceStatement}
                        />

                        {/* Associated Programs */}
                        {programs && (() => {
                            const associatedPrograms = programs.filter(p => {
                                // Check directly on program
                                const programLevel = p.goal_ids && p.goal_ids.includes(goalId);
                                // Check on blocks
                                const blockLevel = p.blocks && p.blocks.some(b => b.goal_ids && b.goal_ids.includes(goalId));
                                return programLevel || blockLevel;
                            });

                            if (associatedPrograms.length === 0) return null;

                            return (
                                <div>
                                    <label className={styles.label} style={{ marginBottom: '6px', color: goalColor }}>
                                        Associated Programs
                                    </label>
                                    <div className={styles.associatedPrograms}>
                                        {associatedPrograms.map(prog => (
                                            <div
                                                key={prog.id}
                                                onClick={() => {
                                                    if (displayMode === 'modal' && onClose) onClose();
                                                    navigate(`/${rootId}/programs/${prog.id}`);
                                                }}
                                                className={styles.programLink}
                                            >
                                                <span style={{ fontSize: '14px' }}>📁</span>
                                                <span style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>{prog.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Associated Activities Section - View Mode (Read-only) */}
                        {trackActivities && (
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
                                isEditing={false}
                                targets={targets}
                                goalName={name}
                                viewMode="list"
                                onOpenSelector={() => setViewState('activity-associator')}
                                completedViaChildren={completedViaChildren}
                                isAboveShortTermGoal={isAboveShortTermGoal(goalType)}
                                headerColor={goalColor}
                            />
                        )}

                        {/* Targets Section - View Mode (Read-only) */}
                        {trackActivities && (
                            <TargetManager
                                targets={targets}
                                setTargets={setTargets}
                                activityDefinitions={activityDefinitions}
                                associatedActivities={associatedActivities}
                                goalId={goalId}
                                rootId={rootId}
                                isEditing={false}
                                viewMode="list"
                                headerColor={goalColor}
                            />
                        )}

                        {/* Associated Children Section */}
                        {/* Associated Children Section */}
                        <GoalChildrenList
                            treeData={treeData}
                            goalId={goalId}
                            goalColor={goalColor}
                            childType={childType}
                        />

                        {/* Sessions List */}
                        <GoalSessionList
                            goalType={goalType}
                            sessions={sessions}
                            goalId={goalId}
                            rootId={rootId}
                            onClose={onClose}
                            headerColor={goalColor}
                        />

                    </div>
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
            <TargetManager
                targets={targets}
                setTargets={setTargets}
                activityDefinitions={activityDefinitions}
                associatedActivities={associatedActivities}
                goalId={goalId}
                rootId={rootId}
                isEditing={true}
                viewMode="builder"
                initialTarget={targetToEdit}
                onCloseBuilder={() => {
                    setTargetToEdit(null);
                    setViewState('goal');
                }}
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
        );
    } else if (viewState === 'activity-associator') {
        content = (
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
                goalName={name}
                isEditing={true}
                targets={targets}
                viewMode="selector"
                onCloseSelector={() => setViewState('goal')}
                onCreateActivity={() => {
                    // Reset form state and switch to activity builder view
                    setNewActivityName('');
                    setNewActivityDescription('');
                    setNewActivityHasMetrics(true);
                    setNewActivityMetrics([{ name: '', unit: '' }]);
                    setNewActivityHasSets(false);
                    setNewActivityGroupId('');
                    setViewState('activity-builder');
                }}
            />
        );
    } else if (viewState === 'activity-builder') {
        // Inline activity creation form
        const handleCreateActivity = async () => {
            if (!newActivityName.trim()) {
                alert('Please enter an activity name');
                return;
            }

            setIsCreatingActivity(true);
            try {
                const validMetrics = newActivityHasMetrics
                    ? newActivityMetrics.filter(m => m.name.trim() !== '')
                    : [];

                const activityData = {
                    name: newActivityName,
                    description: newActivityDescription,
                    has_sets: newActivityHasSets,
                    has_metrics: newActivityHasMetrics,
                    metrics: validMetrics,
                    group_id: newActivityGroupId || null
                };

                // Create the activity - axios returns response object, so extract .data
                const response = await fractalApi.createActivity(rootId, activityData);
                const newActivity = response.data;

                // Automatically associate with this goal
                if (newActivity && newActivity.id && goalId) {
                    await fractalApi.setActivityGoals(rootId, newActivity.id, [goalId]);
                    // Add to local associated activities
                    setAssociatedActivities(prev => [...prev, newActivity]);
                }

                // Go back to activity-associator view
                setViewState('activity-associator');
            } catch (error) {
                console.error('Error creating activity:', error);
                alert('Failed to create activity: ' + error.message);
            } finally {
                setIsCreatingActivity(false);
            }
        };

        content = (
            <div className={styles.editContainer}>
                {/* Header */}
                <div className={styles.activityBuilderHeader}>
                    <button
                        onClick={() => setViewState('activity-associator')}
                        className={styles.backButton}
                    >
                        ←
                    </button>
                    <h3 style={{ margin: 0, fontSize: '16px', color: 'white', flex: 1 }}>
                        Create New Activity
                    </h3>
                </div>

                {/* Activity Name */}
                <div>
                    <label className={styles.sectionLabel}>
                        Activity Name *
                    </label>
                    <input
                        type="text"
                        value={newActivityName}
                        onChange={(e) => setNewActivityName(e.target.value)}
                        placeholder="e.g. Scale Practice"
                        className={styles.input}
                    />
                </div>

                {/* Description */}
                <div>
                    <label className={styles.sectionLabel}>
                        Description
                    </label>
                    <textarea
                        value={newActivityDescription}
                        onChange={(e) => setNewActivityDescription(e.target.value)}
                        placeholder="Optional description..."
                        rows={2}
                        className={styles.textarea}
                    />
                </div>

                {/* Group Selection */}
                <div>
                    <label className={styles.sectionLabel}>
                        Activity Group
                    </label>
                    <select
                        value={newActivityGroupId}
                        onChange={(e) => setNewActivityGroupId(e.target.value)}
                        className={styles.select}
                    >
                        <option value="">(No Group)</option>
                        {activityGroups && activityGroups.map(group => (
                            <option key={group.id} value={group.id}>
                                {group.name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Flags */}
                <div className={styles.checkboxGroup}>
                    <label className={styles.checkboxLabel} style={{ color: '#ccc' }}>
                        <input
                            type="checkbox"
                            checked={newActivityHasSets}
                            onChange={(e) => setNewActivityHasSets(e.target.checked)}
                        />
                        Track Sets
                    </label>
                    <label className={styles.checkboxLabel} style={{ color: '#ccc' }}>
                        <input
                            type="checkbox"
                            checked={newActivityHasMetrics}
                            onChange={(e) => setNewActivityHasMetrics(e.target.checked)}
                        />
                        Enable Metrics
                    </label>
                </div>

                {/* Metrics Section */}
                {newActivityHasMetrics && (
                    <div>
                        <label className={styles.label} style={{ color: '#aaa' }}>
                            Metrics (needed for targets)
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {newActivityMetrics.map((metric, idx) => (
                                <div key={idx} className={styles.metricRow}>
                                    <input
                                        type="text"
                                        value={metric.name}
                                        onChange={(e) => {
                                            const updated = [...newActivityMetrics];
                                            updated[idx] = { ...updated[idx], name: e.target.value };
                                            setNewActivityMetrics(updated);
                                        }}
                                        placeholder="Metric name (e.g. Speed)"
                                        className={styles.metricInput}
                                    />
                                    <input
                                        type="text"
                                        value={metric.unit}
                                        onChange={(e) => {
                                            const updated = [...newActivityMetrics];
                                            updated[idx] = { ...updated[idx], unit: e.target.value };
                                            setNewActivityMetrics(updated);
                                        }}
                                        placeholder="Unit (e.g. bpm)"
                                        className={styles.unitInput}
                                    />
                                    {newActivityMetrics.length > 1 && (
                                        <button
                                            onClick={() => {
                                                const updated = newActivityMetrics.filter((_, i) => i !== idx);
                                                setNewActivityMetrics(updated);
                                            }}
                                            className={styles.removeButton}
                                        >
                                            ×
                                        </button>
                                    )}
                                </div>
                            ))}
                            {newActivityMetrics.length < 3 && (
                                <button
                                    onClick={() => setNewActivityMetrics([...newActivityMetrics, { name: '', unit: '' }])}
                                    className={styles.addMetricButton}
                                >
                                    + Add Metric
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Info about auto-association */}
                <div className={styles.autoAssociationInfo}>
                    This activity will be automatically associated with this goal.
                </div>

                {/* Actions */}
                <div className={styles.editActions}>
                    <button
                        onClick={() => setViewState('activity-associator')}
                        className={styles.btnCancel}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreateActivity}
                        disabled={isCreatingActivity || !newActivityName.trim()}
                        className={styles.btnSave}
                        style={{
                            background: isCreatingActivity || !newActivityName.trim() ? '#444' : '#4caf50',
                            color: isCreatingActivity || !newActivityName.trim() ? '#888' : 'white',
                            cursor: isCreatingActivity || !newActivityName.trim() ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {isCreatingActivity ? 'Creating...' : 'Create Activity'}
                    </button>
                </div>
            </div>
        );
    } else {
        content = renderGoalContent();
    }

    // ============ RENDER ============


    if (displayMode === 'panel') {
        return (
            <>
                <div className={styles.panelContainer}>
                    <div className={styles.panelContent}>
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
                >
                    {content}
                </div>
            </div>
        </>
    );
}

export default GoalDetailModal;
