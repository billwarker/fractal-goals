import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getGoalColor, getGoalTextColor } from '../utils/goalColors';
import { getChildType, getTypeDisplayName, calculateGoalAge } from '../utils/goalHelpers';
import TargetCard from './TargetCard';
import SMARTIndicator from './SMARTIndicator';
import ConfirmationModal from './ConfirmationModal';
import { fractalApi } from '../utils/api';

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

    // View state: 'goal' (main view), 'target-add', 'target-edit', 'complete-confirm', 'uncomplete-confirm', 'activity-selector'
    const [viewState, setViewState] = useState('goal');
    const [editingTarget, setEditingTarget] = useState(null);
    const [activitySelectorGroupId, setActivitySelectorGroupId] = useState(null);  // null = show groups, string = show activities in group
    const [tempSelectedActivities, setTempSelectedActivities] = useState([]);  // For temp selection in activity selector


    // Target form state (for inline target builder)
    const [selectedActivityId, setSelectedActivityId] = useState('');
    const [targetName, setTargetName] = useState('');
    const [targetDescription, setTargetDescription] = useState('');
    const [metricValues, setMetricValues] = useState({});

    // Associated activities state
    const [associatedActivities, setAssociatedActivities] = useState([]);
    const [isLoadingActivities, setIsLoadingActivities] = useState(false);

    // Delete confirmation state
    const [targetToDelete, setTargetToDelete] = useState(null);
    const [deleteTargetCallback, setDeleteTargetCallback] = useState(null);

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

    // Handler for confirming activity selection from inline view
    const handleConfirmActivitySelection = async () => {
        if (!rootId || !depGoalId || tempSelectedActivities.length === 0) {
            setViewState('goal');
            setActivitySelectorGroupId(null);
            setTempSelectedActivities([]);
            return;
        }

        try {
            // For each new activity, we need to add the goal to its associations
            for (const activityId of tempSelectedActivities) {
                const activity = activityDefinitions.find(a => a.id === activityId);
                if (activity) {
                    // Get current goals for this activity and add our goal
                    const currentGoals = activity.goal_ids || [];
                    const newGoalIds = [...new Set([...currentGoals, depGoalId])];
                    await fractalApi.setActivityGoals(rootId, activityId, newGoalIds);
                }
            }

            // Refresh the associations
            const response = await fractalApi.getGoalActivities(rootId, depGoalId);
            setAssociatedActivities(response.data || []);
        } catch (error) {
            console.error('Error adding activity associations:', error);
        }

        setViewState('goal');
        setActivitySelectorGroupId(null);
        setTempSelectedActivities([]);
    };

    // Handler for opening activity selector view
    const handleOpenActivitySelector = () => {
        setTempSelectedActivities([]);
        setActivitySelectorGroupId(null);
        setViewState('activity-selector');
    };

    // Handler for canceling activity selection
    const handleCancelActivitySelector = () => {
        setViewState('goal');
        setActivitySelectorGroupId(null);
        setTempSelectedActivities([]);
    };

    // Handler for toggling activity in temp selection
    const handleToggleActivitySelection = (activityId) => {
        if (associatedActivities.some(a => a.id === activityId)) {
            return; // Already associated, don't toggle
        }
        setTempSelectedActivities(prev =>
            prev.includes(activityId)
                ? prev.filter(id => id !== activityId)
                : [...prev, activityId]
        );
    };

    // Handler for removing an activity association
    const handleRemoveActivity = async (activityId) => {
        // Find activity object to check name
        const activityToRemove = associatedActivities.find(a => String(a.id) === String(activityId));

        // Check if activity is used in any target (ID or Name match)
        const isUsedInTarget = targets.some(t => {
            // ID match
            if (String(t.activity_id) === String(activityId)) return true;

            // Name match (if activity found)
            if (activityToRemove) {
                const normalize = s => s ? String(s).trim().toLowerCase() : '';
                const activityName = normalize(activityToRemove.name);

                const targetActivityDef = activityDefinitions.find(ad => ad.id === t.activity_id);
                if (targetActivityDef && normalize(targetActivityDef.name) === activityName) return true;

                // Check target name override
                if (t.name && normalize(t.name) === activityName) return true;
            }
            return false;
        });

        if (isUsedInTarget) {
            alert('Cannot remove this activity because it is used in one or more targets for this goal. Please remove the targets first.');
            return;
        }

        if (!rootId || !depGoalId) return;

        try {
            await fractalApi.removeActivityGoal(rootId, activityId, depGoalId);
            // Update local state
            setAssociatedActivities(prev => prev.filter(a => a.id !== activityId));
        } catch (error) {
            console.error('Error removing activity association:', error);
        }
    };

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
        const newTargets = targets.filter(t => t.id !== targetId);
        setTargets(newTargets);

        // If not in full edit mode, persist immediately
        if (!isEditing && mode !== 'create') {
            onUpdate(goal.id, {
                name,
                description,
                deadline: deadline || null,
                targets: newTargets,
                targets: newTargets,
                relevance_statement: relevanceStatement
            });
        }
    };

    const confirmAndDeleteTarget = (targetId, onSuccess) => {
        setTargetToDelete(targetId);
        setDeleteTargetCallback(() => onSuccess); // Wrap in function to avoid immediate execution if onSuccess is a function
    };

    const handleFinalizeDeleteTarget = () => {
        if (targetToDelete) {
            handleDeleteTarget(targetToDelete);
            if (deleteTargetCallback) deleteTargetCallback();
        }
        setTargetToDelete(null);
        setDeleteTargetCallback(null);
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

        let newTargets;
        if (editingTarget) {
            newTargets = targets.map(t => t.id === target.id ? target : t);
        } else {
            newTargets = [...targets, target];
        }

        setTargets(newTargets);

        // If not in full edit mode, persist immediately
        if (!isEditing && mode !== 'create') {
            onUpdate(goal.id, {
                name,
                description,
                deadline: deadline || null,
                targets: newTargets,
                relevance_statement: relevanceStatement
            });
        }

        setViewState('goal');
        setEditingTarget(null);
    };

    const handleCancelTargetEdit = () => {
        setViewState('goal');
        setEditingTarget(null);
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

    // For STGs: Find sessions that have this goal in their short_term_goals array OR parent_ids
    const childSessions = (isShortTermGoal && mode !== 'create')
        ? sessions.filter(session => {
            if (!session) return false;
            // Check new format: short_term_goals array
            const shortTermGoals = session.short_term_goals || [];
            if (shortTermGoals.some(stg => stg?.id === goalId)) return true;

            // Check legacy format: attributes.parent_ids
            const parentIds = session.attributes?.parent_ids || [];
            return parentIds.includes(goalId);
        })
        : [];

    // For IGs: Find sessions that have this goal in their immediate_goals array OR goal_ids
    const associatedSessions = (isImmediateGoal && mode !== 'create')
        ? sessions.filter(session => {
            if (!session) return false;
            // Check new format: immediate_goals array
            const immediateGoals = session.immediate_goals || [];
            if (immediateGoals.some(ig => ig?.id === goalId)) return true;

            // Check legacy format: attributes.goal_ids
            const goalIds = session.attributes?.goal_ids || [];
            return goalIds.includes(goalId);
        })
        : [];

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
    const selectedActivity = activityDefinitions.find(a => a.id === selectedActivityId);

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
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: '#aaa' }}>
                    Activity *
                </label>

                {activitiesForTargets.length === 0 ? (
                    <div style={{ fontSize: '11px', color: '#f44336', marginTop: '4px' }}>
                        {associatedActivities.length === 0
                            ? 'No activities associated with this goal. Add activities first before setting targets.'
                            : 'No associated activities have metrics. Add metrics to activities or associate activities with metrics.'}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {activitiesForTargets.map(activity => {
                            const isSelected = selectedActivityId === activity.id;
                            return (
                                <button
                                    key={activity.id}
                                    onClick={() => handleActivityChange(activity.id)}
                                    style={{
                                        padding: '6px 12px',
                                        background: isSelected ? '#1b3320' : '#2a2a2a',
                                        border: `1px solid ${isSelected ? '#4caf50' : '#444'}`,
                                        borderRadius: '16px',
                                        color: isSelected ? '#4caf50' : '#ccc',
                                        fontSize: '13px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                    onMouseOver={(e) => {
                                        if (!isSelected) {
                                            e.currentTarget.style.borderColor = '#666';
                                            e.currentTarget.style.color = 'white';
                                        }
                                    }}
                                    onMouseOut={(e) => {
                                        if (!isSelected) {
                                            e.currentTarget.style.borderColor = '#444';
                                            e.currentTarget.style.color = '#ccc';
                                        }
                                    }}
                                >
                                    {isSelected && <span>✓</span>}
                                    {activity.name}
                                </button>
                            );
                        })}
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid #333' }}>
                {editingTarget ? (
                    <button
                        onClick={() => {
                            confirmAndDeleteTarget(editingTarget.id, () => {
                                setViewState('goal');
                                setEditingTarget(null);
                            });
                        }}
                        style={{
                            padding: '8px 14px',
                            background: 'transparent',
                            border: '1px solid #f44336',
                            borderRadius: '4px',
                            color: '#f44336',
                            cursor: 'pointer',
                            fontSize: '13px'
                        }}
                    >
                        Delete Target
                    </button>
                ) : <div />}

                <div style={{ display: 'flex', gap: '8px' }}>
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
        </div>
    );

    // ============ ACTIVITY SELECTOR VIEW ============
    const renderActivitySelector = () => {
        // Group activities by their group
        const groupedActivities = {};
        const ungroupedActivities = [];

        activityDefinitions.forEach(activity => {
            if (activity.group_id) {
                if (!groupedActivities[activity.group_id]) {
                    groupedActivities[activity.group_id] = [];
                }
                groupedActivities[activity.group_id].push(activity);
            } else {
                ungroupedActivities.push(activity);
            }
        });

        const alreadyAssociatedIds = associatedActivities.map(a => a.id);

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    paddingBottom: '12px',
                    borderBottom: '1px solid #4caf50'
                }}>
                    <button
                        onClick={() => {
                            if (activitySelectorGroupId !== null) {
                                setActivitySelectorGroupId(null);
                            } else {
                                handleCancelActivitySelector();
                            }
                        }}
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
                    <h3 style={{ margin: 0, fontSize: '16px', color: 'white', flex: 1 }}>
                        {activitySelectorGroupId === null
                            ? 'Select Activity Group'
                            : activitySelectorGroupId === 'ungrouped'
                                ? 'Ungrouped Activities'
                                : activityGroups.find(g => g.id === activitySelectorGroupId)?.name || 'Activities'}
                    </h3>
                    <button
                        onClick={handleCancelActivitySelector}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#888',
                            cursor: 'pointer',
                            fontSize: '18px'
                        }}
                    >
                        ×
                    </button>
                </div>

                <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>
                    Select activities that this goal requires. Associated activities help track the "Achievable" criterion in SMART goals.
                </p>

                {activityDefinitions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                        <p>No activities found. Create activities in the Manage Activities page.</p>
                    </div>
                ) : activitySelectorGroupId === null ? (
                    /* LEVEL 1: GROUPS */

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                        gap: '10px',
                        marginTop: '8px'
                    }}>
                        {/* Group Cards */}
                        {activityGroups.map(group => {
                            const groupActivities = groupedActivities[group.id] || [];
                            if (groupActivities.length === 0) return null;

                            // Count how many are already selected
                            const selectedCount = groupActivities.filter(a =>
                                alreadyAssociatedIds.includes(a.id) || tempSelectedActivities.includes(a.id)
                            ).length;

                            return (
                                <button
                                    key={group.id}
                                    onClick={() => setActivitySelectorGroupId(group.id)}
                                    style={{
                                        padding: '16px 12px',
                                        background: '#333',
                                        border: selectedCount > 0 ? '2px solid #4caf50' : '1px solid #555',
                                        borderRadius: '8px',
                                        color: 'white',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '6px',
                                        transition: 'all 0.2s',
                                        textAlign: 'center'
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.background = '#444'}
                                    onMouseOut={(e) => e.currentTarget.style.background = '#333'}
                                >
                                    <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{group.name}</div>
                                    <div style={{ fontSize: '11px', color: '#888' }}>
                                        {groupActivities.length} activities
                                    </div>
                                    {selectedCount > 0 && (
                                        <div style={{
                                            fontSize: '10px',
                                            color: '#4caf50',
                                            background: '#1a3a1a',
                                            padding: '2px 8px',
                                            borderRadius: '10px'
                                        }}>
                                            {selectedCount} selected
                                        </div>
                                    )}
                                </button>
                            );
                        })}

                        {/* Ungrouped Card */}
                        {ungroupedActivities.length > 0 && (
                            <button
                                onClick={() => setActivitySelectorGroupId('ungrouped')}
                                style={{
                                    padding: '16px 12px',
                                    background: '#333',
                                    border: '1px dashed #666',
                                    borderRadius: '8px',
                                    color: '#ccc',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '6px',
                                    textAlign: 'center'
                                }}
                            >
                                <div style={{ fontSize: '14px', fontStyle: 'italic' }}>Ungrouped</div>
                                <div style={{ fontSize: '11px', color: '#888' }}>{ungroupedActivities.length} activities</div>
                            </button>
                        )}
                    </div>


                ) : (
                    /* LEVEL 2: ACTIVITIES */
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        maxHeight: '320px',
                        overflowY: 'auto',
                        paddingRight: '8px'
                    }}>
                        {(activitySelectorGroupId === 'ungrouped' ? ungroupedActivities : groupedActivities[activitySelectorGroupId] || []).map(activity => {
                            const isAlreadyAssociated = alreadyAssociatedIds.includes(activity.id);
                            const isSelected = tempSelectedActivities.includes(activity.id);
                            const hasMetrics = activity.metrics && activity.metrics.length > 0;

                            return (
                                <div
                                    key={activity.id}
                                    onClick={() => handleToggleActivitySelection(activity.id)}
                                    style={{
                                        background: isSelected ? '#2a4a2a' : '#1e1e1e',
                                        border: `2px solid ${isSelected || isAlreadyAssociated ? '#4caf50' : '#444'}`,
                                        borderRadius: '6px',
                                        padding: '12px 14px',
                                        cursor: isAlreadyAssociated ? 'not-allowed' : 'pointer',
                                        opacity: isAlreadyAssociated ? 0.6 : 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isAlreadyAssociated && !isSelected) {
                                            e.currentTarget.style.borderColor = '#4caf50';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isAlreadyAssociated && !isSelected) {
                                            e.currentTarget.style.borderColor = '#444';
                                        }
                                    }}
                                >
                                    {/* Checkbox */}
                                    <div style={{
                                        width: '22px',
                                        height: '22px',
                                        borderRadius: '4px',
                                        border: `2px solid ${isSelected || isAlreadyAssociated ? '#4caf50' : '#666'}`,
                                        background: isSelected || isAlreadyAssociated ? '#4caf50' : 'transparent',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#1a1a1a',
                                        fontSize: '14px',
                                        fontWeight: 'bold',
                                        flexShrink: 0
                                    }}>
                                        {(isSelected || isAlreadyAssociated) && '✓'}
                                    </div>

                                    {/* Activity Info */}
                                    <div style={{ flex: 1 }}>
                                        <div style={{
                                            fontWeight: 'bold',
                                            fontSize: '14px',
                                            color: isSelected || isAlreadyAssociated ? '#4caf50' : '#ccc',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}>
                                            {activity.name}
                                            {isAlreadyAssociated && (
                                                <span style={{ fontSize: '11px', color: '#666', fontWeight: 'normal' }}>
                                                    (Already associated)
                                                </span>
                                            )}
                                        </div>
                                        {activity.description && (
                                            <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                                                {activity.description}
                                            </div>
                                        )}
                                        {hasMetrics && (
                                            <div style={{
                                                fontSize: '11px',
                                                color: '#555',
                                                marginTop: '4px',
                                                display: 'flex',
                                                gap: '8px',
                                                flexWrap: 'wrap'
                                            }}>
                                                {activity.metrics.map((m, idx) => (
                                                    <span key={idx} style={{
                                                        background: '#2a2a2a',
                                                        padding: '2px 6px',
                                                        borderRadius: '3px'
                                                    }}>
                                                        {m.name} ({m.unit})
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )
                }

                {/* Actions Footer */}
                <div style={{
                    display: 'flex',
                    gap: '10px',
                    justifyContent: 'flex-end',
                    paddingTop: '12px',
                    borderTop: '1px solid #333'
                }}>
                    <button
                        onClick={handleCancelActivitySelector}
                        style={{
                            padding: '10px 20px',
                            background: 'transparent',
                            border: '1px solid #666',
                            color: '#ccc',
                            borderRadius: '6px',
                            cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirmActivitySelection}
                        disabled={tempSelectedActivities.length === 0}
                        style={{
                            padding: '10px 20px',
                            background: tempSelectedActivities.length === 0 ? '#444' : '#4caf50',
                            border: 'none',
                            borderRadius: '6px',
                            color: tempSelectedActivities.length === 0 ? '#888' : 'white',
                            fontWeight: 'bold',
                            cursor: tempSelectedActivities.length === 0 ? 'not-allowed' : 'pointer'
                        }}
                    >
                        Add Selected ({tempSelectedActivities.length})
                    </button>
                </div>

                {/* Currently Associated Activities - shown at the bottom */}
                {associatedActivities.length > 0 && (
                    <div style={{ marginTop: '16px' }}>
                        <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '8px' }}>
                            Currently Associated ({associatedActivities.length}):
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {associatedActivities.map(activity => (
                                <div
                                    key={activity.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '4px 10px',
                                        background: '#2a3a2a',
                                        border: '1px solid #4caf50',
                                        borderRadius: '12px',
                                        fontSize: '12px',
                                        color: '#4caf50'
                                    }}
                                >
                                    <span>{activity.name}</span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveActivity(activity.id);
                                        }}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: '#888',
                                            fontSize: '14px',
                                            cursor: 'pointer',
                                            padding: '0',
                                            lineHeight: 1,
                                            display: 'flex',
                                            alignItems: 'center'
                                        }}
                                        title="Remove association"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div >
        );
    };

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

                        {/* Targets Section - Edit Mode (Only show creation, otherwise handled in View mode) */}
                        {mode === 'create' && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <label style={{ fontSize: '12px', color: '#aaa' }}>Targets:</label>
                                    {activitiesForTargets.length > 0 && (
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
                                            {activitiesForTargets.length === 0
                                                ? (associatedActivities.length === 0
                                                    ? 'Associate activities first to set targets'
                                                    : 'No associated activities have metrics')
                                                : 'No targets defined'}
                                        </div>
                                    ) : (
                                        targets.map(target => (
                                            <TargetCard
                                                key={target.id}
                                                target={target}
                                                activityDefinitions={activityDefinitions}
                                                onEdit={() => handleOpenEditTarget(target)}
                                                onDelete={() => confirmAndDeleteTarget(target.id)}
                                                isCompleted={false}
                                                isEditMode={true}
                                            />
                                        ))
                                    )}
                                </div>
                            </div>
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
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#aaa' }}>
                                Description:
                            </label>
                            <div style={{ fontSize: '13px', color: '#ccc', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                                {goal.attributes?.description || goal.description ||
                                    <span style={{ fontStyle: 'italic', color: '#666' }}>No description</span>}
                            </div>
                        </div>

                        {/* Relevance Statement - View Mode */}
                        {parentGoalName && (goal.attributes?.relevance_statement || relevanceStatement) && (
                            <div>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#aaa' }}>
                                    How does this goal help you achieve <span style={{ color: parentGoalColor || '#fff', fontWeight: 'bold' }}>{parentGoalName}</span><span style={{ color: parentGoalColor || '#fff', fontWeight: 'bold' }}>?</span>
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
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <label style={{ fontSize: '12px', color: '#aaa' }}>
                                        Associated Activities ({isLoadingActivities ? '...' : associatedActivities.length})
                                    </label>
                                    <button
                                        onClick={handleOpenActivitySelector}
                                        style={{
                                            background: 'transparent',
                                            border: '1px solid #4caf50',
                                            color: '#4caf50',
                                            fontSize: '12px',
                                            padding: '4px 10px',
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        + Add
                                    </button>
                                </div>
                                {associatedActivities.length === 0 ? (
                                    <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                                        No activities associated
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {associatedActivities.slice(0, 10).map(activity => {
                                            const isUsed = targets.some(t => {
                                                // ID Match
                                                if (String(t.activity_id) === String(activity.id)) return true;

                                                // Name Match (Normalization Helper)
                                                const normalize = s => s ? String(s).trim().toLowerCase() : '';
                                                const activityName = normalize(activity.name);

                                                // Check via Activity Definition
                                                const targetActivityDef = activityDefinitions.find(ad => ad.id === t.activity_id);
                                                if (targetActivityDef && normalize(targetActivityDef.name) === activityName) return true;

                                                // Check target name override
                                                if (t.name && normalize(t.name) === activityName) return true;

                                                return false;
                                            });

                                            return (
                                                <div
                                                    key={activity.id}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        padding: '4px 10px',
                                                        background: '#2a3a2a',
                                                        border: '1px solid #4caf50',
                                                        borderRadius: '12px',
                                                        fontSize: '12px',
                                                        color: '#4caf50'
                                                    }}
                                                >
                                                    <span>{activity.name}</span>
                                                    {!isUsed && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleRemoveActivity(activity.id);
                                                            }}
                                                            style={{
                                                                background: 'none',
                                                                border: 'none',
                                                                color: '#888',
                                                                fontSize: '14px',
                                                                cursor: 'pointer',
                                                                padding: '0',
                                                                lineHeight: 1,
                                                                display: 'flex',
                                                                alignItems: 'center'
                                                            }}
                                                            title="Remove association"
                                                        >
                                                            ×
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {associatedActivities.length > 10 && (
                                            <button
                                                onClick={handleOpenActivitySelector}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: '#4caf50',
                                                    fontSize: '12px',
                                                    cursor: 'pointer',
                                                    padding: '4px 6px',
                                                    textDecoration: 'underline'
                                                }}
                                            >
                                                and {associatedActivities.length - 10} more
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Targets Section - View Mode */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <label style={{ fontSize: '12px', color: '#aaa' }}>
                                    Targets ({targets.length}):
                                </label>
                                {activitiesForTargets.length > 0 && (
                                    <button
                                        onClick={handleOpenAddTarget}
                                        style={{
                                            background: 'transparent',
                                            border: '1px solid #4caf50',
                                            color: '#4caf50',
                                            fontSize: '12px',
                                            padding: '4px 10px',
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
                                            onDelete={() => confirmAndDeleteTarget(target.id)}
                                            onClick={() => handleOpenEditTarget(target)}
                                        />
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Sessions - For ShortTermGoals */}
                        {isShortTermGoal && (
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#aaa' }}>
                                    Sessions ({childSessions.length}):
                                </label>
                                {childSessions.length === 0 ? (
                                    <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                                        No sessions yet
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {childSessions.slice(0, 5).map(session => (
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
                                        {childSessions.length > 5 && (
                                            <div style={{ fontSize: '12px', color: '#888', fontStyle: 'italic', paddingLeft: '4px' }}>
                                                ... and {childSessions.length - 5} more
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Associated Sessions - For ImmediateGoals */}
                        {isImmediateGoal && (
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#aaa' }}>
                                    Associated Sessions ({associatedSessions.length}):
                                </label>
                                {associatedSessions.length === 0 ? (
                                    <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                                        No associated sessions yet
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {associatedSessions.slice(0, 5).map(session => (
                                            <div
                                                key={session.id}
                                                onClick={() => {
                                                    if (displayMode === 'modal' && onClose) onClose();
                                                    navigate(`/${rootId}/session/${session.id}`);
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
                                                <span style={{ color: 'white' }}>{session.name}</span>
                                                {session.attributes?.created_at && (
                                                    <span style={{ fontSize: '11px', color: '#888' }}>
                                                        {new Date(session.attributes.created_at).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                        {associatedSessions.length > 5 && (
                                            <div style={{ fontSize: '12px', color: '#888', fontStyle: 'italic', paddingLeft: '4px' }}>
                                                ... and {associatedSessions.length - 5} more
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                )}
            </>
        );
    };

    // ============ DETERMINE WHICH CONTENT TO RENDER ============
    let content;
    if (viewState === 'target-add' || viewState === 'target-edit') {
        content = renderTargetBuilder();
    } else if (viewState === 'activity-selector') {
        content = renderActivitySelector();
    } else if (viewState === 'complete-confirm') {
        content = renderCompletionConfirm();
    } else if (viewState === 'uncomplete-confirm') {
        content = renderUncompletionConfirm();
    } else {
        content = renderGoalContent();
    }

    // ============ RENDER ============
    const confirmModalComponent = (
        <ConfirmationModal
            isOpen={!!targetToDelete}
            onClose={() => {
                setTargetToDelete(null);
                setDeleteTargetCallback(null);
            }}
            onConfirm={handleFinalizeDeleteTarget}
            title="Delete Target"
            message="Are you sure you want to delete this target? This action cannot be undone."
            confirmText="Delete"
            cancelText="Cancel"
        />
    );

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
                {confirmModalComponent}
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
            {confirmModalComponent}
        </>
    );
}

export default GoalDetailModal;
