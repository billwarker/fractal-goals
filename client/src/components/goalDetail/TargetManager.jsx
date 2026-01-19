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
    initialTarget = null, // Target to edit if opening in builder mode
    headerColor // New prop for header color
}) => {
    // Internal view state: 'list' | 'add' | 'edit' (still used for internal builder state)
    // BUT we prioritize props if provided for view switching
    const [viewState, setViewState] = useState(initialTarget ? 'edit' : 'list');
    const [editingTarget, setEditingTarget] = useState(initialTarget);
    const [targetToDelete, setTargetToDelete] = useState(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Form State

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
        // If parent controls view (onOpenBuilder provided), only call parent
        // Otherwise use internal state
        if (onOpenBuilder) {
            onOpenBuilder(null);
        } else {
            setViewState('add');
        }
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
        // If parent controls view (onOpenBuilder provided), only call parent
        // Otherwise use internal state
        if (onOpenBuilder) {
            onOpenBuilder(target);
        } else {
            setViewState('edit');
        }
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
        setTargetToDelete(targetId);
        setShowDeleteConfirm(true);
    };

    const executeDeleteTarget = () => {
        if (targetToDelete) {
            handleDeleteTarget(targetToDelete);
            setViewState('list');
            setEditingTarget(null);
            setTargetToDelete(null);
            setShowDeleteConfirm(false);
            if (onCloseBuilder) onCloseBuilder();
        }
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
        // When viewMode='builder' (rendered as full modal view), skip the container styling
        // When triggered by internal state (add/edit), we're embedded so keep container styling
        const containerStyle = viewMode === 'builder'
            ? { display: 'flex', flexDirection: 'column', gap: '14px' }  // Full view - no container box
            : { display: 'flex', flexDirection: 'column', gap: '14px', background: '#252525', padding: '16px', borderRadius: '8px', border: '1px solid #444' };  // Embedded - has container

        return (
            <div style={containerStyle}>
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

    // Confirmation Modal Render
    const renderDeleteConfirm = () => {
        if (!showDeleteConfirm) return null;
        return (
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.7)', zIndex: 1002,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
                <div style={{
                    background: '#252525', padding: '24px', borderRadius: '12px',
                    width: '90%', maxWidth: '400px', border: '1px solid #444',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: 'white' }}>Delete Target?</h3>
                    <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#ccc', lineHeight: '1.5' }}>
                        Are you sure you want to delete this target? This action cannot be undone.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <button
                            onClick={() => {
                                setShowDeleteConfirm(false);
                                setTargetToDelete(null);
                            }}
                            style={{
                                padding: '8px 16px', background: 'transparent',
                                border: '1px solid #555', borderRadius: '6px',
                                color: '#ccc', cursor: 'pointer', fontSize: '13px'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={executeDeleteTarget}
                            style={{
                                padding: '8px 16px', background: '#d32f2f',
                                border: 'none', borderRadius: '6px',
                                color: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '600'
                            }}
                        >
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // Default List View
    const canAddTargets = activitiesForTargets.length > 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {renderDeleteConfirm()}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ display: 'block', margin: 0, fontSize: '12px', color: headerColor || '#aaa', fontWeight: 'bold' }}>
                    Targets ({targets.length})
                </label>
                {isEditing && (
                    <button
                        onClick={canAddTargets ? handleOpenAddTarget : undefined}
                        disabled={!canAddTargets}
                        style={{
                            background: canAddTargets ? '#2a2a2a' : '#1a1a1a',
                            border: `1px solid ${canAddTargets ? '#444' : '#333'}`,
                            borderRadius: '4px',
                            color: canAddTargets ? '#ccc' : '#555',
                            cursor: canAddTargets ? 'pointer' : 'not-allowed',
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
                    {canAddTargets
                        ? 'No targets set.'
                        : 'Associate an activity with metrics to create a target.'}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {targets.map((target, index) => (
                        <div key={target.id || index} style={{ position: 'relative' }}>
                            <div onClick={() => isEditing && handleOpenEditTarget(target)} style={{ cursor: isEditing ? 'pointer' : 'default' }}>
                                <TargetCard
                                    target={target}
                                    activityDefinitions={activityDefinitions}
                                    onEdit={undefined} // Handled by parent div click
                                    onDelete={isEditing ? (e) => {
                                        e.stopPropagation(); // Prevent opening edit mode
                                        confirmAndDeleteTarget(target.id);
                                    } : undefined}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TargetManager;
