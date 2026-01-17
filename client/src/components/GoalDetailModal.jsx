import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getGoalColor, getGoalTextColor } from '../utils/goalColors';
import { getChildType, getTypeDisplayName, calculateGoalAge } from '../utils/goalHelpers';
import SMARTIndicator from './SMARTIndicator';
import { fractalApi } from '../utils/api';
import TargetManager from './goalDetail/TargetManager';
import ActivityAssociator from './goalDetail/ActivityAssociator';
import GoalSessionList from './goalDetail/GoalSessionList';

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
    // Normalize activityGroups to always be an array (handles null case)
    const activityGroups = Array.isArray(activityGroupsRaw) ? activityGroupsRaw : [];
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [deadline, setDeadline] = useState('');
    const [relevanceStatement, setRelevanceStatement] = useState('');

    // Local completion state for optimistic UI
    const [localCompleted, setLocalCompleted] = useState(false);
    const [localCompletedAt, setLocalCompletedAt] = useState(null);

    // Target editing state
    const [targets, setTargets] = useState([]);
    const [targetToEdit, setTargetToEdit] = useState(null);

    // View state: 'goal' (main view), 'complete-confirm', 'uncomplete-confirm', 'target-manager', 'activity-associator'
    const [viewState, setViewState] = useState('goal');

    // Associated activities state
    const [associatedActivities, setAssociatedActivities] = useState([]);
    const [isLoadingActivities, setIsLoadingActivities] = useState(false);

    // Initialize form state from goal - use specific dependencies for completion state
    const depGoalId = goal?.attributes?.id || goal?.id;
    const depGoalCompleted = goal?.attributes?.completed;
    const depGoalCompletedAt = goal?.attributes?.completed_at;

    useEffect(() => {
        if (mode === 'create') {
            // Initialize empty form for create mode
            setName('');
            setDescription('');
            setDeadline('');
            setRelevanceStatement('');
            setLocalCompleted(false);
            setLocalCompletedAt(null);
            setTargets([]);
            setIsEditing(true);  // Start in edit mode for creation
            setViewState('goal');
        } else if (goal) {
            setName(goal.name || '');
            setDescription(goal.attributes?.description || goal.description || '');
            setDeadline(goal.attributes?.deadline || goal.deadline || '');
            setRelevanceStatement(goal.attributes?.relevance_statement || '');
            setLocalCompleted(goal.attributes?.completed || false);
            setLocalCompletedAt(goal.attributes?.completed_at || null);

            // Parse targets
            let parsedTargets = [];
            if (goal.attributes?.targets) {
                try {
                    parsedTargets = typeof goal.attributes.targets === 'string'
                        ? JSON.parse(goal.attributes.targets)
                        : goal.attributes.targets;
                } catch (e) {
                    console.error('Error parsing targets:', e);
                    parsedTargets = [];
                }
            }
            setTargets(parsedTargets);
            setIsEditing(mode === 'edit');
            setViewState('goal');
        }
    }, [goal, depGoalId, depGoalCompleted, depGoalCompletedAt, mode, isOpen]);

    // Fetch associated activities when goal changes
    useEffect(() => {
        const fetchAssociatedActivities = async () => {
            if (mode === 'create' || !rootId || !depGoalId) {
                setAssociatedActivities([]);
                return;
            }

            setIsLoadingActivities(true);
            try {
                const response = await fractalApi.getGoalActivities(rootId, depGoalId);
                setAssociatedActivities(response.data || []);
            } catch (error) {
                console.error('Error fetching associated activities:', error);
                setAssociatedActivities([]);
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

    const handleSave = () => {
        if (mode === 'create') {
            // Create mode: call onCreate with new goal data
            const parentType = parentGoal?.attributes?.type || parentGoal?.type;
            const childType = getChildType(parentType);
            const parentId = parentGoal?.attributes?.id || parentGoal?.id;

            onCreate({
                name,
                description,
                deadline: deadline || null,
                type: childType,
                parent_id: parentId,
                targets: targets
            });
        } else {
            // Edit mode: update existing goal
            onUpdate(goal.id, {
                name,
                description,
                deadline: deadline || null,
                targets: targets,
                relevance_statement: relevanceStatement
            });
            setIsEditing(false);
        }
    };

    const handleCancel = () => {
        if (mode === 'create') {
            // In create mode, cancel means close the modal
            if (onClose) onClose();
            return;
        }
        if (goal) {
            setName(goal.name || '');
            setDescription(goal.attributes?.description || goal.description || '');
            setDeadline(goal.attributes?.deadline || goal.deadline || '');
            setRelevanceStatement(goal.attributes?.relevance_statement || '');

            let parsedTargets = [];
            if (goal.attributes?.targets) {
                try {
                    parsedTargets = typeof goal.attributes.targets === 'string'
                        ? JSON.parse(goal.attributes.targets)
                        : goal.attributes.targets;
                } catch (e) {
                    parsedTargets = [];
                }
            }
            setTargets(parsedTargets);
        }
        setIsEditing(false);
    };

    // Derive goal type - in create mode, use child type of parent; otherwise use goal's type
    const goalType = mode === 'create'
        ? getChildType(parentGoal?.attributes?.type || parentGoal?.type)
        : (goal.attributes?.type || goal.type);
    const goalColor = getGoalColor(goalType);
    const textColor = getGoalTextColor(goalType);
    const isCompleted = localCompleted;  // Use local state for optimistic UI
    const goalId = mode === 'create' ? null : (goal.attributes?.id || goal.id);
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
    const renderCompletionConfirm = () => {
        const completionDate = new Date();

        // Find programs this goal belongs to (traverse up the tree to find program)
        const findProgramsForGoal = () => {
            if (!treeData) return [];

            // For now, the root of the tree is typically the program
            // We'll show the root as the associated program
            const foundPrograms = [];
            if (programs && programs.length > 0) {
                foundPrograms.push(...programs);
            } else if (treeData) {
                // Fallback: use the root node name as the program
                foundPrograms.push({ name: treeData.name || 'Current Program', id: treeData.id });
            }
            return foundPrograms;
        };

        const associatedPrograms = findProgramsForGoal();

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    paddingBottom: '12px',
                    borderBottom: '1px solid #4caf50'
                }}>
                    <button
                        onClick={() => setViewState('goal')}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#888',
                            fontSize: '18px',
                            cursor: 'pointer',
                            padding: '0 4px'
                        }}
                    >
                        ←
                    </button>
                    <h3 style={{ margin: 0, fontSize: '16px', color: '#4caf50' }}>
                        ✓ Confirm Goal Completion
                    </h3>
                </div>

                {/* Goal Name */}
                <div style={{
                    padding: '14px',
                    background: '#2a3a2a',
                    border: '1px solid #4caf50',
                    borderRadius: '6px'
                }}>
                    <div style={{ fontSize: '11px', color: '#4caf50', marginBottom: '4px' }}>
                        Completing Goal:
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'white' }}>
                        {goal.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                        Type: {goalType}
                    </div>
                </div>

                {/* Completion Date */}
                <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#aaa' }}>
                        Will be marked as completed:
                    </label>
                    <div style={{
                        padding: '12px',
                        background: '#2a2a2a',
                        border: '1px solid #444',
                        borderRadius: '4px',
                        fontSize: '14px',
                        color: 'white'
                    }}>
                        📅 {completionDate.toLocaleDateString()} at {completionDate.toLocaleTimeString()}
                    </div>
                </div>

                {/* Associated Programs */}
                <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#aaa' }}>
                        Programs that will log this completion:
                    </label>
                    {associatedPrograms.length === 0 ? (
                        <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                            No programs found
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {associatedPrograms.map((program, idx) => (
                                <div key={idx} style={{
                                    padding: '10px 12px',
                                    background: '#252525',
                                    border: '1px solid #555',
                                    borderRadius: '4px',
                                    fontSize: '13px',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}>
                                    <span style={{ color: '#66bb6a' }}>📁</span>
                                    {program.name}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Associated Targets */}
                <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#aaa' }}>
                        Targets associated with this goal ({targets.length}):
                    </label>
                    {targets.length === 0 ? (
                        <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                            No targets defined for this goal
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {targets.map(target => {
                                const activity = activityDefinitions.find(a => a.id === target.activity_id);
                                return (
                                    <div key={target.id} style={{
                                        padding: '10px 12px',
                                        background: '#252525',
                                        border: '1px solid #555',
                                        borderRadius: '4px'
                                    }}>
                                        <div style={{ fontSize: '13px', fontWeight: '500', color: 'white' }}>
                                            🎯 {target.name || activity?.name || 'Target'}
                                        </div>
                                        {target.metrics && target.metrics.length > 0 && (
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                                                {target.metrics.map(metric => {
                                                    const metricDef = activity?.metric_definitions?.find(m => m.id === metric.metric_id);
                                                    return (
                                                        <span key={metric.metric_id} style={{
                                                            padding: '2px 8px',
                                                            background: '#333',
                                                            borderRadius: '4px',
                                                            fontSize: '11px',
                                                            color: '#ccc'
                                                        }}>
                                                            {metricDef?.name || 'Metric'}: {metric.value} {metricDef?.unit || ''}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '10px', paddingTop: '12px', borderTop: '1px solid #333' }}>
                    <button
                        onClick={() => setViewState('goal')}
                        style={{
                            flex: 1,
                            padding: '12px',
                            background: 'transparent',
                            border: '1px solid #666',
                            borderRadius: '4px',
                            color: '#ccc',
                            cursor: 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            setLocalCompleted(true);
                            setLocalCompletedAt(completionDate.toISOString());
                            onToggleCompletion(goalId, false);  // false = currently not completed
                            setViewState('goal');
                        }}
                        style={{
                            flex: 1,
                            padding: '12px',
                            background: '#4caf50',
                            border: 'none',
                            borderRadius: '4px',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 'bold'
                        }}
                    >
                        ✓ Complete Goal
                    </button>
                </div>
            </div>
        );
    };

    // ============ UNCOMPLETION CONFIRMATION VIEW ============
    const renderUncompletionConfirm = () => {
        // Find programs this goal belongs to
        const findProgramsForGoal = () => {
            if (!treeData) return [];
            const foundPrograms = [];
            if (programs && programs.length > 0) {
                foundPrograms.push(...programs);
            } else if (treeData) {
                foundPrograms.push({ name: treeData.name || 'Current Program', id: treeData.id });
            }
            return foundPrograms;
        };

        const associatedPrograms = findProgramsForGoal();

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    paddingBottom: '12px',
                    borderBottom: '1px solid #ff9800'
                }}>
                    <button
                        onClick={() => setViewState('goal')}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#888',
                            fontSize: '18px',
                            cursor: 'pointer',
                            padding: '0 4px'
                        }}
                    >
                        ←
                    </button>
                    <h3 style={{ margin: 0, fontSize: '16px', color: '#ff9800' }}>
                        ⚠ Confirm Mark as Incomplete
                    </h3>
                </div>

                {/* Goal Name */}
                <div style={{
                    padding: '14px',
                    background: '#3a3020',
                    border: '1px solid #ff9800',
                    borderRadius: '6px'
                }}>
                    <div style={{ fontSize: '11px', color: '#ff9800', marginBottom: '4px' }}>
                        Marking as Incomplete:
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'white' }}>
                        {goal.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                        Type: {goalType}
                    </div>
                </div>

                {/* Originally Completed Date */}
                {localCompletedAt && (
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#aaa' }}>
                            Was completed on:
                        </label>
                        <div style={{
                            padding: '12px',
                            background: '#2a2a2a',
                            border: '1px solid #444',
                            borderRadius: '4px',
                            fontSize: '14px',
                            color: '#4caf50'
                        }}>
                            📅 {new Date(localCompletedAt).toLocaleDateString()} at {new Date(localCompletedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                )}

                {/* Warning */}
                <div style={{
                    padding: '12px',
                    background: '#3a2a20',
                    border: '1px solid #ff9800',
                    borderRadius: '4px',
                    fontSize: '13px',
                    color: '#ffcc80'
                }}>
                    ⚠️ This will remove the completion status and completion date from this goal.
                </div>

                {/* Associated Programs */}
                <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#aaa' }}>
                        Programs that will update:
                    </label>
                    {associatedPrograms.length === 0 ? (
                        <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                            No programs found
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {associatedPrograms.map((program, idx) => (
                                <div key={idx} style={{
                                    padding: '10px 12px',
                                    background: '#252525',
                                    border: '1px solid #555',
                                    borderRadius: '4px',
                                    fontSize: '13px',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}>
                                    <span style={{ color: '#ff9800' }}>📁</span>
                                    {program.name}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Associated Targets */}
                <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#aaa' }}>
                        Targets that will be marked incomplete ({targets.length}):
                    </label>
                    {targets.length === 0 ? (
                        <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                            No targets defined for this goal
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {targets.map(target => {
                                const activity = activityDefinitions.find(a => a.id === target.activity_id);
                                return (
                                    <div key={target.id} style={{
                                        padding: '10px 12px',
                                        background: '#252525',
                                        border: '1px solid #555',
                                        borderRadius: '4px'
                                    }}>
                                        <div style={{ fontSize: '13px', fontWeight: '500', color: 'white' }}>
                                            🎯 {target.name || activity?.name || 'Target'}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '10px', paddingTop: '12px', borderTop: '1px solid #333' }}>
                    <button
                        onClick={() => setViewState('goal')}
                        style={{
                            flex: 1,
                            padding: '12px',
                            background: 'transparent',
                            border: '1px solid #666',
                            borderRadius: '4px',
                            color: '#ccc',
                            cursor: 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            setLocalCompleted(false);
                            setLocalCompletedAt(null);
                            onToggleCompletion(goalId, true);  // true = currently completed
                            setViewState('goal');
                        }}
                        style={{
                            flex: 1,
                            padding: '12px',
                            background: '#ff9800',
                            border: 'none',
                            borderRadius: '4px',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 'bold'
                        }}
                    >
                        Mark Incomplete
                    </button>
                </div>
            </div>
        );
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
                // CRITICAL: Remove pre-calculated status so helper recalculates using our overrides
                smart_status: undefined,
                is_smart: undefined
            },
            // Also override top-level props if they exist there (the helper checks both)
            description: description,
            targets: Array.isArray(targets) ? targets : [],
            deadline: deadline,
            relevance_statement: relevanceStatement
        };

        return (
            <>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingBottom: '16px',
                    marginBottom: '16px',
                    borderBottom: `2px solid ${goalColor}`
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {mode === 'create' && (
                            <span style={{ color: '#4caf50', fontSize: '13px', fontWeight: 'bold' }}>
                                + Create
                            </span>
                        )}
                        <div style={{
                            padding: '5px 12px',
                            background: goalColor,
                            color: textColor,
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 'bold'
                        }}>
                            {getTypeDisplayName(goalType)}
                        </div>
                        {mode !== 'create' && (
                            <SMARTIndicator goal={goalForSmart} goalType={goalType} />
                        )}
                        {mode === 'create' && parentGoal && (
                            <span style={{ color: '#888', fontSize: '12px' }}>
                                under "{parentGoal.name}"
                            </span>
                        )}
                        {mode !== 'create' && isCompleted && (
                            <span style={{ color: '#4caf50', fontSize: '13px', fontWeight: 'bold' }}>
                                ✓ Completed
                            </span>
                        )}
                    </div>
                    {onClose && (
                        <button
                            onClick={onClose}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#888',
                                fontSize: '22px',
                                cursor: 'pointer',
                                padding: '0 4px',
                                lineHeight: 1
                            }}
                        >
                            ×
                        </button>
                    )}
                </div>

                {isEditing ? (
                    /* ============ EDIT MODE ============ */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#aaa' }}>
                                Name:
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '8px',
                                    background: '#2a2a2a',
                                    border: '1px solid #555',
                                    borderRadius: '4px',
                                    color: 'white',
                                    fontSize: '15px',
                                    fontWeight: 'bold'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#aaa' }}>
                                Description:
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={3}
                                style={{
                                    width: '100%',
                                    padding: '8px',
                                    background: '#2a2a2a',
                                    border: '1px solid #555',
                                    borderRadius: '4px',
                                    color: 'white',
                                    fontSize: '13px',
                                    resize: 'vertical'
                                }}
                            />
                        </div>

                        {/* Relevance Statement - SMART "R" Criterion */}
                        {(goal?.attributes?.parent_id || mode === 'create') && parentGoalName && (
                            <div>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#aaa' }}>
                                    Relevance (SMART):
                                </label>
                                <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px', fontStyle: 'italic' }}>
                                    How does this goal help you achieve <span style={{ color: parentGoalColor || '#fff', fontWeight: 'bold' }}>{parentGoalName}</span><span style={{ color: parentGoalColor || '#fff', fontWeight: 'bold' }}>?</span>
                                </div>
                                <textarea
                                    value={relevanceStatement}
                                    onChange={(e) => setRelevanceStatement(e.target.value)}
                                    rows={2}
                                    placeholder="Explain how this goal contributes to your higher-level objective..."
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        background: '#2a2a2a',
                                        border: relevanceStatement?.trim() ? '1px solid #4caf50' : '1px solid #555',
                                        borderRadius: '4px',
                                        color: 'white',
                                        fontSize: '13px',
                                        resize: 'vertical'
                                    }}
                                />
                            </div>
                        )}

                        <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#aaa' }}>
                                Deadline:
                            </label>
                            <input
                                type="date"
                                value={deadline}
                                onChange={(e) => setDeadline(e.target.value)}
                                style={{
                                    padding: '8px',
                                    background: '#2a2a2a',
                                    border: '1px solid #555',
                                    borderRadius: '4px',
                                    color: 'white',
                                    fontSize: '13px'
                                }}
                            />
                        </div>

                        {/* Targets Section - Edit Mode */}
                        {mode === 'create' && (
                            <TargetManager
                                targets={targets}
                                setTargets={setTargets}
                                activityDefinitions={activityDefinitions}
                                associatedActivities={associatedActivities}
                                goalId={null}
                                rootId={rootId}
                                isEditing={true}
                            />
                        )}

                        {/* Edit Actions */}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #333' }}>
                            <button
                                onClick={handleCancel}
                                style={{
                                    padding: '8px 14px',
                                    background: 'transparent',
                                    border: '1px solid #666',
                                    borderRadius: '4px',
                                    color: '#ccc',
                                    cursor: 'pointer',
                                    fontSize: '13px'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                style={{
                                    padding: '8px 14px',
                                    background: goalColor,
                                    border: 'none',
                                    borderRadius: '4px',
                                    color: textColor,
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: 600
                                }}
                            >
                                {mode === 'create' ? 'Create' : 'Save'}
                            </button>
                        </div>
                    </div>
                ) : (
                    /* ============ VIEW MODE ============ */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: goalColor }}>
                            {goal.name}
                        </div>

                        {/* Action Buttons - 2x2 Grid */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '6px'
                        }}>
                            {onToggleCompletion && (
                                <button
                                    onClick={() => {
                                        if (isCompleted) {
                                            setViewState('uncomplete-confirm');
                                        } else {
                                            setViewState('complete-confirm');
                                        }
                                    }}
                                    style={{
                                        padding: '8px 10px',
                                        background: isCompleted ? '#4caf50' : 'transparent',
                                        border: `1px solid ${isCompleted ? '#4caf50' : '#666'}`,
                                        borderRadius: '4px',
                                        color: isCompleted ? 'white' : '#ccc',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        fontWeight: isCompleted ? 'bold' : 'normal'
                                    }}
                                >
                                    {isCompleted ? '✓ Completed' : 'Mark Complete'}
                                </button>
                            )}

                            {onAddChild && childType && (
                                <button
                                    onClick={() => {
                                        if (displayMode === 'modal' && onClose) onClose();
                                        onAddChild(goal);
                                    }}
                                    style={{
                                        padding: '8px 10px',
                                        background: 'transparent',
                                        border: `1px solid ${getGoalColor(childType)}`,
                                        borderRadius: '4px',
                                        color: getGoalColor(childType),
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        fontWeight: 'bold'
                                    }}
                                >
                                    + Add {childType}
                                </button>
                            )}

                            <button
                                onClick={() => setIsEditing(true)}
                                style={{
                                    padding: '8px 10px',
                                    background: goalColor,
                                    border: 'none',
                                    borderRadius: '4px',
                                    color: textColor,
                                    cursor: 'pointer',
                                    fontSize: '12px',
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
                                    style={{
                                        padding: '8px 10px',
                                        background: 'transparent',
                                        border: '1px solid #d32f2f',
                                        borderRadius: '4px',
                                        color: '#d32f2f',
                                        cursor: 'pointer',
                                        fontSize: '12px'
                                    }}
                                >
                                    Delete Goal
                                </button>
                            )}
                        </div>

                        <div style={{ fontSize: '12px', color: '#888', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
                            {goal.attributes?.created_at && (
                                <div>
                                    Created: {new Date(goal.attributes.created_at).toLocaleDateString()}
                                    {' '}({calculateGoalAge(goal.attributes.created_at)})
                                </div>
                            )}
                            {(goal.attributes?.deadline || goal.deadline) && (
                                <div style={{ color: '#ff9800' }}>
                                    📅 Deadline: {new Date(goal.attributes?.deadline || goal.deadline).toLocaleDateString()}
                                </div>
                            )}
                            {isCompleted && localCompletedAt && (
                                <div style={{ color: '#4caf50' }}>
                                    ✓ Completed: {new Date(localCompletedAt).toLocaleDateString()} at {new Date(localCompletedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            )}
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#aaa', fontWeight: 'bold' }}>
                                Description
                            </label>
                            <div style={{ fontSize: '13px', color: '#ccc', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                                {goal.attributes?.description || goal.description ||
                                    <span style={{ fontStyle: 'italic', color: '#666' }}>No description</span>}
                            </div>
                        </div>

                        {/* Relevance Statement - View Mode */}
                        {parentGoalName && (goal.attributes?.relevance_statement || relevanceStatement) && (
                            <div>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#aaa', fontWeight: 'bold' }}>
                                    How does this goal help you achieve <span style={{ color: parentGoalColor || '#fff' }}>{parentGoalName}</span>?
                                </label>
                                <div style={{ fontSize: '13px', color: '#ccc', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                                    {goal.attributes?.relevance_statement || relevanceStatement}
                                </div>
                            </div>
                        )}

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
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#aaa' }}>
                                        Associated Programs:
                                    </label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {associatedPrograms.map(prog => (
                                            <div
                                                key={prog.id}
                                                onClick={() => {
                                                    if (displayMode === 'modal' && onClose) onClose();
                                                    navigate(`/${rootId}/programs/${prog.id}`);
                                                }}
                                                style={{
                                                    padding: '8px 10px',
                                                    background: '#153d5a',
                                                    border: '1px solid #1e5a85',
                                                    borderRadius: '4px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <span style={{ fontSize: '14px' }}>📁</span>
                                                <span style={{ fontSize: '13px', color: 'white' }}>{prog.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Associated Activities Section - View Mode */}
                        {mode !== 'create' && (
                            <ActivityAssociator
                                associatedActivities={associatedActivities}
                                setAssociatedActivities={setAssociatedActivities}
                                activityDefinitions={activityDefinitions}
                                activityGroups={activityGroups}
                                rootId={rootId}
                                goalId={goalId}
                                isEditing={true}
                                targets={targets}
                                viewMode="list"
                                onOpenSelector={() => setViewState('activity-associator')}
                            />
                        )}

                        {/* Targets Section - View Mode */}
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
                            onSave={(newTargets) => {
                                // Persist changes immediately when in View mode
                                // We use current local state for other fields to prevent overwriting with stale data
                                // although View mode generally doesn't have stale form data.
                                if (onUpdate && goalId) {
                                    onUpdate(goalId, {
                                        name,
                                        description,
                                        deadline,
                                        relevance_statement: relevanceStatement,
                                        targets: newTargets
                                    });
                                }
                            }}
                        />

                        {/* Sessions List */}
                        <GoalSessionList
                            goalType={goalType}
                            sessions={sessions}
                            goalId={goalId}
                            rootId={rootId}
                            onClose={onClose}
                        />

                    </div>
                )}
            </>
        );
    };

    // ============ DETERMINE WHICH CONTENT TO RENDER ============
    let content;
    if (viewState === 'complete-confirm') {
        content = renderCompletionConfirm();
    } else if (viewState === 'uncomplete-confirm') {
        content = renderUncompletionConfirm();
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
                activityDefinitions={activityDefinitions}
                activityGroups={activityGroups}
                rootId={rootId}
                goalId={goalId}
                isEditing={true}
                targets={targets}
                viewMode="selector"
                onCloseSelector={() => setViewState('goal')}
            />
        );
    } else {
        content = renderGoalContent();
    }

    // ============ RENDER ============


    if (displayMode === 'panel') {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
                maxHeight: 'calc(100vh - 200px)',
                overflow: 'hidden'
            }}>
                <div style={{
                    padding: '16px',
                    paddingBottom: '24px',
                    color: 'white',
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto'
                }}>
                    {content}
                </div>
            </div>
        );
    }

    // Modal mode
    return (
        <>
            <div
                className="modal-overlay"
                onClick={onClose}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}
            >
                <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        background: '#1e1e1e',
                        border: `2px solid ${goalColor}`,
                        borderRadius: '8px',
                        padding: '24px',
                        maxWidth: '700px',
                        width: '90%',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        color: 'white'
                    }}
                >
                    {content}
                </div>
            </div>
            {/* Confirmation Modal for Target Deletion */}

        </>
    );
}

export default GoalDetailModal;
