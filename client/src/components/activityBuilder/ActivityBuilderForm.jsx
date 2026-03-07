import React, { useState } from 'react';

import ActivityAssociationModal from '../sessionDetail/ActivityAssociationModal';
import Button from '../atoms/Button';
import Checkbox from '../atoms/Checkbox';
import DeleteConfirmModal from '../modals/DeleteConfirmModal';
import Input from '../atoms/Input';
import Select from '../atoms/Select';
import TextArea from '../atoms/TextArea';
import { buildActivityPayload } from '../../utils/activityBuilder';
import { getGroupBreadcrumb, sortGroupsTreeOrder } from '../../utils/manageActivities';
import styles from '../ActivityBuilder.module.css';
import ActivityAssociationsField from './ActivityAssociationsField';
import ActivityMetricsSection from './ActivityMetricsSection';
import ActivitySplitsSection from './ActivitySplitsSection';
import {
    DEFAULT_METRIC,
    DEFAULT_SPLITS,
    getInitialActivityBuilderState,
    normalizeMetricRows,
} from './activityBuilderUtils';

function ActivityBuilderForm({
    allGoals,
    editingActivity,
    rootId,
    activityGroups,
    createActivity,
    updateActivity,
    onSave,
    onClose,
    getGoalColor,
}) {
    const initialState = getInitialActivityBuilderState(editingActivity);
    const [error, setError] = useState(null);
    const [creating, setCreating] = useState(false);
    const [pendingSubmission, setPendingSubmission] = useState(null);
    const [showMetricWarning, setShowMetricWarning] = useState(false);
    const [metricWarningMessage, setMetricWarningMessage] = useState('');
    const [showAssociationModal, setShowAssociationModal] = useState(false);
    const [name, setName] = useState(initialState.name);
    const [description, setDescription] = useState(initialState.description);
    const [metrics, setMetrics] = useState(initialState.metrics);
    const [hasSets, setHasSets] = useState(initialState.hasSets);
    const [hasMetrics, setHasMetrics] = useState(initialState.hasMetrics);
    const [metricsMultiplicative, setMetricsMultiplicative] = useState(initialState.metricsMultiplicative);
    const [hasSplits, setHasSplits] = useState(initialState.hasSplits);
    const [splits, setSplits] = useState(initialState.splits);
    const [groupId, setGroupId] = useState(initialState.groupId);
    const [selectedGoalIds, setSelectedGoalIds] = useState(initialState.selectedGoalIds);

    const resetForm = () => {
        setError(null);
        setName('');
        setDescription('');
        setMetrics([DEFAULT_METRIC]);
        setHasSets(false);
        setHasMetrics(true);
        setMetricsMultiplicative(false);
        setHasSplits(false);
        setSplits(DEFAULT_SPLITS);
        setGroupId('');
        setSelectedGoalIds([]);
        setPendingSubmission(null);
        setShowMetricWarning(false);
        setMetricWarningMessage('');
        setShowAssociationModal(false);
    };

    const handleAddMetric = () => {
        if (metrics.length < 3) {
            setMetrics([...metrics, DEFAULT_METRIC]);
        }
    };

    const handleRemoveMetric = (index) => {
        const nextMetrics = [...metrics];
        nextMetrics.splice(index, 1);
        setMetrics(nextMetrics);
    };

    const handleMetricChange = (index, field, value) => {
        const nextMetrics = [...metrics];

        if (field === 'is_top_set_metric' && value === true) {
            nextMetrics.forEach((metric, metricIndex) => {
                if (metricIndex !== index) {
                    metric.is_top_set_metric = false;
                }
            });
        }

        nextMetrics[index] = { ...nextMetrics[index], [field]: value };
        setMetrics(nextMetrics);
    };

    const handleAddSplit = () => {
        if (splits.length < 5) {
            setSplits([...splits, { name: `Split #${splits.length + 1}` }]);
        }
    };

    const handleRemoveSplit = (index) => {
        if (splits.length <= 2) {
            return;
        }

        const nextSplits = [...splits];
        nextSplits.splice(index, 1);
        setSplits(nextSplits);
    };

    const handleSplitChange = (index, value) => {
        const nextSplits = [...splits];
        nextSplits[index] = { ...nextSplits[index], name: value };
        setSplits(nextSplits);
    };

    const processSubmission = async (overrideData = null) => {
        if (creating) {
            return;
        }

        try {
            setCreating(true);
            setError(null);

            const payload = overrideData || buildActivityPayload({
                name,
                description,
                metrics,
                splits,
                hasSets,
                hasMetrics,
                metricsMultiplicative,
                hasSplits,
                groupId,
                selectedGoalIds,
            });

            const result = editingActivity?.id
                ? await updateActivity(rootId, editingActivity.id, payload)
                : await createActivity(rootId, payload);

            resetForm();
            setCreating(false);
            onSave?.(result);
            onClose();
        } catch (err) {
            console.error(editingActivity ? 'Failed to update activity' : 'Failed to create activity', err);
            setError(err?.response?.data?.error || (editingActivity ? 'Failed to update activity' : 'Failed to create activity'));
            setCreating(false);
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (creating) {
            return;
        }

        setError(null);

        let validMetrics = [];
        if (hasMetrics) {
            const { error: metricError, metrics: normalizedMetrics } = normalizeMetricRows(metrics);
            if (metricError) {
                setError(metricError);
                return;
            }
            validMetrics = normalizedMetrics;
        }

        const payload = buildActivityPayload({
            name,
            description,
            metrics: validMetrics,
            splits,
            hasSets,
            hasMetrics,
            metricsMultiplicative,
            hasSplits,
            groupId,
            selectedGoalIds,
        });

        if (editingActivity?.metric_definitions) {
            const removedMetrics = editingActivity.metric_definitions.filter(
                (oldMetric) => !validMetrics.find((newMetric) => newMetric.id && newMetric.id === oldMetric.id)
            );

            if (removedMetrics.length > 0) {
                const metricNames = removedMetrics.map((metric) => `"${metric.name}"`).join(', ');
                setMetricWarningMessage(
                    `You are removing ${removedMetrics.length} metric(s): ${metricNames}. ` +
                    `Historical session data for these metrics will be preserved but won't display on new sessions.`
                );
                setPendingSubmission(payload);
                setShowMetricWarning(true);
                return;
            }
        }

        processSubmission(payload);
    };

    const handleCancel = () => {
        resetForm();
        onClose();
    };

    return (
        <>
            <h2 className={styles.modalTitle}>
                {editingActivity?.id ? 'Edit Activity' : 'Create Activity'}
            </h2>

            {error && (
                <div className={styles.errorMessage}>
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit}>
                <div className={styles.formGrid}>
                    <div>
                        <Input
                            label="Activity Name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="e.g. Scale Practice"
                            fullWidth
                            required
                        />
                    </div>

                    <div>
                        <TextArea
                            label="Description"
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            placeholder="Optional description"
                            fullWidth
                        />
                    </div>

                    <ActivityAssociationsField
                        allGoals={allGoals}
                        selectedGoalIds={selectedGoalIds}
                        onOpenModal={() => setShowAssociationModal(true)}
                        getGoalColor={getGoalColor}
                    />

                    <div>
                        <Select
                            label="Activity Group"
                            value={groupId}
                            onChange={(event) => setGroupId(event.target.value)}
                            fullWidth
                        >
                            <option value="">(No Group)</option>
                            {sortGroupsTreeOrder(activityGroups || []).map((group) => (
                                <option key={group.id} value={group.id}>
                                    {getGroupBreadcrumb(group.id, activityGroups)}
                                </option>
                            ))}
                        </Select>
                    </div>

                    <div className={styles.flagsContainer}>
                        <Checkbox
                            label="Track Sets"
                            checked={hasSets}
                            onChange={(event) => setHasSets(event.target.checked)}
                        />
                        <Checkbox
                            label="Track Splits"
                            checked={hasSplits}
                            onChange={(event) => setHasSplits(event.target.checked)}
                        />
                        <Checkbox
                            label="Enable Metrics"
                            checked={hasMetrics}
                            onChange={(event) => setHasMetrics(event.target.checked)}
                        />
                        {metrics.length >= 2 && (
                            <Checkbox
                                label="Metrics are multiplicative"
                                checked={metricsMultiplicative}
                                onChange={(event) => setMetricsMultiplicative(event.target.checked)}
                            />
                        )}
                    </div>

                    {hasSplits && (
                        <ActivitySplitsSection
                            splits={splits}
                            onAddSplit={handleAddSplit}
                            onRemoveSplit={handleRemoveSplit}
                            onSplitChange={handleSplitChange}
                        />
                    )}

                    {hasMetrics && (
                        <ActivityMetricsSection
                            metrics={metrics}
                            hasSets={hasSets}
                            metricsMultiplicative={metricsMultiplicative}
                            onAddMetric={handleAddMetric}
                            onRemoveMetric={handleRemoveMetric}
                            onMetricChange={handleMetricChange}
                        />
                    )}

                    <div className={styles.actionsRow}>
                        <Button
                            type="button"
                            onClick={handleCancel}
                            variant="secondary"
                            className={styles.actionBtn}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={creating}
                            isLoading={creating}
                            variant="primary"
                            className={styles.actionBtn}
                        >
                            {editingActivity?.id ? 'Save Activity' : 'Create Activity'}
                        </Button>
                    </div>
                </div>
            </form>

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
                confirmText="Save Anyway"
            />

            {showAssociationModal && (
                <ActivityAssociationModal
                    isOpen={showAssociationModal}
                    onClose={() => setShowAssociationModal(false)}
                    onAssociate={(newGoalIds) => {
                        setSelectedGoalIds(newGoalIds);
                    }}
                    goals={allGoals}
                    initialActivityName={name}
                    initialSelectedGoalIds={selectedGoalIds}
                />
            )}
        </>
    );
}

export default ActivityBuilderForm;
