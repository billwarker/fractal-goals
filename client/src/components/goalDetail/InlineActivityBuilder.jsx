import React, { useState } from 'react';
import notify from '../../utils/notify';
import { fractalApi } from '../../utils/api';
import Input from '../atoms/Input';
import TextArea from '../atoms/TextArea';
import Select from '../atoms/Select';
import Checkbox from '../atoms/Checkbox';
import Button from '../atoms/Button';
import styles from '../GoalDetailModal.module.css';

function InlineActivityBuilder({
    rootId,
    goalId,
    activityGroups = [],
    onSuccess,
    onCancel
}) {
    const [newActivityName, setNewActivityName] = useState('');
    const [newActivityDescription, setNewActivityDescription] = useState('');
    const [newActivityHasMetrics, setNewActivityHasMetrics] = useState(true);
    const [newActivityMetrics, setNewActivityMetrics] = useState([{ name: '', unit: '' }]);
    const [newActivityHasSets, setNewActivityHasSets] = useState(false);
    const [newActivityGroupId, setNewActivityGroupId] = useState('');
    const [isCreatingActivity, setIsCreatingActivity] = useState(false);
    const [newActivityError, setNewActivityError] = useState('');

    const handleCreateActivity = async () => {
        setNewActivityError('');
        if (!newActivityName.trim()) {
            notify.error('Please enter an activity name');
            return;
        }

        let validMetrics = [];
        if (newActivityHasMetrics) {
            for (let i = 0; i < newActivityMetrics.length; i++) {
                const metric = newActivityMetrics[i] || {};
                const metricName = (metric.name || '').trim();
                const metricUnit = (metric.unit || '').trim();

                if (!metricName && !metricUnit) continue;

                if (!metricName || !metricUnit) {
                    setNewActivityError(
                        `Malformed activity data: metric row ${i + 1} is incomplete. ` +
                        'Each metric must include both a name and a unit.'
                    );
                    return;
                }

                validMetrics.push({ ...metric, name: metricName, unit: metricUnit });
            }
        }

        setIsCreatingActivity(true);
        try {
            const activityData = {
                name: newActivityName,
                description: newActivityDescription,
                has_sets: newActivityHasSets,
                has_metrics: newActivityHasMetrics,
                metrics: validMetrics,
                group_id: newActivityGroupId || null
            };

            const response = await fractalApi.createActivity(rootId, activityData);
            const newActivity = response.data;

            if (onSuccess) {
                onSuccess(newActivity, newActivityName);
            }
        } catch (error) {
            console.error('Error creating activity:', error);
            const serverMessage = error?.response?.data?.error;
            setNewActivityError(
                serverMessage
                    ? `Malformed activity cannot be created: ${serverMessage}`
                    : `Failed to create activity: ${error?.message || 'Unknown error'}`
            );
        } finally {
            setIsCreatingActivity(false);
        }
    };

    return (
        <div className={styles.editContainer}>
            {/* Header */}
            <div className={styles.activityBuilderHeader}>
                <button
                    onClick={onCancel}
                    className={styles.backButton}
                >
                    ←
                </button>
                <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--color-text-primary)', flex: 1 }}>
                    Create New Activity
                </h3>
            </div>
            {newActivityError && (
                <div className={styles.activityBuilderError}>
                    {newActivityError}
                </div>
            )}

            {/* Activity Name */}
            <Input
                label="Activity Name *"
                value={newActivityName}
                onChange={(e) => setNewActivityName(e.target.value)}
                placeholder="e.g. Scale Practice"
                fullWidth
                className={styles.inputWrapper}
            />

            {/* Description */}
            <TextArea
                label="Description"
                value={newActivityDescription}
                onChange={(e) => setNewActivityDescription(e.target.value)}
                placeholder="Optional description..."
                rows={2}
                fullWidth
                className={styles.inputWrapper}
            />

            {/* Group Selection */}
            <Select
                label="Activity Group"
                value={newActivityGroupId}
                onChange={(e) => setNewActivityGroupId(e.target.value)}
                fullWidth
                className={styles.inputWrapper}
            >
                <option value="">(No Group)</option>
                {activityGroups && activityGroups.map(group => (
                    <option key={group.id} value={group.id}>
                        {group.name}
                    </option>
                ))}
            </Select>

            {/* Flags */}
            <div className={styles.checkboxGroup}>
                <Checkbox
                    label="Track Sets"
                    checked={newActivityHasSets}
                    onChange={(e) => setNewActivityHasSets(e.target.checked)}
                />
                <Checkbox
                    label="Enable Metrics"
                    checked={newActivityHasMetrics}
                    onChange={(e) => setNewActivityHasMetrics(e.target.checked)}
                />
            </div>

            {/* Metrics Section */}
            {newActivityHasMetrics && (
                <div style={{ marginTop: '16px' }}>
                    <div className={styles.label} style={{ color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                        Metrics (needed for targets)
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {newActivityMetrics.map((metric, idx) => (
                            <div key={idx} className={styles.metricRow}>
                                <Input
                                    value={metric.name}
                                    onChange={(e) => {
                                        const updated = [...newActivityMetrics];
                                        updated[idx] = { ...updated[idx], name: e.target.value };
                                        setNewActivityMetrics(updated);
                                    }}
                                    placeholder="Metric name (e.g. Speed)"
                                    className={styles.metricInput}
                                    style={{ marginBottom: 0 }}
                                />
                                <Input
                                    value={metric.unit}
                                    onChange={(e) => {
                                        const updated = [...newActivityMetrics];
                                        updated[idx] = { ...updated[idx], unit: e.target.value };
                                        setNewActivityMetrics(updated);
                                    }}
                                    placeholder="Unit (e.g. bpm)"
                                    className={styles.unitInput}
                                    style={{ marginBottom: 0 }}
                                />
                                {newActivityMetrics.length > 1 && (
                                    <Button
                                        onClick={() => {
                                            const updated = newActivityMetrics.filter((_, i) => i !== idx);
                                            setNewActivityMetrics(updated);
                                        }}
                                        variant="ghost"
                                        className={styles.removeMetricBtn}
                                        style={{ padding: '0 8px', color: 'var(--color-brand-danger)' }}
                                        title="Remove metric"
                                    >
                                        ✕
                                    </Button>
                                )}
                            </div>
                        ))}
                        {newActivityMetrics.length < 3 && (
                            <Button
                                onClick={() => setNewActivityMetrics([...newActivityMetrics, { name: '', unit: '' }])}
                                variant="secondary"
                                size="sm"
                                style={{
                                    alignSelf: 'flex-start',
                                    marginTop: '8px'
                                }}
                            >
                                + Add Metric
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Info about auto-association */}
            <div className={styles.autoAssociationInfo}>
                This activity will be automatically associated with this goal.
            </div>

            {/* Actions */}
            <div className={styles.editActions}>
                <Button
                    onClick={onCancel}
                    variant="secondary"
                >
                    Cancel
                </Button>
                <Button
                    onClick={handleCreateActivity}
                    disabled={isCreatingActivity || !newActivityName.trim()}
                    isLoading={isCreatingActivity}
                    variant="success"
                >
                    Create Activity
                </Button>
            </div>
        </div>
    );
}

export default InlineActivityBuilder;
