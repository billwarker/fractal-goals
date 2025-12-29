import React, { useState, useEffect } from 'react';
import { fractalApi } from '../utils/api';

/**
 * ActivitiesManager - Modal component to manage Activity Definitions and Metrics
 */
function ActivitiesManager({ rootId, onClose }) {
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [creating, setCreating] = useState(false);
    const [deletingId, setDeletingId] = useState(null);

    // Form State
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [metrics, setMetrics] = useState([{ name: '', unit: '' }]);
    const [hasSets, setHasSets] = useState(false);
    const [hasMetrics, setHasMetrics] = useState(true);
    const [metricsMultiplicative, setMetricsMultiplicative] = useState(false);

    useEffect(() => {
        fetchActivities();
    }, [rootId]);

    const fetchActivities = async () => {
        try {
            setLoading(true);
            const res = await fractalApi.getActivities(rootId);
            setActivities(res.data);
            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch activities", err);
            setError("Failed to load activities");
            setLoading(false);
        }
    };

    const handleAddMetric = () => {
        if (metrics.length < 3) {
            setMetrics([...metrics, { name: '', unit: '' }]);
        }
    };

    const handleRemoveMetric = (index) => {
        const newMetrics = [...metrics];
        newMetrics.splice(index, 1);
        setMetrics(newMetrics);
    };

    const handleMetricChange = (index, field, value) => {
        const newMetrics = [...metrics];
        newMetrics[index] = { ...newMetrics[index], [field]: value };
        setMetrics(newMetrics);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setCreating(true);

            // Filter out empty metrics
            const validMetrics = metrics.filter(m => m.name.trim() !== '');

            await fractalApi.createActivity(rootId, {
                name,
                description,
                metrics: hasMetrics ? validMetrics : [],
                has_sets: hasSets,
                has_metrics: hasMetrics,
                metrics_multiplicative: metricsMultiplicative
            });

            // Reset form
            setName('');
            setDescription('');
            setMetrics([{ name: '', unit: '' }]);
            setHasSets(false);
            setHasMetrics(true);
            setMetricsMultiplicative(false);

            // Refresh list
            fetchActivities();
            setCreating(false);
        } catch (err) {
            console.error("Failed to create activity", err);
            setError("Failed to create activity");
            setCreating(false);
        }
    };

    const handleDeleteClick = (activityId) => {
        setDeletingId(activityId);
    };

    const handleConfirmDelete = async (activityId) => {
        try {
            await fractalApi.deleteActivity(rootId, activityId);
            setDeletingId(null);
            fetchActivities();
        } catch (err) {
            console.error("Failed to delete activity", err);
            setError("Failed to delete activity");
            setDeletingId(null);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
        }}>
            <div style={{
                background: '#1e1e1e',
                border: '1px solid #333',
                borderRadius: '8px',
                width: '600px',
                maxWidth: '90vw',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px',
                    borderBottom: '1px solid #333',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h2 style={{ margin: 0, fontSize: '18px', color: 'white' }}>Manage Activities</h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#888',
                            fontSize: '20px',
                            cursor: 'pointer'
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Content */}
                <div style={{
                    padding: '20px',
                    overflowY: 'auto',
                    flex: 1
                }}>
                    {error && (
                        <div style={{ padding: '10px', background: 'rgba(255,0,0,0.1)', color: '#f44336', marginBottom: '20px', borderRadius: '4px' }}>
                            {error}
                        </div>
                    )}

                    {/* List Existing */}
                    <div style={{ marginBottom: '30px' }}>
                        <h3 style={{ fontSize: '14px', color: '#888', textTransform: 'uppercase', marginBottom: '15px' }}>Existing Activities</h3>
                        {loading ? (
                            <div>Loading...</div>
                        ) : activities.length === 0 ? (
                            <div style={{ color: '#666', fontStyle: 'italic' }}>No activities defined yet.</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {activities.map(activity => (
                                    <div key={activity.id} style={{
                                        background: '#252525',
                                        padding: '12px',
                                        borderRadius: '6px',
                                        border: '1px solid #333',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 600, color: 'white' }}>{activity.name}</div>
                                            {activity.description && <div style={{ fontSize: '12px', color: '#888' }}>{activity.description}</div>}
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '6px', alignItems: 'center' }}>
                                                {/* Indicators */}
                                                {activity.has_sets && (
                                                    <span style={{ fontSize: '11px', background: '#333', color: '#ff9800', padding: '2px 6px', borderRadius: '3px', border: '1px solid #444' }}>
                                                        Sets
                                                    </span>
                                                )}
                                                {!activity.has_metrics && (
                                                    <span style={{ fontSize: '11px', background: '#333', color: '#888', padding: '2px 6px', borderRadius: '3px', border: '1px solid #444' }}>
                                                        No Metrics
                                                    </span>
                                                )}
                                                {activity.metrics_multiplicative && (
                                                    <span style={{ fontSize: '11px', background: '#333', color: '#e91e63', padding: '2px 6px', borderRadius: '3px', border: '1px solid #444' }}>
                                                        A × B × C
                                                    </span>
                                                )}

                                                {activity.metric_definitions?.map(m => (
                                                    <span key={m.id} style={{
                                                        fontSize: '11px',
                                                        background: '#1a1a1a',
                                                        padding: '2px 6px',
                                                        borderRadius: '3px',
                                                        color: '#4caf50',
                                                        border: '1px solid #333'
                                                    }}>
                                                        {m.name} ({m.unit})
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        {deletingId === activity.id ? (
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button
                                                    onClick={() => handleConfirmDelete(activity.id)}
                                                    style={{ background: '#f44336', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer' }}
                                                >
                                                    Confirm
                                                </button>
                                                <button
                                                    onClick={() => setDeletingId(null)}
                                                    style={{ background: '#444', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer' }}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => handleDeleteClick(activity.id)}
                                                style={{ color: '#f44336', background: 'transparent', border: 'none', cursor: 'pointer', padding: '5px' }}
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Create New Form */}
                    <div style={{
                        background: '#252525',
                        padding: '16px',
                        borderRadius: '8px',
                        border: '1px solid #333'
                    }}>
                        <h3 style={{ fontSize: '14px', color: 'white', marginBottom: '15px', marginTop: 0 }}>Create New Activity</h3>
                        <form onSubmit={handleSubmit}>
                            <div style={{ display: 'grid', gap: '15px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '5px' }}>Activity Name</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder="e.g. Scale Practice"
                                        style={{ width: '100%', padding: '8px', background: '#1e1e1e', border: '1px solid #444', color: 'white', borderRadius: '4px' }}
                                        required
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '5px' }}>Description</label>
                                    <input
                                        type="text"
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        placeholder="Optional description"
                                        style={{ width: '100%', padding: '8px', background: '#1e1e1e', border: '1px solid #444', color: 'white', borderRadius: '4px' }}
                                    />
                                </div>

                                {/* Flags */}
                                <div style={{ display: 'flex', gap: '20px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#ccc', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={hasSets}
                                            onChange={e => setHasSets(e.target.checked)}
                                        />
                                        Track Sets
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#ccc', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={hasMetrics}
                                            onChange={e => setHasMetrics(e.target.checked)}
                                        />
                                        Enable Metrics
                                    </label>
                                </div>

                                {/* Metrics Section - Conditional */}
                                {hasMetrics && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '5px' }}>Metrics (Max 3)</label>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {metrics.map((metric, idx) => (
                                                <div key={idx} style={{ display: 'flex', gap: '8px' }}>
                                                    <input
                                                        type="text"
                                                        value={metric.name}
                                                        onChange={e => handleMetricChange(idx, 'name', e.target.value)}
                                                        placeholder="Metric Name (e.g. Speed)"
                                                        style={{ flex: 1, padding: '8px', background: '#1e1e1e', border: '1px solid #444', color: 'white', borderRadius: '4px' }}
                                                    />
                                                    <input
                                                        type="text"
                                                        value={metric.unit}
                                                        onChange={e => handleMetricChange(idx, 'unit', e.target.value)}
                                                        placeholder="Unit (e.g. bpm)"
                                                        style={{ width: '80px', padding: '8px', background: '#1e1e1e', border: '1px solid #444', color: 'white', borderRadius: '4px' }}
                                                    />
                                                    {metrics.length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveMetric(idx)}
                                                            style={{ background: '#333', border: 'none', color: '#888', cursor: 'pointer', borderRadius: '4px', width: '30px' }}
                                                        >
                                                            ×
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                            {metrics.length < 3 && (
                                                <button
                                                    type="button"
                                                    onClick={handleAddMetric}
                                                    style={{ padding: '6px', background: '#333', border: '1px dashed #555', color: '#aaa', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                                                >
                                                    + Add Metric
                                                </button>
                                            )}
                                        </div>

                                        {/* Multiplicative Metrics Checkbox - only show when 2+ metrics */}
                                        {metrics.filter(m => m.name.trim() !== '').length > 1 && (
                                            <label style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                fontSize: '13px',
                                                color: '#e91e63',
                                                cursor: 'pointer',
                                                marginTop: '10px',
                                                padding: '8px',
                                                background: 'rgba(233, 30, 99, 0.1)',
                                                borderRadius: '4px',
                                                border: '1px solid rgba(233, 30, 99, 0.3)'
                                            }}>
                                                <input
                                                    type="checkbox"
                                                    checked={metricsMultiplicative}
                                                    onChange={e => setMetricsMultiplicative(e.target.checked)}
                                                />
                                                Metrics are multiplicative (enables A × B × C derived metric on analytics)
                                            </label>
                                        )}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={creating}
                                    style={{
                                        marginTop: '10px',
                                        padding: '10px',
                                        background: '#4caf50',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontWeight: 600
                                    }}
                                >
                                    {creating ? 'Creating...' : 'Create Activity'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div >
    );
}

export default ActivitiesManager;
