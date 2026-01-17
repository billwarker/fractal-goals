import React, { useState } from 'react';
import TargetCard from '../TargetCard';

/**
 * TargetManager Component
 * 
 * Manages the list of targets for a goal, including adding, editing, and deleting targets.
 * Contains the inline "Target Builder" UI.
 */
const TargetManager = ({
    targets,
    setTargets,
    activityDefinitions,
    associatedActivities,
    isEditing,
    mode,
    onSave, // Callback to persist changes if needed (e.g. immediate save in view mode)
    // New props for full view mode
    viewMode = 'list', // 'list' | 'builder'
    onOpenBuilder, // (target?) => void
    onCloseBuilder,
    initialTarget = null // Target to edit if opening in builder mode
}) => {
    // Internal view state: 'list' | 'add' | 'edit' (still used for internal builder state)
    // BUT we prioritize props if provided for view switching
    const [viewState, setViewState] = useState(initialTarget ? 'edit' : 'list');
    const [editingTarget, setEditingTarget] = useState(initialTarget);
    const [targetToDelete, setTargetToDelete] = useState(null);
    const [deleteTargetCallback, setDeleteTargetCallback] = useState(null);

    // Form State
    const [selectedActivityId, setSelectedActivityId] = useState(initialTarget?.activity_id || '');
    const [targetName, setTargetName] = useState(initialTarget?.name || '');
    const [targetDescription, setTargetDescription] = useState(initialTarget?.description || '');

    // Initialize metrics
    const [metricValues, setMetricValues] = useState(() => {
        const metricsObj = {};
        if (initialTarget?.metrics) {
            initialTarget.metrics.forEach(m => {
                metricsObj[m.metric_id] = m.value;
            });
        }
        return metricsObj;
    });

    // Filter activities: only those that are associated AND have metrics
    const associatedActivityIds = associatedActivities.map(a => a.id);
    const activitiesWithMetrics = activityDefinitions.filter(a =>
        a.has_metrics && a.metric_definitions && a.metric_definitions.length > 0
    );
    const activitiesForTargets = activitiesWithMetrics.filter(a =>
        associatedActivityIds.includes(a.id)
    );
    const selectedActivity = activityDefinitions.find(a => a.id === selectedActivityId);

    // Handlers
    const handleOpenAddTarget = () => {
        setEditingTarget(null);
        setSelectedActivityId('');
        setTargetName('');
        setTargetDescription('');
        setMetricValues({});
        setViewState('add');
        if (onOpenBuilder) onOpenBuilder(null);
    };

    const handleOpenEditTarget = (target) => {
        setEditingTarget(target);
        setSelectedActivityId(target.activity_id || '');
        setTargetName(target.name || '');
        setTargetDescription(target.description || '');

        const metricsObj = {};
        if (target.metrics) {
            target.metrics.forEach(m => {
                metricsObj[m.metric_id] = m.value;
            });
        }
        setMetricValues(metricsObj);
        setViewState('edit');
        if (onOpenBuilder) onOpenBuilder(target);
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
        if (onSave) onSave(newTargets);

        setViewState('list');
        setEditingTarget(null);
        if (onCloseBuilder) onCloseBuilder();
    };

    const handleDeleteTarget = (targetId) => {
        const newTargets = targets.filter(t => t.id !== targetId);
        setTargets(newTargets);
        if (onSave) onSave(newTargets);
    };

    const confirmAndDeleteTarget = (targetId) => {
        // In this simplified version, we can just use window.confirm or a local state 
        // effectively similar to the parent, but for now lets keep it simple inside the builder view
        // logic or just call delete if we are in the edit view.
        // The original code had a confirmation step.
        // Let's implement immediate delete for the edit view since user is deliberately there.
        handleDeleteTarget(targetId);
        setViewState('list');
        setEditingTarget(null);
        if (onCloseBuilder) onCloseBuilder();
    };

    const handleCancel = () => {
        setViewState('list');
        setEditingTarget(null);
        if (onCloseBuilder) onCloseBuilder();
    };

    // Determine current view mode
    // If viewMode prop is 'builder', we force render the builder
    // Otherwise fallback to internal state (though internal state should arguably be removed if fully controlled)
    const shouldRenderBuilder = viewMode === 'builder' || viewState === 'add' || viewState === 'edit';

    // Ensure we have the correct title if strictly in builder mode but local state was default
    const getBuilderTitle = () => {
        if (viewState === 'edit' || initialTarget) return 'Edit Target';
        return 'Add Target';
    };

    // Render Logic
    if (shouldRenderBuilder) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: '#252525', padding: '16px', borderRadius: '8px', border: '1px solid #444' }}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    paddingBottom: '12px',
                    borderBottom: '1px solid #444'
                }}>
                    <button
                        onClick={handleCancel}
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
                        {getBuilderTitle()}
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
                            background: '#1e1e1e',
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
                            background: '#1e1e1e',
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
                                    background: '#1e1e1e',
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
                                                background: '#2a2a2a',
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
                    {(viewState === 'edit' || initialTarget) && editingTarget ? (
                        <button
                            onClick={() => confirmAndDeleteTarget(editingTarget.id)}
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
                            {(viewState === 'edit' || initialTarget) ? 'Update Target' : 'Add Target'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Default List View
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ display: 'block', margin: 0, fontSize: '12px', color: '#aaa' }}>
                    Measurable Targets ({targets.length})
                </label>
                {isEditing && (
                    <button
                        onClick={handleOpenAddTarget}
                        style={{
                            background: '#2a2a2a',
                            border: '1px solid #444',
                            borderRadius: '4px',
                            color: '#ccc',
                            cursor: 'pointer',
                            fontSize: '12px',
                            padding: '2px 6px'
                        }}
                    >
                        + Add Target
                    </button>
                )}
            </div>

            {targets.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#666', fontStyle: 'italic' }}>
                    No targets set.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {targets.map((target, index) => (
                        <div key={target.id || index} style={{ position: 'relative' }}>
                            <TargetCard
                                target={target}
                                activityDefinitions={activityDefinitions}
                                onEdit={isEditing ? () => handleOpenEditTarget(target) : undefined}
                                onDelete={isEditing ? () => handleDeleteTarget(target.id) : undefined}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TargetManager;
