import React, { useState } from 'react';
import Modal from './atoms/Modal';
import ModalBody from './atoms/ModalBody';
import ModalFooter from './atoms/ModalFooter';
import Input from './atoms/Input';
import TextArea from './atoms/TextArea';
import Select from './atoms/Select';
import Button from './atoms/Button';
import notify from '../utils/notify';

/**
 * AddTargetModal Component
 * Modal for creating or editing activity targets
 */
function buildInitialTargetFormState(existingTarget, preselectedActivityId, activityDefinitions) {
    if (existingTarget) {
        const metricsObj = {};
        existingTarget.metrics?.forEach((metric) => {
            metricsObj[metric.metric_id] = metric.value;
        });

        return {
            selectedActivityId: existingTarget.activity_id || '',
            targetName: existingTarget.name || '',
            targetDescription: existingTarget.description || '',
            metricValues: metricsObj,
        };
    }

    const preselectedActivity = activityDefinitions.find((activity) => activity.id === preselectedActivityId);
    return {
        selectedActivityId: preselectedActivityId || '',
        targetName: preselectedActivity?.name || '',
        targetDescription: '',
        metricValues: {},
    };
}

function AddTargetModal({ isOpen, onClose, onSave, activityDefinitions, existingTarget = null, preselectedActivityId = null }) {
    const initialFormState = buildInitialTargetFormState(existingTarget, preselectedActivityId, activityDefinitions);
    const [selectedActivityId, setSelectedActivityId] = useState(initialFormState.selectedActivityId);
    const [targetName, setTargetName] = useState(initialFormState.targetName);
    const [targetDescription, setTargetDescription] = useState(initialFormState.targetDescription);
    const [metricValues, setMetricValues] = useState(initialFormState.metricValues);

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
            notify.error('Please select an activity');
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

        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={existingTarget ? 'Edit Target' : 'Add Target'}
            size="md"
        >
            <ModalBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Activity Selector */}
                    <div>
                        <Select
                            label="Activity *"
                            value={selectedActivityId}
                            onChange={(e) => handleActivityChange(e.target.value)}
                            fullWidth
                        >
                            <option value="">Select an activity...</option>
                            {activitiesWithMetrics.map(activity => (
                                <option key={activity.id} value={activity.id}>
                                    {activity.name}
                                </option>
                            ))}
                        </Select>
                        {activitiesWithMetrics.length === 0 && (
                            <div style={{ fontSize: '12px', color: 'var(--color-brand-danger)', marginTop: '4px' }}>
                                No activities with metrics found. Create one first.
                            </div>
                        )}
                    </div>

                    {/* Target Name */}
                    <Input
                        label="Target Name"
                        type="text"
                        value={targetName}
                        onChange={(e) => setTargetName(e.target.value)}
                        placeholder={selectedActivity?.name || 'Enter target name...'}
                        fullWidth
                    />

                    {/* Target Description */}
                    <TextArea
                        label="Description"
                        value={targetDescription}
                        onChange={(e) => setTargetDescription(e.target.value)}
                        placeholder="Optional description..."
                        rows={2}
                        fullWidth
                    />

                    {/* Metric Values */}
                    {selectedActivity && selectedActivity.metric_definitions && (
                        <div style={{ marginTop: '4px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                                Target Values *
                            </label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {selectedActivity.metric_definitions.map(metric => (
                                    <div key={metric.id} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        background: 'var(--color-bg-card-alt)',
                                        padding: '10px',
                                        borderRadius: '4px',
                                        border: '1px solid var(--color-border)'
                                    }}>
                                        <label style={{ flex: 1, fontSize: '14px', color: 'var(--color-text-primary)' }}>
                                            {metric.name}
                                        </label>
                                        <Input
                                            type="number"
                                            value={metricValues[metric.id] || ''}
                                            onChange={(e) => handleMetricChange(metric.id, e.target.value)}
                                            placeholder="0"
                                            step="any"
                                            style={{ width: '100px', marginBottom: 0 }}
                                        />
                                        <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', minWidth: '40px' }}>
                                            {metric.unit}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </ModalBody>

            <ModalFooter>
                <Button
                    onClick={onClose}
                    variant="secondary"
                >
                    Cancel
                </Button>
                <Button
                    onClick={handleSave}
                    disabled={!selectedActivityId}
                    variant="primary"
                >
                    {existingTarget ? 'Update Target' : 'Add Target'}
                </Button>
            </ModalFooter>
        </Modal>
    );

}

export default AddTargetModal;
