import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useActivities } from '../contexts/ActivitiesContext';
import { useActivities } from '../contexts/ActivitiesContext';
import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import '../App.css';

/**
 * Manage Activities Page - Create and manage activity definitions
 */
function ManageActivities() {
    const { rootId } = useParams();
    const navigate = useNavigate();
    const { activities, fetchActivities, createActivity, updateActivity, deleteActivity, loading, error: contextError } = useActivities();

    const [error, setError] = useState(null);
    const [creating, setCreating] = useState(false);
    const [activityToDelete, setActivityToDelete] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [pendingSubmission, setPendingSubmission] = useState(null);
    const [showMetricWarning, setShowMetricWarning] = useState(false);
    const [metricWarningMessage, setMetricWarningMessage] = useState('');

    // Form State
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [metrics, setMetrics] = useState([{ name: '', unit: '', is_top_set_metric: false, is_multiplicative: true }]);
    const [hasSets, setHasSets] = useState(false);
    const [hasMetrics, setHasMetrics] = useState(true);
    const [metricsMultiplicative, setMetricsMultiplicative] = useState(false);

    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        fetchActivities(rootId);
    }, [rootId, navigate, fetchActivities]);

    const handleAddMetric = () => {
        if (metrics.length < 3) {
            setMetrics([...metrics, { name: '', unit: '', is_top_set_metric: false, is_multiplicative: true }]);
        }
    };

    const handleRemoveMetric = (index) => {
        const newMetrics = [...metrics];
        newMetrics.splice(index, 1);
        setMetrics(newMetrics);
    };

    const handleMetricChange = (index, field, value) => {
        const newMetrics = [...metrics];

        // If setting is_top_set_metric to true, unset it for all other metrics
        if (field === 'is_top_set_metric' && value === true) {
            newMetrics.forEach((m, i) => {
                if (i !== index) {
                    m.is_top_set_metric = false;
                }
            });
        }

        newMetrics[index] = { ...newMetrics[index], [field]: value };
        setMetrics(newMetrics);
    };

    const handleLoadActivity = (activity) => {
        setEditingId(activity.id);
        setName(activity.name);
        setDescription(activity.description || '');
        setHasSets(activity.has_sets);
        setMetricsMultiplicative(activity.metrics_multiplicative || false);

        // Set hasMetrics based on whether metrics actually exist
        const hasMetricDefinitions = activity.metric_definitions && activity.metric_definitions.length > 0;
        setHasMetrics(hasMetricDefinitions || activity.has_metrics);

        // Load metrics
        if (activity.metric_definitions && activity.metric_definitions.length > 0) {
            setMetrics(activity.metric_definitions.map(m => ({
                id: m.id,  // Preserve the id for updates
                name: m.name,
                unit: m.unit,
                is_top_set_metric: m.is_top_set_metric || false,
                is_multiplicative: m.is_multiplicative !== undefined ? m.is_multiplicative : true
            })));
        } else {
            setMetrics([{ name: '', unit: '', is_top_set_metric: false, is_multiplicative: true }]);
        }
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setName('');
        setDescription('');
        setMetrics([{ name: '', unit: '', is_top_set_metric: false, is_multiplicative: true }]);
        setHasSets(false);
        setHasMetrics(true);
        setMetricsMultiplicative(false);
    };

    const processSubmission = async (overrideData = null) => {
        try {
            setCreating(true);
            const dataToSubmit = overrideData || {
                name,
                description,
                metrics: hasMetrics ? metrics.filter(m => m.name.trim() !== '') : [],
                has_sets: hasSets,
                has_metrics: hasMetrics,
                metrics_multiplicative: metricsMultiplicative
            };

            if (editingId) {
                await updateActivity(rootId, editingId, dataToSubmit);
            } else {
                await createActivity(rootId, dataToSubmit);
            }

            // Reset form
            setEditingId(null);
            setName('');
            setDescription('');
            setMetrics([{ name: '', unit: '', is_top_set_metric: false, is_multiplicative: true }]);
            setHasSets(false);
            setHasMetrics(true);
            setMetricsMultiplicative(false);
            setCreating(false);
            setPendingSubmission(null);
            setShowMetricWarning(false);
        } catch (err) {
            console.error(editingId ? "Failed to update activity" : "Failed to create activity", err);
            setError(editingId ? "Failed to update activity" : "Failed to create activity");
            setCreating(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Filter out empty metrics
        const validMetrics = metrics.filter(m => m.name.trim() !== '');

        if (editingId) {
            // Check if metrics are being removed
            const originalActivity = activities.find(a => a.id === editingId);
            if (originalActivity && originalActivity.metric_definitions) {
                const removedMetrics = originalActivity.metric_definitions.filter(
                    oldMetric => !validMetrics.find(
                        newMetric => newMetric.name === oldMetric.name && newMetric.unit === oldMetric.unit
                    )
                );

                if (removedMetrics.length > 0) {
                    const metricNames = removedMetrics.map(m => `"${m.name}"`).join(', ');
                    setMetricWarningMessage(
                        `You are removing ${removedMetrics.length} metric(s): ${metricNames}. ` +
                        `This may affect existing session data. Metrics from old sessions will no longer display.`
                    );
                    setPendingSubmission({
                        name, description, metrics: hasMetrics ? validMetrics : [], has_sets: hasSets, has_metrics: hasMetrics, metrics_multiplicative: metricsMultiplicative
                    });
                    setShowMetricWarning(true);
                    return;
                }
            }
        }

        processSubmission();
    };

    const handleDeleteClick = (activity) => {
        setActivityToDelete(activity);
    };

    const handleConfirmDelete = async () => {
        if (!activityToDelete) return;
        try {
            await deleteActivity(rootId, activityToDelete.id);
            setActivityToDelete(null);
        } catch (err) {
            console.error("Failed to delete activity", err);
            setError("Failed to delete activity");
            setActivityToDelete(null);
        }
    };

    const handleDuplicate = async (activity) => {
        try {
            setCreating(true);

            // Create a copy with the same configuration but new ID
            await createActivity(rootId, {
                name: `${activity.name} (Copy)`,
                description: activity.description || '',
                metrics: activity.metric_definitions?.map(m => ({
                    name: m.name,
                    unit: m.unit,
                    is_top_set_metric: m.is_top_set_metric || false,
                    is_multiplicative: m.is_multiplicative !== undefined ? m.is_multiplicative : true
                })) || [],
                has_sets: activity.has_sets,
                has_metrics: activity.has_metrics,
                metrics_multiplicative: activity.metrics_multiplicative
            });

            // Activities list will auto-refresh via context
            setCreating(false);
        } catch (err) {
            console.error("Failed to duplicate activity", err);
            setError("Failed to duplicate activity");
            setCreating(false);
        }
    };

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'white' }}>Loading activities...</div>;
    }

    return (
        <div className="page-container" style={{ color: 'white' }}>
            <h1 style={{ fontWeight: 300, borderBottom: '1px solid #444', paddingBottom: '15px', marginBottom: '20px' }}>
                Manage Activities
            </h1>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
                {/* Activity Builder */}
                <div>
                    <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
                        <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>
                            {editingId ? 'Edit Activity' : 'Activity Builder'}
                        </h2>

                        {error && (
                            <div style={{ padding: '10px', background: 'rgba(255,0,0,0.1)', color: '#f44336', marginBottom: '20px', borderRadius: '4px' }}>
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit}>
                            <div style={{ display: 'grid', gap: '15px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '6px' }}>Activity Name</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder="e.g. Scale Practice"
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            background: '#2a2a2a',
                                            border: '1px solid #444',
                                            borderRadius: '4px',
                                            color: 'white'
                                        }}
                                        required
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '6px' }}>Description</label>
                                    <textarea
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        placeholder="Optional description"
                                        style={{
                                            width: '100%',
                                            minHeight: '80px',
                                            padding: '10px',
                                            background: '#2a2a2a',
                                            border: '1px solid #444',
                                            borderRadius: '4px',
                                            color: 'white',
                                            fontFamily: 'inherit',
                                            resize: 'vertical'
                                        }}
                                    />
                                </div>

                                {/* Flags */}
                                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
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
                                    {/* Show multiplicative checkbox when 2+ metric fields exist */}
                                    {metrics.length >= 2 && (
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#ccc', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={metricsMultiplicative}
                                                onChange={e => setMetricsMultiplicative(e.target.checked)}
                                            />
                                            Metrics are multiplicative
                                        </label>
                                    )}
                                </div>

                                {/* Metrics Section - Conditional */}
                                {hasMetrics && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '6px' }}>Metrics (Max 3)</label>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {metrics.map((metric, idx) => (
                                                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px', background: '#252525', borderRadius: '4px', border: '1px solid #333' }}>
                                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                        <input
                                                            type="text"
                                                            value={metric.name}
                                                            onChange={e => handleMetricChange(idx, 'name', e.target.value)}
                                                            placeholder="Metric Name (e.g. Speed)"
                                                            style={{
                                                                flex: 1,
                                                                padding: '10px',
                                                                background: '#2a2a2a',
                                                                border: '1px solid #444',
                                                                borderRadius: '4px',
                                                                color: 'white'
                                                            }}
                                                        />
                                                        <input
                                                            type="text"
                                                            value={metric.unit}
                                                            onChange={e => handleMetricChange(idx, 'unit', e.target.value)}
                                                            placeholder="Unit (e.g. bpm)"
                                                            style={{
                                                                width: '100px',
                                                                padding: '10px',
                                                                background: '#2a2a2a',
                                                                border: '1px solid #444',
                                                                borderRadius: '4px',
                                                                color: 'white'
                                                            }}
                                                        />
                                                        {metrics.length > 1 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveMetric(idx)}
                                                                style={{
                                                                    padding: '10px',
                                                                    background: '#d32f2f',
                                                                    border: 'none',
                                                                    borderRadius: '4px',
                                                                    color: 'white',
                                                                    cursor: 'pointer',
                                                                    width: '40px'
                                                                }}
                                                            >
                                                                ×
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Metric Flags */}
                                                    <div style={{ display: 'flex', gap: '16px', paddingLeft: '4px' }}>
                                                        {hasSets && (
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#aaa', cursor: 'pointer' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={metric.is_top_set_metric || false}
                                                                    onChange={e => handleMetricChange(idx, 'is_top_set_metric', e.target.checked)}
                                                                />
                                                                Top Set Metric
                                                            </label>
                                                        )}
                                                        {metricsMultiplicative && (
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#aaa', cursor: 'pointer' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={metric.is_multiplicative !== undefined ? metric.is_multiplicative : true}
                                                                    onChange={e => handleMetricChange(idx, 'is_multiplicative', e.target.checked)}
                                                                />
                                                                Multiplicative
                                                            </label>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            {metrics.length < 3 && (
                                                <button
                                                    type="button"
                                                    onClick={handleAddMetric}
                                                    style={{
                                                        padding: '10px',
                                                        background: '#333',
                                                        border: '1px dashed #666',
                                                        borderRadius: '4px',
                                                        color: '#aaa',
                                                        cursor: 'pointer',
                                                        fontSize: '13px'
                                                    }}
                                                >
                                                    + Add Metric
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                                    {editingId && (
                                        <button
                                            type="button"
                                            onClick={handleCancelEdit}
                                            style={{
                                                flex: 1,
                                                padding: '12px',
                                                background: '#666',
                                                border: 'none',
                                                borderRadius: '4px',
                                                color: 'white',
                                                fontWeight: 'bold',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Cancel
                                        </button>
                                    )}
                                    <button
                                        type="submit"
                                        disabled={creating}
                                        style={{
                                            flex: 1,
                                            padding: '12px',
                                            background: creating ? '#666' : '#4caf50',
                                            border: 'none',
                                            borderRadius: '4px',
                                            color: 'white',
                                            fontWeight: 'bold',
                                            cursor: creating ? 'not-allowed' : 'pointer',
                                            opacity: creating ? 0.5 : 1
                                        }}
                                    >
                                        {creating ? (editingId ? 'Saving...' : 'Creating...') : (editingId ? 'Save Activity' : 'Create Activity')}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>

                {/* Existing Activities */}
                <div>
                    <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
                        <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Saved Activities</h2>

                        {activities.length === 0 ? (
                            <p style={{ color: '#666', textAlign: 'center', padding: '20px' }}>
                                No activities defined yet
                            </p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {activities.map(activity => (
                                    <div
                                        key={activity.id}
                                        style={{
                                            background: '#2a2a2a',
                                            border: '1px solid #444',
                                            borderRadius: '4px',
                                            padding: '12px'
                                        }}
                                    >
                                        <div style={{ marginBottom: '8px' }}>
                                            <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '4px' }}>
                                                {activity.name}
                                            </div>
                                            {activity.description && (
                                                <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '8px' }}>
                                                    {activity.description}
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                {/* Indicators */}
                                                {activity.has_sets && (
                                                    <span style={{
                                                        fontSize: '11px',
                                                        background: '#333',
                                                        color: '#ff9800',
                                                        padding: '3px 8px',
                                                        borderRadius: '3px',
                                                        border: '1px solid #444'
                                                    }}>
                                                        Sets
                                                    </span>
                                                )}
                                                {(!activity.metric_definitions || activity.metric_definitions.length === 0) && (
                                                    <span style={{
                                                        fontSize: '11px',
                                                        background: '#333',
                                                        color: '#888',
                                                        padding: '3px 8px',
                                                        borderRadius: '3px',
                                                        border: '1px solid #444'
                                                    }}>
                                                        No Metrics
                                                    </span>
                                                )}
                                                {activity.metrics_multiplicative && (
                                                    <span style={{
                                                        fontSize: '11px',
                                                        background: '#333',
                                                        color: '#f44336',
                                                        padding: '3px 8px',
                                                        borderRadius: '3px',
                                                        border: '1px solid #444'
                                                    }}>
                                                        Multiplicative
                                                    </span>
                                                )}
                                                {activity.metric_definitions?.map(m => (
                                                    <span
                                                        key={m.id}
                                                        style={{
                                                            fontSize: '11px',
                                                            background: '#1a1a1a',
                                                            padding: '3px 8px',
                                                            borderRadius: '3px',
                                                            color: '#4caf50',
                                                            border: '1px solid #333'
                                                        }}
                                                    >
                                                        {m.name} ({m.unit})
                                                    </span>
                                                ))}
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => handleDeleteClick(activity)}
                                            style={{
                                                padding: '6px 12px',
                                                background: '#d32f2f',
                                                border: 'none',
                                                borderRadius: '3px',
                                                color: 'white',
                                                fontSize: '12px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {/* Modal for Deleting Activity */}
            <DeleteConfirmModal
                isOpen={!!activityToDelete}
                onClose={() => setActivityToDelete(null)}
                onConfirm={handleConfirmDelete}
                title="Delete Activity?"
                message={`Are you sure you want to delete "${activityToDelete?.name}"?`}
            />

            {/* Modal for Metric Removal Warning */}
            <DeleteConfirmModal
                isOpen={showMetricWarning}
                onClose={() => {
                    setShowMetricWarning(false);
                    setPendingSubmission(null);
                    setCreating(false);
                }}
                onConfirm={() => processSubmission(pendingSubmission)}
                title="Removing Metrics"
                message={metricWarningMessage}
            />
        </div>
    );
}

export default ManageActivities;
