import React, { useMemo, useState } from 'react';
import { useGoalLevels } from '../contexts/GoalLevelsContext';
import notify from '../utils/notify';
import Modal from './atoms/Modal';
import ModalBody from './atoms/ModalBody';
import ModalFooter from './atoms/ModalFooter';
import Input from './atoms/Input';
import Button from './atoms/Button';
import GoalIcon from './atoms/GoalIcon';

/**
 * MicroGoalModal
 *
 * Lets the user set target metric values for a locked activity.
 * If the activity has no metrics, creates a completion-based target instead.
 * The micro goal name is auto-generated from the metric values or activity name.
 */
function MicroGoalModalInner({
    onClose,
    onSave,
    activityDefinitions = [],
    preselectedActivityId = null,
    parentGoalName = null,
}) {
    const { getGoalColor, getGoalSecondaryColor, getGoalIcon } = useGoalLevels();
    const microColor = getGoalColor('MicroGoal');
    const microSecondaryColor = getGoalSecondaryColor('MicroGoal');
    const microIcon = getGoalIcon ? getGoalIcon('MicroGoal') : 'circle';

    const [metricValues, setMetricValues] = useState({});
    const [intentionText, setIntentionText] = useState('');
    const [saving, setSaving] = useState(false);

    const lockedActivity = activityDefinitions.find(a => a.id === preselectedActivityId);
    const hasMetrics = lockedActivity?.metric_definitions?.length > 0;

    const handleMetricChange = (metricId, value) => {
        setMetricValues(prev => ({ ...prev, [metricId]: value }));
    };

    // Auto-generate name from filled-in metric values (metric targets only)
    const generatedName = useMemo(() => {
        if (!hasMetrics || !lockedActivity?.metric_definitions?.length) return '';
        const parts = lockedActivity.metric_definitions
            .filter(m => metricValues[m.id] !== undefined && metricValues[m.id] !== '')
            .map(m => `${m.name} ${metricValues[m.id]}${m.unit ? ' ' + m.unit : ''}`);
        return parts.join(', ');
    }, [metricValues, lockedActivity, hasMetrics]);

    const hasAnyMetricValue = Object.values(metricValues).some(v => v !== '' && v !== undefined);

    // For completion targets, always allow saving
    const canSave = hasMetrics ? hasAnyMetricValue : !!lockedActivity;

    const handleSave = async () => {
        if (!preselectedActivityId) {
            notify.error('No activity associated — select an activity first');
            return;
        }
        if (!canSave) {
            notify.error('Cannot create micro goal without an activity');
            return;
        }

        let target;
        let goalName;

        if (hasMetrics) {
            // Metric-based target (existing flow)
            const metrics = Object.entries(metricValues)
                .filter(([, v]) => v !== '' && v !== undefined)
                .map(([metric_id, value]) => ({
                    metric_id,
                    value: parseFloat(value) || 0,
                }));

            goalName = generatedName || lockedActivity?.name || 'Micro Goal';
            target = {
                id: crypto.randomUUID(),
                activity_id: preselectedActivityId,
                name: goalName,
                type: 'threshold',
                metrics,
            };
        } else {
            // Completion target (new flow)
            goalName = `Complete ${lockedActivity?.name || 'Activity'}`;
            target = {
                id: crypto.randomUUID(),
                activity_id: preselectedActivityId,
                name: goalName,
                type: 'completion',
                metrics: [],
            };
        }

        setSaving(true);
        try {
            await onSave({
                goalName,
                target,
                description: intentionText.trim() || '',
            });
            onClose();
        } catch (err) {
            console.error('Failed to create Micro Goal', err);
            notify.error('Failed to create Micro Goal');
        } finally {
            setSaving(false);
        }
    };

    const modalTitle = (
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GoalIcon
                shape={microIcon}
                color={microColor}
                secondaryColor={microSecondaryColor}
                size={20}
                isSmart={false}
            />
            New Micro Goal
        </span>
    );

    return (
        <Modal isOpen={true} onClose={onClose} title={modalTitle} size="md">
            <ModalBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Parent context */}
                    {parentGoalName && (
                        <div style={{
                            fontSize: '12px',
                            color: 'var(--color-text-secondary)',
                            padding: '6px 10px',
                            background: 'var(--color-bg-card-alt)',
                            borderRadius: '4px',
                            borderLeft: '3px solid var(--color-brand-primary)',
                        }}>
                            Under: <strong>{parentGoalName}</strong>
                        </div>
                    )}

                    {/* Target section */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                        {/* Section label */}
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Target
                        </div>

                        {/* Locked activity display */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Activity</span>
                            <div style={{
                                padding: '8px 12px',
                                background: 'var(--color-bg-card-alt)',
                                border: '1px solid var(--color-border)',
                                borderRadius: '4px',
                                fontSize: '14px',
                                color: 'var(--color-text-primary)',
                            }}>
                                {lockedActivity?.name ?? '—'}
                            </div>
                        </div>

                        {/* Metric value inputs OR completion target */}
                        {hasMetrics ? (
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                                    Target Values
                                </label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {lockedActivity.metric_definitions.map(metric => (
                                        <div key={metric.id} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px',
                                            background: 'var(--color-bg-card-alt)',
                                            padding: '10px',
                                            borderRadius: '4px',
                                            border: '1px solid var(--color-border)',
                                        }}>
                                            <label style={{ flex: 1, fontSize: '14px', color: 'var(--color-text-primary)' }}>
                                                {metric.name}
                                            </label>
                                            <Input
                                                type="number"
                                                value={metricValues[metric.id] || ''}
                                                onChange={e => handleMetricChange(metric.id, e.target.value)}
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
                        ) : (
                            <div style={{
                                padding: '12px',
                                background: 'var(--color-bg-card-alt)',
                                border: '1px solid var(--color-border)',
                                borderRadius: '6px',
                            }}>
                                <div style={{
                                    fontSize: '13px',
                                    color: 'var(--color-text-primary)',
                                    fontWeight: 500,
                                    marginBottom: '4px',
                                }}>
                                    ✓ Complete {lockedActivity?.name || 'activity'}
                                </div>
                                <div style={{
                                    fontSize: '11px',
                                    color: 'var(--color-text-muted)',
                                }}>
                                    Completion target — achieved when this activity is marked complete.
                                </div>
                            </div>
                        )}

                        {/* Intention text (optional, for completion targets) */}
                        {!hasMetrics && lockedActivity && (
                            <div>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                                    Intention <span style={{ fontSize: '11px', fontStyle: 'italic', color: 'var(--color-text-muted)' }}>(optional)</span>
                                </label>
                                <textarea
                                    value={intentionText}
                                    onChange={e => setIntentionText(e.target.value)}
                                    placeholder="e.g. Focus on smooth transitions..."
                                    rows={2}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        background: 'var(--color-bg-card-alt)',
                                        border: '1px solid var(--color-border)',
                                        borderRadius: '4px',
                                        color: 'var(--color-text-primary)',
                                        fontSize: '13px',
                                        resize: 'vertical',
                                        fontFamily: 'inherit',
                                        boxSizing: 'border-box',
                                    }}
                                />
                            </div>
                        )}
                    </div>

                    {/* Auto-generated goal name preview (metric targets only) */}
                    {hasMetrics && generatedName && (
                        <div style={{
                            borderTop: '1px solid var(--color-border)',
                            paddingTop: '14px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                        }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                Goal Name
                            </span>
                            <span style={{
                                fontSize: '14px',
                                color: 'var(--color-text-primary)',
                                fontStyle: 'italic',
                            }}>
                                {generatedName}
                            </span>
                        </div>
                    )}
                </div>
            </ModalBody>

            <ModalFooter>
                <Button onClick={onClose} variant="secondary" disabled={saving}>
                    Cancel
                </Button>
                <Button
                    onClick={handleSave}
                    variant="primary"
                    disabled={saving || !canSave}
                >
                    {saving ? 'Creating…' : 'Create Micro Goal'}
                </Button>
            </ModalFooter>
        </Modal>
    );
}

function MicroGoalModal(props) {
    if (!props.isOpen) {
        return null;
    }

    const modalKey = props.preselectedActivityId || 'micro-goal';
    return <MicroGoalModalInner key={modalKey} {...props} />;
}

export default MicroGoalModal;
