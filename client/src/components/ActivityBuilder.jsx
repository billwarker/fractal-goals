import React, { useState, useEffect } from 'react';
import { useActivities } from '../contexts/ActivitiesContext';
import DeleteConfirmModal from './modals/DeleteConfirmModal';

/**
 * Activity Builder Component - Reusable form for creating/editing activities
 */
function ActivityBuilder({ isOpen, onClose, editingActivity, rootId, onSave }) {
    const { createActivity, updateActivity } = useActivities();

    const [error, setError] = useState(null);
    const [creating, setCreating] = useState(false);
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
    const [hasSplits, setHasSplits] = useState(false);
    const [splits, setSplits] = useState([{ name: 'Split #1' }, { name: 'Split #2' }]);

    // Load activity data when editing
    useEffect(() => {
        if (editingActivity) {
            setName(editingActivity.name);
            setDescription(editingActivity.description || '');
            setHasSets(editingActivity.has_sets);
            setMetricsMultiplicative(editingActivity.metrics_multiplicative || false);
            setHasSplits(editingActivity.has_splits || false);

            const hasMetricDefinitions = editingActivity.metric_definitions && editingActivity.metric_definitions.length > 0;
            setHasMetrics(hasMetricDefinitions || editingActivity.has_metrics);

            if (editingActivity.metric_definitions && editingActivity.metric_definitions.length > 0) {
                setMetrics(editingActivity.metric_definitions.map(m => ({
                    id: m.id,
                    name: m.name,
                    unit: m.unit,
                    is_top_set_metric: m.is_top_set_metric || false,
                    is_multiplicative: m.is_multiplicative !== undefined ? m.is_multiplicative : true
                })));
            } else {
                setMetrics([{ name: '', unit: '', is_top_set_metric: false, is_multiplicative: true }]);
            }

            if (editingActivity.split_definitions && editingActivity.split_definitions.length > 0) {
                setSplits(editingActivity.split_definitions.map(s => ({
                    id: s.id,
                    name: s.name
                })));
            } else {
                setSplits([{ name: 'Split #1' }, { name: 'Split #2' }]);
            }
        } else {
            resetForm();
        }
    }, [editingActivity]);

    const resetForm = () => {
        setName('');
        setDescription('');
        setMetrics([{ name: '', unit: '', is_top_set_metric: false, is_multiplicative: true }]);
        setHasSets(false);
        setHasMetrics(true);
        setMetricsMultiplicative(false);
        setHasSplits(false);
        setSplits([{ name: 'Split #1' }, { name: 'Split #2' }]);
        setError(null);
    };

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

    const handleAddSplit = () => {
        if (splits.length < 5) {
            setSplits([...splits, { name: `Split #${splits.length + 1}` }]);
        }
    };

    const handleRemoveSplit = (index) => {
        if (splits.length > 2) {
            const newSplits = [...splits];
            newSplits.splice(index, 1);
            setSplits(newSplits);
        }
    };

    const handleSplitChange = (index, value) => {
        const newSplits = [...splits];
        newSplits[index] = { ...newSplits[index], name: value };
        setSplits(newSplits);
    };

    const processSubmission = async (overrideData = null) => {
        try {
            setCreating(true);
            const dataToSubmit = overrideData || {
                name,
                description,
                metrics: hasMetrics ? metrics.filter(m => m.name.trim() !== '') : [],
                splits: hasSplits ? splits.filter(s => s.name.trim() !== '') : [],
                has_sets: hasSets,
                has_metrics: hasMetrics,
                metrics_multiplicative: metricsMultiplicative,
                has_splits: hasSplits
            };

            if (editingActivity) {
                await updateActivity(rootId, editingActivity.id, dataToSubmit);
            } else {
                await createActivity(rootId, dataToSubmit);
            }

            resetForm();
            setCreating(false);
            setPendingSubmission(null);
            setShowMetricWarning(false);
            onSave?.();
            onClose();
        } catch (err) {
            console.error(editingActivity ? "Failed to update activity" : "Failed to create activity", err);
            setError(editingActivity ? "Failed to update activity" : "Failed to create activity");
            setCreating(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const validMetrics = metrics.filter(m => m.name.trim() !== '');

        if (editingActivity) {
            if (editingActivity.metric_definitions) {
                const removedMetrics = editingActivity.metric_definitions.filter(
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
                        name,
                        description,
                        metrics: hasMetrics ? validMetrics : [],
                        splits: hasSplits ? splits.filter(s => s.name.trim() !== '') : [],
                        has_sets: hasSets,
                        has_metrics: hasMetrics,
                        metrics_multiplicative: metricsMultiplicative,
                        has_splits: hasSplits
                    });
                    setShowMetricWarning(true);
                    return;
                }
            }
        }

        processSubmission();
    };

    const handleCancel = () => {
        resetForm();
        onClose();
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Modal Overlay */}
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '20px'
                }}
                onClick={handleCancel}
            >
                {/* Modal Content */}
                <div
                    style={{
                        background: '#1e1e1e',
                        border: '1px solid #333',
                        borderRadius: '8px',
                        padding: '24px',
                        maxWidth: '800px',
                        width: '100%',
                        maxHeight: '90vh',
                        overflow: 'auto',
                        color: 'white'
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <h2 style={{ fontSize: '24px', marginBottom: '20px', fontWeight: 300 }}>
                        {editingActivity ? 'Edit Activity' : 'Create Activity'}
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
                                        checked={hasSplits}
                                        onChange={e => setHasSplits(e.target.checked)}
                                    />
                                    Track Splits
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#ccc', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={hasMetrics}
                                        onChange={e => setHasMetrics(e.target.checked)}
                                    />
                                    Enable Metrics
                                </label>
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

                            {/* Splits Section */}
                            {hasSplits && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '6px' }}>Splits (Min 2, Max 5)</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                        {splits.map((split, idx) => (
                                            <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <input
                                                    type="text"
                                                    value={split.name}
                                                    onChange={e => handleSplitChange(idx, e.target.value)}
                                                    placeholder={`Split #${idx + 1}`}
                                                    style={{
                                                        width: '150px',
                                                        padding: '10px',
                                                        background: '#2a2a2a',
                                                        border: '1px solid #444',
                                                        borderRadius: '4px',
                                                        color: 'white'
                                                    }}
                                                />
                                                {splits.length > 2 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveSplit(idx)}
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
                                                {idx === splits.length - 1 && splits.length < 5 && (
                                                    <button
                                                        type="button"
                                                        onClick={handleAddSplit}
                                                        style={{
                                                            padding: '10px 16px',
                                                            background: '#333',
                                                            border: '1px dashed #666',
                                                            borderRadius: '4px',
                                                            color: '#aaa',
                                                            cursor: 'pointer',
                                                            fontSize: '13px',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        + Add Split
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Metrics Section */}
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

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                                <button
                                    type="button"
                                    onClick={handleCancel}
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
                                    {creating ? (editingActivity ? 'Saving...' : 'Creating...') : (editingActivity ? 'Save Activity' : 'Create Activity')}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>

            {/* Metric Warning Modal */}
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
        </>
    );
}

export default ActivityBuilder;
