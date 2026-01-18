import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getGoalColor, getGoalTextColor } from '../utils/goalColors';
import { getChildType, getTypeDisplayName, calculateGoalAge } from '../utils/goalHelpers';
import SMARTIndicator from './SMARTIndicator';
import { fractalApi } from '../utils/api';
import TargetManager from './goalDetail/TargetManager';
import ActivityAssociator from './goalDetail/ActivityAssociator';
import GoalSessionList from './goalDetail/GoalSessionList';
import './GoalDetailModal.css';

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
            <div className="confirm-view">
                {/* Header */}
                <div className="confirm-header" style={{ borderBottomColor: 'var(--success-color)' }}>
                    <button className="back-btn" onClick={() => setViewState('goal')}>←</button>
                    <h3 className="confirm-title success">✓ Confirm Goal Completion</h3>
                </div>

                <div className="modal-body">
                    {/* Goal Name */}
                    <div className="info-card" style={{ borderColor: 'var(--success-color)', background: 'rgba(76, 175, 80, 0.1)' }}>
                        <div className="meta-label" style={{ color: 'var(--success-color)' }}>Completing Goal:</div>
                        <div className="confirm-title" style={{ fontSize: 'var(--text-base)' }}>{goal.name}</div>
                        <div className="meta-value" style={{ color: 'var(--text-dim)' }}>Type: {goalType}</div>
                    </div>

                    {/* Associated Programs */}
                    <div className="form-group">
                        <label className="section-label">Associated Programs</label>
                        {associatedPrograms.length > 0 ? (
                            <div className="info-grid">
                                {associatedPrograms.map(prog => (
                                    <div key={prog.id} className="list-item">
                                        <span style={{ color: 'var(--success-color)' }}>🎯</span>
                                        <span>{prog.name}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-italic">No directly associated programs found.</p>
                        )}
                    </div>

                    <div className="separator" />

                    {/* Submit Actions */}
                    <div className="action-group">
                        <button className="btn btn-outline" onClick={() => setViewState('goal')}>
                            Cancel
                        </button>
                        <button
                            className="btn btn-success btn-full"
                            onClick={() => {
                                setLocalCompleted(true);
                                setLocalCompletedAt(completionDate.toISOString());
                                onToggleCompletion(goalId, false);
                                setViewState('goal');
                            }}
                        >
                            Mark as Completed
                        </button>
                    </div>
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
            <div className="confirm-view">
                {/* Header */}
                <div className="confirm-header" style={{ borderBottomColor: 'var(--warning-color)' }}>
                    <button className="back-btn" onClick={() => setViewState('goal')}>←</button>
                    <h3 className="confirm-title warning">⚠ Confirm Mark as Incomplete</h3>
                </div>

                <div className="modal-body">
                    {/* Goal Name */}
                    <div className="info-card" style={{ borderColor: 'var(--warning-color)', background: 'rgba(255, 152, 0, 0.1)' }}>
                        <div className="meta-label" style={{ color: 'var(--warning-color)' }}>Marking as Incomplete:</div>
                        <div className="confirm-title" style={{ fontSize: 'var(--text-base)' }}>{goal.name}</div>
                        <div className="meta-value" style={{ color: 'var(--text-dim)' }}>Type: {goalType}</div>
                    </div>

                    {/* Originally Completed Date */}
                    {localCompletedAt && (
                        <div className="meta-item">
                            <label className="meta-label">Originally completed on:</label>
                            <div className="meta-value" style={{ color: 'var(--success-color)' }}>
                                📅 {new Date(localCompletedAt).toLocaleDateString()}
                            </div>
                        </div>
                    )}

                    {/* Warning */}
                    <div className="info-card" style={{ background: 'rgba(255, 152, 0, 0.05)', borderStyle: 'dashed' }}>
                        <div className="section-content" style={{ color: 'var(--warning-color)' }}>
                            ⚠️ This will remove the completion status and date from this goal and its associated targets.
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="action-group">
                        <button className="btn btn-outline" onClick={() => setViewState('goal')}>
                            Cancel
                        </button>
                        <button
                            className="btn btn-warning btn-full"
                            onClick={() => {
                                setLocalCompleted(false);
                                setLocalCompletedAt(null);
                                onToggleCompletion(goalId, true);
                                setViewState('goal');
                            }}
                        >
                            Confirm Mark Incomplete
                        </button>
                    </div>
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
            <div className="confirm-view">
                {/* Header */}
                <div className="modal-header">
                    <div className="header-left">
                        {mode === 'create' && (
                            <span className="create-label">+ Create</span>
                        )}
                        <div className="type-badge">
                            {getTypeDisplayName(goalType)}
                        </div>
                        {mode !== 'create' && (
                            <SMARTIndicator goal={goalForSmart} goalType={goalType} />
                        )}
                        {mode === 'create' && parentGoal && (
                            <span className="parent-context">under "{parentGoal.name}"</span>
                        )}
                        {mode !== 'create' && isCompleted && (
                            <span className="completion-badge">✓ Completed</span>
                        )}
                    </div>
                    {onClose && (
                        <button className="close-btn" onClick={onClose}>×</button>
                    )}
                </div>

                {isEditing ? (
                    /* ============ EDIT MODE ============ */
                    <div className="modal-body">
                        <div className="form-group">
                            <label className="section-label">Name</label>
                            <input
                                type="text"
                                className="form-input"
                                style={{ fontFamily: 'var(--font-family)', fontWeight: 300, fontSize: '1.25rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>

                        <div className="form-group">
                            <label className="section-label">Description</label>
                            <textarea
                                className="form-textarea"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={3}
                            />
                        </div>

                        {/* Relevance Statement - SMART "R" Criterion */}
                        {(goal?.attributes?.parent_id || mode === 'create') && parentGoalName && (
                            <div className="form-group">
                                <label className="section-label">
                                    Relevance to <span style={{ color: parentGoalColor || 'var(--accent-color)' }}>{parentGoalName}</span>
                                </label>
                                <textarea
                                    className="form-textarea"
                                    style={{ borderColor: relevanceStatement?.trim() ? 'var(--success-color)' : 'var(--border-color)' }}
                                    value={relevanceStatement}
                                    onChange={(e) => setRelevanceStatement(e.target.value)}
                                    rows={2}
                                    placeholder="How does this goal help?"
                                />
                            </div>
                        )}

                        <div className="form-group">
                            <label className="section-label">Deadline</label>
                            <input
                                type="date"
                                className="form-input"
                                value={deadline}
                                onChange={(e) => setDeadline(e.target.value)}
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

                        <div className="separator" />

                        {/* Edit Actions */}
                        <div className="action-group" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn btn-outline" onClick={handleCancel}>
                                Cancel
                            </button>
                            <button className="btn btn-edit" onClick={handleSave}>
                                {mode === 'create' ? 'Create' : 'Save'}
                            </button>
                        </div>
                    </div>
                ) : (
                    /* ============ VIEW MODE ============ */
                    <div className="modal-body">
                        <h2 style={{
                            margin: 0,
                            fontFamily: 'var(--font-family)',
                            fontWeight: 300,
                            fontSize: '1.5rem',
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                            color: goalColor || 'var(--text-bright)'
                        }}>
                            {goal.name}
                        </h2>

                        {/* Action Buttons - 2x2 Grid */}
                        <div className="action-grid">
                            {onToggleCompletion && (
                                <button
                                    onClick={() => isCompleted ? setViewState('uncomplete-confirm') : setViewState('complete-confirm')}
                                    className={`btn ${isCompleted ? 'btn-completed' : 'btn-outline'}`}
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
                                    className="btn btn-add-child"
                                >
                                    + Add {childType}
                                </button>
                            )}

                            <button
                                onClick={() => setIsEditing(true)}
                                className="btn btn-edit"
                            >
                                Edit Goal
                            </button>

                            {onDelete && (
                                <button
                                    onClick={() => {
                                        if (displayMode === 'modal' && onClose) onClose();
                                        onDelete(goal);
                                    }}
                                    className="btn btn-delete"
                                >
                                    Delete Goal
                                </button>
                            )}
                        </div>

                        <div className="meta-row">
                            {goal.attributes?.created_at && (
                                <div>
                                    Created: {new Date(goal.attributes.created_at).toLocaleDateString()}
                                    {' '}({calculateGoalAge(goal.attributes.created_at)})
                                </div>
                            )}
                            {(goal.attributes?.deadline || goal.deadline) && (
                                <div className="meta-deadline">
                                    📅 Deadline: {new Date(goal.attributes?.deadline || goal.deadline).toLocaleDateString()}
                                </div>
                            )}
                            {isCompleted && localCompletedAt && (
                                <div className="meta-completed">
                                    ✓ Completed: {new Date(localCompletedAt).toLocaleDateString()}
                                </div>
                            )}
                        </div>

                        <div className="form-group">
                            <label className="section-label">Description</label>
                            <div className="section-content">
                                {goal.attributes?.description || goal.description ||
                                    <span className="text-italic">No description</span>}
                            </div>
                        </div>

                        {/* Relevance Statement - View Mode */}
                        {parentGoalName && (goal.attributes?.relevance_statement || relevanceStatement) && (
                            <div className="form-group">
                                <label className="section-label">
                                    Helping achieve <span style={{ color: parentGoalColor || 'var(--accent-color)' }}>{parentGoalName}</span>
                                </label>
                                <div className="section-content">
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
            </div>
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

    const containerClasses = `goal-detail-container ${displayMode === 'panel' ? 'panel-mode' : ''}`;
    const dynamicStyles = {
        '--goal-color': goalColor,
        '--goal-text-color': textColor
    };

    if (displayMode === 'panel') {
        return (
            <div className={containerClasses} style={dynamicStyles}>
                {content}
            </div>
        );
    }

    // Modal mode
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className={containerClasses}
                style={dynamicStyles}
                onClick={(e) => e.stopPropagation()}
            >
                {content}
            </div>
        </div>
    );
}

export default GoalDetailModal;
