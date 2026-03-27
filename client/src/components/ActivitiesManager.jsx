import React, { useState } from 'react';
import { useActivities, useCreateActivity, useDeleteActivity } from '../hooks/useActivityQueries';
import Modal from './atoms/Modal';
import ModalBody from './atoms/ModalBody';
import Button from './atoms/Button';
import Input from './atoms/Input';
import Checkbox from './atoms/Checkbox';
import styles from './ActivitiesManager.module.css';

/**
 * ActivitiesManager - Modal component to manage Activity Definitions and Metrics
 */
function ActivitiesManager({ rootId, onClose }) {
    const { activities, isLoading: loading, error } = useActivities(rootId);
    const createMutation = useCreateActivity(rootId);
    const deleteMutation = useDeleteActivity(rootId);

    // UI State
    const [deletingId, setDeletingId] = useState(null);
    const [createError, setCreateError] = useState(null);

    // Form State
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [metrics, setMetrics] = useState([{ name: '', unit: '' }]);
    const [hasSets, setHasSets] = useState(false);
    const [hasMetrics, setHasMetrics] = useState(true);
    const [metricsMultiplicative, setMetricsMultiplicative] = useState(false);

    // Removing explicit fetchActivities() since React Query handles it automatically

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
            setCreateError(null);
            const validMetrics = metrics.filter(m => m.name.trim() !== '');

            await createMutation.mutateAsync({
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
        } catch (err) {
            console.error("Failed to create activity", err);
            setCreateError("Failed to create activity");
        }
    };

    const handleDeleteClick = (activityId) => {
        setDeletingId(activityId);
    };

    const handleConfirmDelete = async (activityId) => {
        try {
            await deleteMutation.mutateAsync(activityId);
            setDeletingId(null);
        } catch (err) {
            console.error("Failed to delete activity", err);
            setCreateError("Failed to delete activity");
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
            <ModalBody>
                <div className={styles.container}>
                    {(error || createError) && (
                        <div className={styles.errorBanner}>
                            {error ? "Failed to load activities" : createError}
                        </div>
                    )}

                    {/* List Existing */}
                    <div className={styles.existingListContainer}>
                        <h3 className={styles.sectionTitle}>Existing Activities</h3>
                        {loading ? (
                            <div>Loading...</div>
                        ) : activities.length === 0 ? (
                            <div className={styles.emptyState}>No activities defined yet.</div>
                        ) : (
                            <div className={styles.activitiesList}>
                                {activities.map(activity => (
                                    <div key={activity.id} className={styles.activityCard}>
                                        <div>
                                            <div className={styles.activityName}>{activity.name}</div>
                                            {activity.description && <div className={styles.activityDescription}>{activity.description}</div>}
                                            <div className={styles.tagsContainer}>
                                                {/* Indicators */}
                                                {activity.has_sets && (
                                                    <span className={`${styles.tag} ${styles.tagSets}`}>
                                                        Sets
                                                    </span>
                                                )}
                                                {!activity.has_metrics && (
                                                    <span className={`${styles.tag} ${styles.tagNoMetrics}`}>
                                                        No Metrics
                                                    </span>
                                                )}
                                                {activity.metrics_multiplicative && (
                                                    <span className={`${styles.tag} ${styles.tagMultiplicative}`}>
                                                        A × B × C
                                                    </span>
                                                )}

                                                {activity.metric_definitions?.map(m => (
                                                    <span key={m.id} className={`${styles.tag} ${styles.tagMetric}`}>
                                                        {m.name} ({m.unit})
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        {deletingId === activity.id ? (
                                            <div className={styles.actionButtons}>
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
                                                className={styles.deleteButton}
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
                    <div className={styles.createContainer}>
                        <h3 className={`${styles.sectionTitle} ${styles.createTitle}`}>Create New Activity</h3>
                        <form onSubmit={handleSubmit}>
                            <div className={styles.formGrid}>
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
                                <div className={styles.flagsContainer}>
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
                                        <label className={styles.metricsLabel}>Metrics (Max 3)</label>
                                        <div className={styles.metricsList}>
                                            {metrics.map((metric, idx) => (
                                                <div key={idx} className={styles.metricRow}>
                                                    <Input
                                                        value={metric.name}
                                                        onChange={e => handleMetricChange(idx, 'name', e.target.value)}
                                                        placeholder="Metric Name (e.g. Speed)"
                                                        className={styles.metricNameInput}
                                                    />
                                                    <Input
                                                        value={metric.unit}
                                                        onChange={e => handleMetricChange(idx, 'unit', e.target.value)}
                                                        placeholder="Unit"
                                                        className={styles.metricUnitInput}
                                                    />
                                                    {metrics.length > 1 && (
                                                        <Button
                                                            type="button"
                                                            onClick={() => handleRemoveMetric(idx)}
                                                            variant="ghost"
                                                            className={styles.metricRemoveButton}
                                                            aria-label="Remove metric"
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
                                                    className={styles.addMetricButton}
                                                >
                                                    + Add Metric
                                                </Button>
                                            )}
                                        </div>

                                        {/* Multiplicative Metrics Checkbox - only show when 2+ metrics */}
                                        {metrics.filter(m => m.name.trim() !== '').length > 1 && (
                                            <div className={styles.multiplicativeContainer}>
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
                                    disabled={createMutation.isPending}
                                    isLoading={createMutation.isPending}
                                    variant="success"
                                    fullWidth
                                >
                                    {createMutation.isPending ? 'Creating...' : 'Create Activity'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            </ModalBody>
        </Modal >
    );
}

export default ActivitiesManager;
