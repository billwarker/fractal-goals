import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getGoalColor, getGoalTextColor } from '../utils/goalColors';
import { getChildType, calculateGoalAge } from '../utils/goalHelpers';
import TargetCard from './TargetCard';

/**
 * GoalDetailModal Component
 * 
 * A comprehensive, shared component for viewing and editing goal details.
 * Supports two display modes:
 * - "modal" (default): Renders as a fixed overlay modal
 * - "panel": Renders inline as a sidebar panel
 * 
 * Session Relationships:
 * - ShortTermGoals: Practice sessions are CHILDREN (sessions reference this goal as parent_id)
 * - ImmediateGoals: Practice sessions are PARENTS (this goal's parent_id is a session)
 */
function GoalDetailModal({
    isOpen,
    onClose,
    goal,
    onUpdate,
    activityDefinitions = [],
    onToggleCompletion,
    onAddChild,
    onDelete,
    practiceSessions = [],
    rootId,
    treeData,
    displayMode = 'modal',  // 'modal' or 'panel'
    programs = []  // For showing associated programs on completion
}) {
    const navigate = useNavigate();
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [deadline, setDeadline] = useState('');

    // Local completion state for optimistic UI
    const [localCompleted, setLocalCompleted] = useState(false);
    const [localCompletedAt, setLocalCompletedAt] = useState(null);

    // Target editing state
    const [targets, setTargets] = useState([]);

    // View state: 'goal' (main view), 'target-add', 'target-edit', 'complete-confirm', 'uncomplete-confirm'
    const [viewState, setViewState] = useState('goal');
    const [editingTarget, setEditingTarget] = useState(null);


    // Target form state (for inline target builder)
    const [selectedActivityId, setSelectedActivityId] = useState('');
    const [targetName, setTargetName] = useState('');
    const [targetDescription, setTargetDescription] = useState('');
    const [metricValues, setMetricValues] = useState({});

    // Initialize form state from goal - use specific dependencies for completion state
    const depGoalId = goal?.attributes?.id || goal?.id;
    const depGoalCompleted = goal?.attributes?.completed;
    const depGoalCompletedAt = goal?.attributes?.completed_at;

    useEffect(() => {
        if (goal) {
            setName(goal.name || '');
            setDescription(goal.attributes?.description || goal.description || '');
            setDeadline(goal.attributes?.deadline || goal.deadline || '');
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
            setIsEditing(false);
            setViewState('goal');
        }
    }, [goal, depGoalId, depGoalCompleted, depGoalCompletedAt]);

    // For modal mode, check isOpen
    if (displayMode === 'modal' && !isOpen) return null;
    if (!goal) return null;

    const handleSave = () => {
        onUpdate(goal.id, {
            name,
            description,
            deadline: deadline || null,
            targets: targets
        });
        setIsEditing(false);
    };

    const handleCancel = () => {
        if (goal) {
            setName(goal.name || '');
            setDescription(goal.attributes?.description || goal.description || '');
            setDeadline(goal.attributes?.deadline || goal.deadline || '');

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

    // Target builder handlers
    const handleOpenAddTarget = () => {
        setEditingTarget(null);
        setSelectedActivityId('');
        setTargetName('');
        setTargetDescription('');
        setMetricValues({});
        setViewState('target-add');
    };

    const handleOpenEditTarget = (target) => {
        setEditingTarget(target);
        setSelectedActivityId(target.activity_id || '');
        setTargetName(target.name || '');
        setTargetDescription(target.description || '');
        // Convert metrics array to object
        const metricsObj = {};
        target.metrics?.forEach(m => {
            metricsObj[m.metric_id] = m.value;
        });
        setMetricValues(metricsObj);
        setViewState('target-edit');
    };

    const handleDeleteTarget = (targetId) => {
        setTargets(prev => prev.filter(t => t.id !== targetId));
    };

    const handleActivityChange = (activityId) => {
        setSelectedActivityId(activityId);
        setMetricValues({});
        const activity = activityDefinitions.find(a => a.id === activityId);
        if (activity && !targetName) {
            setTargetName(activity.name);
        }
    };

    const handleMetricChange = (metricId, value) => {
        setMetricValues(prev => ({
            ...prev,
            [metricId]: value
        }));
    };

    const handleSaveTarget = () => {
        if (!selectedActivityId) {
            alert('Please select an activity');
            return;
        }

        const selectedActivity = activityDefinitions.find(a => a.id === selectedActivityId);
        const metrics = Object.entries(metricValues).map(([metric_id, value]) => ({
            metric_id,
            value: parseFloat(value) || 0
        }));

        const target = {
            id: editingTarget?.id || crypto.randomUUID(),
            activity_id: selectedActivityId,
            name: targetName || selectedActivity?.name || 'Unnamed Target',
            description: targetDescription,
            metrics
        };

        if (editingTarget) {
            setTargets(prev => prev.map(t => t.id === target.id ? target : t));
        } else {
            setTargets(prev => [...prev, target]);
        }

        setViewState('goal');
        setEditingTarget(null);
    };

    const handleCancelTargetEdit = () => {
        setViewState('goal');
        setEditingTarget(null);
    };

    const goalType = goal.attributes?.type || goal.type;
    const goalColor = getGoalColor(goalType);
    const textColor = getGoalTextColor(goalType);
    const isCompleted = localCompleted;  // Use local state for optimistic UI
    const goalId = goal.attributes?.id || goal.id;
    const childType = getChildType(goalType);

    // Session relationships
    const isShortTermGoal = goalType === 'ShortTermGoal';
    const isImmediateGoal = goalType === 'ImmediateGoal';

    const childSessions = isShortTermGoal
        ? practiceSessions.filter(session => {
            const parentIds = session.attributes?.parent_ids || [];
            return parentIds.includes(goalId);
        })
        : [];

    let parentSession = null;
    if (isImmediateGoal && practiceSessions.length > 0) {
        const parentId = goal.attributes?.parent_id || goal.parent_id;
        parentSession = practiceSessions.find(s => s.id === parentId);
    }

    // Get activities with metrics for target builder
    const activitiesWithMetrics = activityDefinitions.filter(a =>
        a.has_metrics && a.metric_definitions && a.metric_definitions.length > 0
    );
    const selectedActivity = activityDefinitions.find(a => a.id === selectedActivityId);

    // ============ TARGET BUILDER VIEW ============
    const renderTargetBuilder = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                paddingBottom: '12px',
                borderBottom: '1px solid #444'
            }}>
                <button
                    onClick={handleCancelTargetEdit}
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
                <h3 style={{ margin: 0, fontSize: '16px', color: 'white' }}>
                    {editingTarget ? 'Edit Target' : 'Add Target'}
                </h3>
            </div>

            {/* Activity Selector */}
            <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#aaa' }}>
                    Activity *
                </label>
                <select
                    value={selectedActivityId}
                    onChange={(e) => handleActivityChange(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '8px',
                        background: '#2a2a2a',
                        border: '1px solid #555',
                        borderRadius: '4px',
                        color: 'white',
                        fontSize: '13px'
                    }}
                >
                    <option value="">Select an activity...</option>
                    {activitiesWithMetrics.map(activity => (
                        <option key={activity.id} value={activity.id}>
                            {activity.name}
                        </option>
                    ))}
                </select>
                {activitiesWithMetrics.length === 0 && (
                    <div style={{ fontSize: '11px', color: '#f44336', marginTop: '4px' }}>
                        No activities with metrics found. Create one first.
                    </div>
                )}
            </div>

            {/* Target Name */}
            <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#aaa' }}>
                    Target Name
                </label>
                <input
                    type="text"
                    value={targetName}
                    onChange={(e) => setTargetName(e.target.value)}
                    placeholder={selectedActivity?.name || 'Enter target name...'}
                    style={{
                        width: '100%',
                        padding: '8px',
                        background: '#2a2a2a',
                        border: '1px solid #555',
                        borderRadius: '4px',
                        color: 'white',
                        fontSize: '13px'
                    }}
                />
            </div>

            {/* Target Description */}
            <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#aaa' }}>
                    Description
                </label>
                <textarea
                    value={targetDescription}
                    onChange={(e) => setTargetDescription(e.target.value)}
                    placeholder="Optional description..."
                    rows={2}
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

            {/* Metric Values */}
            {selectedActivity && selectedActivity.metric_definitions?.length > 0 && (
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: '#aaa' }}>
                        Target Metrics
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {selectedActivity.metric_definitions.map(metric => (
                            <div key={metric.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '10px',
                                background: '#2a2a2a',
                                borderRadius: '4px',
                                border: '1px solid #444'
                            }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '13px', color: 'white', fontWeight: '500' }}>
                                        {metric.name}
                                    </div>
                                    {metric.description && (
                                        <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                                            {metric.description}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <input
                                        type="number"
                                        value={metricValues[metric.id] || ''}
                                        onChange={(e) => handleMetricChange(metric.id, e.target.value)}
                                        placeholder="0"
                                        style={{
                                            width: '70px',
                                            padding: '6px',
                                            background: '#1e1e1e',
                                            border: '1px solid #555',
                                            borderRadius: '4px',
                                            color: 'white',
                                            fontSize: '13px',
                                            textAlign: 'right'
                                        }}
                                    />
                                    <span style={{ fontSize: '12px', color: '#888', minWidth: '40px' }}>
                                        {metric.unit}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #333' }}>
                <button
                    onClick={handleCancelTargetEdit}
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
                    onClick={handleSaveTarget}
                    disabled={!selectedActivityId}
                    style={{
                        padding: '8px 14px',
                        background: selectedActivityId ? '#4caf50' : '#333',
                        border: 'none',
                        borderRadius: '4px',
                        color: selectedActivityId ? 'white' : '#666',
                        cursor: selectedActivityId ? 'pointer' : 'not-allowed',
                        fontSize: '13px',
                        fontWeight: 600
                    }}
                >
                    {editingTarget ? 'Update Target' : 'Add Target'}
                </button>
            </div>
        </div>
    );

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
    const renderGoalContent = () => (
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
                    <div style={{
                        padding: '5px 12px',
                        background: goalColor,
                        color: textColor,
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 'bold'
                    }}>
                        {goalType}
                    </div>
                    {isCompleted && (
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
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <label style={{ fontSize: '12px', color: '#aaa' }}>Targets:</label>
                            {activitiesWithMetrics.length > 0 && (
                                <button
                                    onClick={handleOpenAddTarget}
                                    style={{
                                        background: '#4caf50',
                                        border: 'none',
                                        color: 'white',
                                        fontSize: '11px',
                                        padding: '4px 10px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontWeight: 'bold'
                                    }}
                                >
                                    + Add Target
                                </button>
                            )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {targets.length === 0 ? (
                                <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                                    {activitiesWithMetrics.length === 0
                                        ? 'No activities with metrics available'
                                        : 'No targets defined'}
                                </div>
                            ) : (
                                targets.map(target => (
                                    <TargetCard
                                        key={target.id}
                                        target={target}
                                        activityDefinitions={activityDefinitions}
                                        onEdit={() => handleOpenEditTarget(target)}
                                        onDelete={() => handleDeleteTarget(target.id)}
                                        isCompleted={false}
                                        isEditMode={true}
                                    />
                                ))
                            )}
                        </div>
                    </div>

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
                            Save
                        </button>
                    </div>
                </div>
            ) : (
                /* ============ VIEW MODE ============ */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: goalColor }}>
                        {goal.name}
                    </div>

                    <div style={{ fontSize: '12px', color: '#888' }}>
                        {goal.attributes?.created_at && (
                            <div style={{ marginBottom: '4px' }}>
                                Created: {new Date(goal.attributes.created_at).toLocaleDateString()}
                                {' '}({calculateGoalAge(goal.attributes.created_at)})
                            </div>
                        )}
                        {(goal.attributes?.deadline || goal.deadline) && (
                            <div style={{ color: '#ff9800', marginBottom: '4px' }}>
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
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#aaa' }}>
                            Description:
                        </label>
                        <div style={{ fontSize: '13px', color: '#ccc', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                            {goal.attributes?.description || goal.description ||
                                <span style={{ fontStyle: 'italic', color: '#666' }}>No description</span>}
                        </div>
                    </div>

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

                    {/* Targets Section - View Mode */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <label style={{ fontSize: '12px', color: '#aaa' }}>
                                Targets ({targets.length}):
                            </label>
                            {activitiesWithMetrics.length > 0 && (
                                <button
                                    onClick={handleOpenAddTarget}
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid #4caf50',
                                        color: '#4caf50',
                                        fontSize: '10px',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    + Add
                                </button>
                            )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {targets.length === 0 ? (
                                <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                                    No targets defined
                                </div>
                            ) : (
                                targets.map(target => (
                                    <TargetCard
                                        key={target.id}
                                        target={target}
                                        activityDefinitions={activityDefinitions}
                                        isCompleted={isCompleted}
                                        isEditMode={false}
                                    />
                                ))
                            )}
                        </div>
                    </div>

                    {/* Practice Sessions - For ShortTermGoals */}
                    {isShortTermGoal && (
                        <div>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#aaa' }}>
                                Practice Sessions ({childSessions.length}):
                            </label>
                            {childSessions.length === 0 ? (
                                <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                                    No practice sessions yet
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {childSessions.map(session => (
                                        <div
                                            key={session.id}
                                            onClick={() => {
                                                if (displayMode === 'modal' && onClose) onClose();
                                                navigate(`/${rootId}/session/${session.id}`);
                                            }}
                                            style={{
                                                padding: '8px 10px',
                                                background: '#2a2a2a',
                                                border: '1px solid #444',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                fontSize: '13px'
                                            }}
                                        >
                                            <span style={{ color: 'white' }}>{session.name}</span>
                                            {session.attributes?.created_at && (
                                                <span style={{ fontSize: '11px', color: '#888' }}>
                                                    {new Date(session.attributes.created_at).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Parent Session - For ImmediateGoals */}
                    {isImmediateGoal && parentSession && (
                        <div>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#aaa' }}>
                                Parent Session:
                            </label>
                            <div
                                onClick={() => {
                                    if (displayMode === 'modal' && onClose) onClose();
                                    navigate(`/${rootId}/session/${parentSession.id}`);
                                }}
                                style={{
                                    padding: '8px 10px',
                                    background: '#2a2a2a',
                                    border: '1px solid #9c27b0',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    fontSize: '13px'
                                }}
                            >
                                <span style={{ color: 'white' }}>{parentSession.name}</span>
                                {parentSession.attributes?.created_at && (
                                    <span style={{ fontSize: '11px', color: '#888' }}>
                                        {new Date(parentSession.attributes.created_at).toLocaleDateString()}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        paddingTop: '12px',
                        borderTop: '1px solid #333'
                    }}>
                        {onToggleCompletion && (
                            <button
                                onClick={() => {
                                    if (isCompleted) {
                                        // Un-completing: show confirmation view
                                        setViewState('uncomplete-confirm');
                                    } else {
                                        // Completing: show confirmation view
                                        setViewState('complete-confirm');
                                    }
                                }}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: isCompleted ? '#4caf50' : 'transparent',
                                    border: `1px solid ${isCompleted ? '#4caf50' : '#666'}`,
                                    borderRadius: '4px',
                                    color: isCompleted ? 'white' : '#ccc',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: isCompleted ? 'bold' : 'normal'
                                }}
                            >
                                {isCompleted ? '✓ Completed' : 'Mark Complete'}
                            </button>
                        )}

                        <button
                            onClick={() => setIsEditing(true)}
                            style={{
                                width: '100%',
                                padding: '10px',
                                background: goalColor,
                                border: 'none',
                                borderRadius: '4px',
                                color: textColor,
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: 600
                            }}
                        >
                            Edit Goal
                        </button>

                        {onAddChild && childType && (
                            <button
                                onClick={() => {
                                    if (displayMode === 'modal' && onClose) onClose();
                                    onAddChild(goal);
                                }}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: 'transparent',
                                    border: '1px solid #666',
                                    borderRadius: '4px',
                                    color: '#ccc',
                                    cursor: 'pointer',
                                    fontSize: '13px'
                                }}
                            >
                                + Add {childType}
                            </button>
                        )}

                        {onDelete && (
                            <button
                                onClick={() => {
                                    if (displayMode === 'modal' && onClose) onClose();
                                    onDelete(goal);
                                }}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: 'transparent',
                                    border: '1px solid #d32f2f',
                                    borderRadius: '4px',
                                    color: '#d32f2f',
                                    cursor: 'pointer',
                                    fontSize: '13px'
                                }}
                            >
                                Delete Goal
                            </button>
                        )}
                    </div>
                </div>
            )}
        </>
    );

    // ============ DETERMINE WHICH CONTENT TO RENDER ============
    let content;
    if (viewState === 'target-add' || viewState === 'target-edit') {
        content = renderTargetBuilder();
    } else if (viewState === 'complete-confirm') {
        content = renderCompletionConfirm();
    } else if (viewState === 'uncomplete-confirm') {
        content = renderUncompletionConfirm();
    } else {
        content = renderGoalContent();
    }

    // ============ RENDER ============
    if (displayMode === 'panel') {
        return (
            <div style={{
                padding: '16px',
                color: 'white',
                height: '100%',
                overflowY: 'auto'
            }}>
                {content}
            </div>
        );
    }

    // Modal mode
    return (
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
    );
}

export default GoalDetailModal;
