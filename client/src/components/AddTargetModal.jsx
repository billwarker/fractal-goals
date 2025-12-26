import React, { useState, useEffect } from 'react';

/**
 * AddTargetModal Component
 * Modal for creating or editing activity targets
 */
function AddTargetModal({ isOpen, onClose, onSave, activityDefinitions, existingTarget = null }) {
    const [selectedActivityId, setSelectedActivityId] = useState('');
    const [targetName, setTargetName] = useState('');
    const [targetDescription, setTargetDescription] = useState('');
    const [metricValues, setMetricValues] = useState({});

    // Initialize form when modal opens or existing target changes
    useEffect(() => {
        if (existingTarget) {
            setSelectedActivityId(existingTarget.activity_id || '');
            setTargetName(existingTarget.name || '');
            setTargetDescription(existingTarget.description || '');

            // Convert metrics array to object for easier editing
            const metricsObj = {};
            existingTarget.metrics?.forEach(m => {
                metricsObj[m.metric_id] = m.value;
            });
            setMetricValues(metricsObj);
        } else {
            // Reset form for new target
            setSelectedActivityId('');
            setTargetName('');
            setTargetDescription('');
            setMetricValues({});
        }
    }, [existingTarget, isOpen]);

    const selectedActivity = activityDefinitions.find(a => a.id === selectedActivityId);

    const handleActivityChange = (activityId) => {
        setSelectedActivityId(activityId);
        setMetricValues({}); // Reset metric values when activity changes

        // Auto-fill name with activity name if empty
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

    const handleSave = () => {
        if (!selectedActivityId) {
            alert('Please select an activity');
            return;
        }

        // Convert metric values object to array
        const metrics = Object.entries(metricValues).map(([metric_id, value]) => ({
            metric_id,
            value: parseFloat(value) || 0
        }));

        const target = {
            id: existingTarget?.id || crypto.randomUUID(),
            activity_id: selectedActivityId,
            name: targetName || selectedActivity?.name || 'Unnamed Target',
            description: targetDescription,
            metrics
        };

        onSave(target);
        onClose();
    };

    if (!isOpen) return null;

    // Filter to only activities with metrics
    const activitiesWithMetrics = activityDefinitions.filter(a =>
        a.has_metrics && a.metric_definitions && a.metric_definitions.length > 0
    );

    return (
        <div style={{
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
        }}>
            <div style={{
                background: '#1e1e1e',
                border: '1px solid #444',
                borderRadius: '8px',
                padding: '24px',
                maxWidth: '500px',
                width: '90%',
                maxHeight: '80vh',
                overflowY: 'auto'
            }}>
                <h2 style={{ margin: '0 0 20px 0', fontSize: '20px' }}>
                    {existingTarget ? 'Edit Target' : 'Add Target'}
                </h2>

                {/* Activity Selector */}
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#aaa' }}>
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
                            fontSize: '14px'
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
                        <div style={{ fontSize: '12px', color: '#f44336', marginTop: '4px' }}>
                            No activities with metrics found. Create one first.
                        </div>
                    )}
                </div>

                {/* Target Name */}
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#aaa' }}>
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
                            fontSize: '14px'
                        }}
                    />
                </div>

                {/* Target Description */}
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#aaa' }}>
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
                            fontSize: '14px',
                            resize: 'vertical'
                        }}
                    />
                </div>

                {/* Metric Values */}
                {selectedActivity && selectedActivity.metric_definitions && (
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '10px', fontSize: '13px', color: '#aaa' }}>
                            Target Values *
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {selectedActivity.metric_definitions.map(metric => (
                                <div key={metric.id} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    background: '#2a2a2a',
                                    padding: '10px',
                                    borderRadius: '4px'
                                }}>
                                    <label style={{ flex: 1, fontSize: '14px' }}>
                                        {metric.name}
                                    </label>
                                    <input
                                        type="number"
                                        value={metricValues[metric.id] || ''}
                                        onChange={(e) => handleMetricChange(metric.id, e.target.value)}
                                        placeholder="0"
                                        step="any"
                                        style={{
                                            width: '100px',
                                            padding: '6px',
                                            background: '#333',
                                            border: '1px solid #555',
                                            borderRadius: '3px',
                                            color: 'white',
                                            fontSize: '14px'
                                        }}
                                    />
                                    <span style={{ fontSize: '13px', color: '#888', minWidth: '40px' }}>
                                        {metric.unit}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px 16px',
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
                        onClick={handleSave}
                        disabled={!selectedActivityId}
                        style={{
                            padding: '8px 16px',
                            background: selectedActivityId ? '#4caf50' : '#333',
                            border: 'none',
                            borderRadius: '4px',
                            color: selectedActivityId ? 'white' : '#666',
                            cursor: selectedActivityId ? 'pointer' : 'not-allowed',
                            fontSize: '14px',
                            fontWeight: 600
                        }}
                    >
                        {existingTarget ? 'Update Target' : 'Add Target'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default AddTargetModal;
