import React, { useState, useEffect } from 'react';
import { fractalApi } from '../utils/api';
import Modal from './atoms/Modal';
import Button from './atoms/Button';
import Input from './atoms/Input';
import Checkbox from './atoms/Checkbox';

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
        <Modal
            isOpen={true}
            onClose={onClose}
            title="Manage Activities"
            size="lg"
        >
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {error && (
                    <div style={{ padding: '10px', background: 'rgba(255,0,0,0.1)', color: '#f44336', marginBottom: '20px', borderRadius: '4px' }}>
                        {error}
                    </div>
                )}

                {/* List Existing */}
                <div style={{ marginBottom: '30px' }}>
                    <h3 style={{ fontSize: '14px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: '15px' }}>Existing Activities</h3>
                    {loading ? (
                        <div>Loading...</div>
                    ) : activities.length === 0 ? (
                        <div style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No activities defined yet.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {activities.map(activity => (
                                <div key={activity.id} style={{
                                    background: 'var(--color-bg-card-alt)',
                                    padding: '12px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--color-border)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div>
                                        <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{activity.name}</div>
                                        {activity.description && <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{activity.description}</div>}
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '6px', alignItems: 'center' }}>
                                            {/* Indicators */}
                                            {activity.has_sets && (
                                                <span style={{ fontSize: '11px', background: 'var(--color-bg-input)', color: 'var(--color-warning)', padding: '2px 6px', borderRadius: '3px', border: '1px solid var(--color-border)' }}>
                                                    Sets
                                                </span>
                                            )}
                                            {!activity.has_metrics && (
                                                <span style={{ fontSize: '11px', background: 'var(--color-bg-input)', color: 'var(--color-text-muted)', padding: '2px 6px', borderRadius: '3px', border: '1px solid var(--color-border)' }}>
                                                    No Metrics
                                                </span>
                                            )}
                                            {activity.metrics_multiplicative && (
                                                <span style={{ fontSize: '11px', background: 'var(--color-bg-input)', color: '#e91e63', padding: '2px 6px', borderRadius: '3px', border: '1px solid var(--color-border)' }}>
                                                    A × B × C
                                                </span>
                                            )}

                                            {activity.metric_definitions?.map(m => (
                                                <span key={m.id} style={{
                                                    fontSize: '11px',
                                                    background: 'var(--color-bg-input)',
                                                    padding: '2px 6px',
                                                    borderRadius: '3px',
                                                    color: 'var(--color-success)',
                                                    border: '1px solid var(--color-border)'
                                                }}>
                                                    {m.name} ({m.unit})
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    {deletingId === activity.id ? (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <Button
                                                onClick={() => handleConfirmDelete(activity.id)}
                                                variant="danger"
                                                size="sm"
                                            >
                                                Confirm
                                            </Button>
                                            <Button
                                                onClick={() => setDeletingId(null)}
                                                variant="secondary"
                                                size="sm"
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    ) : (
                                        <Button
                                            onClick={() => handleDeleteClick(activity.id)}
                                            variant="ghost"
                                            size="sm"
                                            style={{ color: 'var(--color-brand-danger)' }}
                                        >
                                            Delete
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Create New Form */}
                <div style={{
                    background: 'var(--color-bg-card-alt)',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)'
                }}>
                    <h3 style={{ fontSize: '14px', color: 'var(--color-text-primary)', marginBottom: '15px', marginTop: 0 }}>Create New Activity</h3>
                    <form onSubmit={handleSubmit}>
                        <div style={{ display: 'grid', gap: '15px' }}>
                            <div>
                                <Input
                                    label="Activity Name"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="e.g. Scale Practice"
                                    fullWidth
                                    required
                                />
                            </div>
                            <div>
                                <Input
                                    label="Description"
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="Optional description"
                                    fullWidth
                                />
                            </div>

                            {/* Flags */}
                            <div style={{ display: 'flex', gap: '20px' }}>
                                <Checkbox
                                    label="Track Sets"
                                    checked={hasSets}
                                    onChange={e => setHasSets(e.target.checked)}
                                />
                                <Checkbox
                                    label="Enable Metrics"
                                    checked={hasMetrics}
                                    onChange={e => setHasMetrics(e.target.checked)}
                                />
                            </div>

                            {/* Metrics Section - Conditional */}
                            {hasMetrics && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '5px' }}>Metrics (Max 3)</label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {metrics.map((metric, idx) => (
                                            <div key={idx} style={{ display: 'flex', gap: '8px' }}>
                                                <Input
                                                    value={metric.name}
                                                    onChange={e => handleMetricChange(idx, 'name', e.target.value)}
                                                    placeholder="Metric Name (e.g. Speed)"
                                                    style={{ marginBottom: 0, flex: 1 }}
                                                />
                                                <Input
                                                    value={metric.unit}
                                                    onChange={e => handleMetricChange(idx, 'unit', e.target.value)}
                                                    placeholder="Unit"
                                                    style={{ marginBottom: 0, width: '80px' }}
                                                />
                                                {metrics.length > 1 && (
                                                    <Button
                                                        type="button"
                                                        onClick={() => handleRemoveMetric(idx)}
                                                        variant="ghost"
                                                        style={{ color: 'var(--color-brand-danger)', padding: '0 8px' }}
                                                    >
                                                        ×
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                        {metrics.length < 3 && (
                                            <Button
                                                type="button"
                                                onClick={handleAddMetric}
                                                variant="secondary"
                                                size="sm"
                                                style={{ alignSelf: 'flex-start' }}
                                            >
                                                + Add Metric
                                            </Button>
                                        )}
                                    </div>

                                    {/* Multiplicative Metrics Checkbox - only show when 2+ metrics */}
                                    {metrics.filter(m => m.name.trim() !== '').length > 1 && (
                                        <div style={{ marginTop: '10px' }}>
                                            <Checkbox
                                                label="Metrics are multiplicative (enables A × B × C derived metric)"
                                                checked={metricsMultiplicative}
                                                onChange={e => setMetricsMultiplicative(e.target.checked)}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            <Button
                                type="submit"
                                disabled={creating}
                                isLoading={creating}
                                variant="success"
                                fullWidth
                            >
                                {creating ? 'Creating...' : 'Create Activity'}
                            </Button>
                        </div>
                    </form>
                </div>
            </div>
        </Modal>
    );
}

export default ActivitiesManager;
