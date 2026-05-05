import React, { useState } from 'react';
import CheckIcon from '../atoms/CheckIcon';
import TargetCard from '../TargetCard';
import notify from '../../utils/notify';
import { usePrograms } from '../../hooks/useProgramQueries';
import styles from './TargetManager.module.css';

/**
 * TargetManager Component
 * 
 * Manages the list of targets for a goal, including adding, editing, and deleting targets.
 * Contains the inline "Target Builder" UI.
 */
const TargetManager = ({
    targets,
    setTargets,
    activityDefinitions,
    associatedActivities,
    isEditing,
    mode,
    rootId, // Required for fetching programs
    onSave, // Callback to persist changes if needed (e.g. immediate save in view mode)
    // New props for full view mode
    viewMode = 'list', // 'list' | 'builder'
    onOpenBuilder, // (target?) => void
    onCloseBuilder,
    initialTarget = null, // Target to edit if opening in builder mode
    headerColor, // New prop for header color
    goalType = null,
    goalCompleted = false,
}) => {
    // Internal view state: 'list' | 'add' | 'edit' (still used for internal builder state)
    // BUT we prioritize props if provided for view switching
    const [viewState, setViewState] = useState(initialTarget ? 'edit' : 'list');
    const [editingTarget, setEditingTarget] = useState(initialTarget);
    const [targetToDelete, setTargetToDelete] = useState(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Form State

    // Form State
    const [selectedActivityId, setSelectedActivityId] = useState(initialTarget?.activity_id || '');
    const [targetName, setTargetName] = useState(initialTarget?.name || '');
    const [targetDescription, setTargetDescription] = useState(initialTarget?.description || '');

    // Target 2.0 State
    const [targetType, setTargetType] = useState(initialTarget?.type || 'threshold'); // 'threshold', 'sum', 'frequency'
    const [timeScope, setTimeScope] = useState(initialTarget?.time_scope || 'all_time'); // 'all_time', 'custom', 'program_block'
    const [startDate, setStartDate] = useState(initialTarget?.start_date || '');
    const [endDate, setEndDate] = useState(initialTarget?.end_date || '');
    const [linkedBlockId, setLinkedBlockId] = useState(initialTarget?.linked_block_id || '');
    const [frequencyCount, setFrequencyCount] = useState(initialTarget?.frequency_count || 1);

    // Fetch Programs for Block Selection
    const { programs = [] } = usePrograms(timeScope === 'program_block' ? rootId : null);

    // Initialize metrics with operators
    const [metricValues, setMetricValues] = useState(() => {
        const metricsObj = {};
        if (initialTarget?.metrics) {
            initialTarget.metrics.forEach(m => {
                metricsObj[m.metric_id] = {
                    value: m.value,
                    operator: m.operator || '>='
                };
            });
        }
        return metricsObj;
    });

    // Filter activities: only those that are associated AND have metrics
    const associatedActivityIds = associatedActivities.map(a => a.id);
    const activitiesWithMetrics = activityDefinitions.filter(a =>
        a.has_metrics && a.metric_definitions && a.metric_definitions.length > 0
    );
    const activitiesForTargets = activitiesWithMetrics.filter(a =>
        associatedActivityIds.includes(a.id)
    );
    const selectedActivity = activityDefinitions.find(a => a.id === selectedActivityId);

    // Handlers
    const handleOpenAddTarget = () => {
        setEditingTarget(null);
        setSelectedActivityId('');
        setTargetName('');
        setTargetDescription('');
        setMetricValues({});
        setTargetType('threshold');
        setTimeScope('all_time');
        setStartDate('');
        setEndDate('');
        setLinkedBlockId('');
        setFrequencyCount(1);

        if (onOpenBuilder) {
            onOpenBuilder(null);
        } else {
            setViewState('add');
        }
    };

    const handleOpenEditTarget = (target) => {
        setEditingTarget(target);
        setSelectedActivityId(target.activity_id || '');
        setTargetName(target.name || '');
        setTargetDescription(target.description || '');
        setTargetType(target.type || 'threshold');
        setTimeScope(target.time_scope || 'all_time');
        setStartDate(target.start_date || '');
        setEndDate(target.end_date || '');
        setLinkedBlockId(target.linked_block_id || '');
        setFrequencyCount(target.frequency_count || 1);

        const metricsObj = {};
        if (target.metrics) {
            target.metrics.forEach(m => {
                metricsObj[m.metric_id] = {
                    value: m.value,
                    operator: m.operator || '>='
                };
            });
        }
        setMetricValues(metricsObj);

        if (onOpenBuilder) {
            onOpenBuilder(target);
        } else {
            setViewState('edit');
        }
    };

    const handleActivityChange = (activityId) => {
        setSelectedActivityId(activityId);
        setMetricValues({});
        const activity = activityDefinitions.find(a => a.id === activityId);
        if (activity && !targetName) {
            setTargetName(activity.name);
        }
    };

    const handleMetricChange = (metricId, field, value) => {
        setMetricValues(prev => ({
            ...prev,
            [metricId]: {
                ...prev[metricId],
                [field]: value
            }
        }));
    };

    const handleSaveTarget = () => {
        if (!selectedActivityId) {
            notify.error('Please select an activity');
            return;
        }

        const metrics = Object.entries(metricValues).map(([metric_id, data]) => ({
            metric_id,
            value: parseFloat(data.value) || 0,
            operator: data.operator || '>='
        }));

        const target = {
            id: editingTarget?.id || crypto.randomUUID(),
            activity_id: selectedActivityId,
            name: targetName || selectedActivity?.name || 'Unnamed Target',
            description: targetDescription,
            type: targetType,
            time_scope: timeScope,
            start_date: startDate,
            end_date: endDate,
            linked_block_id: linkedBlockId,
            frequency_count: parseInt(frequencyCount) || 1,
            metrics
        };

        let newTargets;
        if (editingTarget) {
            newTargets = targets.map(t => t.id === target.id ? target : t);
        } else {
            newTargets = [...targets, target];
        }

        setTargets(newTargets);
        if (onSave) onSave(newTargets);

        setViewState('list');
        setEditingTarget(null);
        if (onCloseBuilder) onCloseBuilder();
    };

    const handleDeleteTarget = (targetId) => {
        const newTargets = targets.filter(t => t.id !== targetId);
        setTargets(newTargets);
        if (onSave) onSave(newTargets);
    };

    const confirmAndDeleteTarget = (targetId) => {
        setTargetToDelete(targetId);
        setShowDeleteConfirm(true);
    };

    const executeDeleteTarget = () => {
        if (targetToDelete) {
            handleDeleteTarget(targetToDelete);
            setViewState('list');
            setEditingTarget(null);
            setTargetToDelete(null);
            setShowDeleteConfirm(false);
            if (onCloseBuilder) onCloseBuilder();
        }
    };

    const handleCancel = () => {
        setViewState('list');
        setEditingTarget(null);
        if (onCloseBuilder) onCloseBuilder();
    };

    // Determine current view mode
    // If viewMode prop is 'builder', we force render the builder
    // Otherwise fallback to internal state (though internal state should arguably be removed if fully controlled)
    const shouldRenderBuilder = viewMode === 'builder' || viewState === 'add' || viewState === 'edit';

    // Ensure we have the correct title if strictly in builder mode but local state was default
    const getBuilderTitle = () => {
        if (viewState === 'edit' || initialTarget) return 'Edit Target';
        return 'Add Target';
    };

    // Render Logic
    if (shouldRenderBuilder) {
        // When viewMode='builder' (rendered as full modal view), skip the container styling
        // When triggered by internal state (add/edit), we're embedded so keep container styling
        const containerClass = viewMode === 'builder' ? styles.containerFull : styles.containerEmbedded;

        return (
            <div className={containerClass}>
                {/* Header */}
                <div className={styles.header}>
                    <button
                        onClick={handleCancel}
                        className={styles.backButton}
                    >
                        ←
                    </button>
                    <h3 className={styles.title}>
                        {getBuilderTitle()}
                    </h3>
                </div>

                {/* Activity Selector */}
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: '#aaa' }}>
                        Activity *
                    </label>

                    {activitiesForTargets.length === 0 ? (
                        <div style={{ fontSize: '11px', color: '#f44336', marginTop: '4px' }}>
                            {associatedActivities.length === 0
                                ? 'No activities associated with this goal. Add activities first before setting targets.'
                                : 'No associated activities have metrics. Add metrics to activities or associate activities with metrics.'}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {activitiesForTargets.map(activity => {
                                const isSelected = selectedActivityId === activity.id;
                                return (
                                    <button
                                        key={activity.id}
                                        onClick={() => handleActivityChange(activity.id)}
                                        style={{
                                            padding: '6px 12px',
                                            background: isSelected ? 'var(--color-bg-card-hover)' : 'var(--color-bg-input)',
                                            border: `1px solid ${isSelected ? 'var(--color-success)' : 'var(--color-border)'}`,
                                            borderRadius: '16px',
                                            color: isSelected ? 'var(--color-success)' : 'var(--color-text-secondary)',
                                            fontSize: '13px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        {isSelected && <CheckIcon size={13} />}
                                        {activity.name}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Target Name */}
                <div>
                    <label className={styles.inputLabelSmallMargin}>
                        Target Name
                    </label>
                    <input
                        type="text"
                        value={targetName}
                        onChange={(e) => setTargetName(e.target.value)}
                        placeholder={selectedActivity?.name || 'Enter target name...'}
                        className={styles.textInput}
                    />
                </div>

                {/* Target Description */}
                <div>
                    <label className={styles.inputLabelSmallMargin}>
                        Description
                    </label>
                    <textarea
                        value={targetDescription}
                        onChange={(e) => setTargetDescription(e.target.value)}
                        placeholder="Optional description..."
                        rows={2}
                        className={`${styles.textInput} ${styles.textArea}`}
                    />
                </div>

                {/* Target Type Selector */}
                <div>
                    <label className={styles.inputLabel}>
                        Target Type
                    </label>
                    <div className={styles.targetTypeContainer}>
                        {['threshold', 'sum', 'frequency'].map(type => (
                            <button
                                key={type}
                                onClick={() => setTargetType(type)}
                                className={`${styles.targetTypeButton} ${targetType === type ? styles.targetTypeButtonSelected : ''}`}
                            >
                                {type === 'threshold' ? 'Single Session' : type === 'sum' ? 'Accumulate' : 'Consistency'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Time Scope & Frequency */}
                {(targetType === 'sum' || targetType === 'frequency') && (
                    <div className={styles.timeScopeContainer}>
                        <label className={styles.inputLabel}>
                            Time Scope
                        </label>
                        <div className={styles.radioGroup}>
                            <label className={styles.radioLabel}>
                                <input type="radio" checked={timeScope === 'all_time'} onChange={() => setTimeScope('all_time')} />
                                All Time
                            </label>
                            <label className={styles.radioLabel}>
                                <input type="radio" checked={timeScope === 'program_block'} onChange={() => setTimeScope('program_block')} />
                                Program Block
                            </label>
                            <label className={styles.radioLabel}>
                                <input type="radio" checked={timeScope === 'custom'} onChange={() => setTimeScope('custom')} />
                                Custom Dates
                            </label>
                        </div>

                        {timeScope === 'program_block' && (
                            <div className={styles.marginBottom10}>
                                <select
                                    value={linkedBlockId}
                                    onChange={(e) => setLinkedBlockId(e.target.value)}
                                    className={styles.textInput}
                                >
                                    <option value="">Select a Block...</option>
                                    {programs.map(prog => (
                                        <optgroup key={prog.id} label={prog.name}>
                                            {prog.blocks?.map(block => (
                                                <option key={block.id} value={block.id}>{block.name} ({block.start_date || '?'} - {block.end_date || '?'})</option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                            </div>
                        )}

                        {timeScope === 'custom' && (
                            <div className={styles.flexGap8}>
                                <div className={styles.flex1}>
                                    <label className={styles.smallLabel}>Start Date</label>
                                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={styles.dateInput} />
                                </div>
                                <div className={styles.flex1}>
                                    <label className={styles.smallLabel}>End Date</label>
                                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={styles.dateInput} />
                                </div>
                            </div>
                        )}

                        {targetType === 'frequency' && (
                            <div className={styles.frequencyContainer}>
                                <label className={styles.inputLabel} style={{ marginBottom: 0, display: 'inline' }}>Required Sessions Count</label>
                                <input
                                    type="number"
                                    value={frequencyCount}
                                    onChange={e => setFrequencyCount(e.target.value)}
                                    className={styles.frequencyInput}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Metric Values */}
                {selectedActivity && selectedActivity.metric_definitions?.length > 0 && (
                    <div>
                        <label className={styles.inputLabel}>
                            Target Metrics
                        </label>
                        <div className={styles.metricsList}>
                            {selectedActivity.metric_definitions.map(metric => (
                                <div key={metric.id} className={styles.metricItem}>
                                    <div className={styles.flex1}>
                                        <div className={styles.metricName}>
                                            {metric.name}
                                        </div>
                                        {metric.description && (
                                            <div className={styles.metricDesc}>
                                                {metric.description}
                                            </div>
                                        )}
                                    </div>
                                    <div className={styles.metricControls}>
                                        {/* Operator Selector */}
                                        <select
                                            value={metricValues[metric.id]?.operator || '>='}
                                            onChange={(e) => handleMetricChange(metric.id, 'operator', e.target.value)}
                                            className={styles.operatorSelect}
                                        >
                                            <option value=">=">≥</option>
                                            <option value=">">&gt;</option>
                                            <option value="<=">≤</option>
                                            <option value="<">&lt;</option>
                                            <option value="==">=</option>
                                        </select>
                                        <input
                                            type="number"
                                            value={metricValues[metric.id]?.value || ''}
                                            onChange={(e) => handleMetricChange(metric.id, 'value', e.target.value)}
                                            placeholder="0"
                                            className={styles.metricValueInput}
                                        />
                                        <span className={styles.metricUnit}>
                                            {metric.unit}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className={styles.actionFooter}>
                    {(viewState === 'edit' || initialTarget) && editingTarget ? (
                        <button
                            onClick={() => confirmAndDeleteTarget(editingTarget.id)}
                            className={styles.deleteButton}
                        >
                            Delete Target
                        </button>
                    ) : <div />}

                    <div className={styles.flexGap8}>
                        <button
                            onClick={handleCancel}
                            className={styles.cancelButton}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSaveTarget}
                            disabled={!selectedActivityId}
                            className={`${styles.saveButton} ${!selectedActivityId ? styles.saveButtonDisabled : ''}`}
                        >
                            {(viewState === 'edit' || initialTarget) ? 'Update Target' : 'Add Target'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Confirmation Modal Render
    const renderDeleteConfirm = () => {
        if (!showDeleteConfirm) return null;
        return (
            <div className={styles.modalOverlay}>
                <div className={styles.modalContent}>
                    <h3 className={styles.modalTitle}>Delete Target?</h3>
                    <p className={styles.modalText}>
                        Are you sure you want to delete this target? This action cannot be undone.
                    </p>
                    <div className={styles.modalActions}>
                        <button
                            onClick={() => {
                                setShowDeleteConfirm(false);
                                setTargetToDelete(null);
                            }}
                            className={styles.modalCancelButton}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={executeDeleteTarget}
                            className={styles.modalDeleteButton}
                        >
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // Default List View
    const canAddTargets = activitiesForTargets.length > 0;

    return (
        <div className={styles.listContainer}>
            {renderDeleteConfirm()}
            <div className={styles.listHeader}>
                <div className={styles.listTitleGroup}>
                    <label className={styles.listTitle} style={{ color: headerColor || 'var(--color-text-muted)' }}>
                        Targets
                    </label>
                    {targets.length > 0 && (
                        <span className={styles.targetCount}>
                            {targets.length}
                        </span>
                    )}
                </div>
                {isEditing && (
                    <button
                        onClick={canAddTargets ? handleOpenAddTarget : undefined}
                        disabled={!canAddTargets}
                        className={`${styles.addTargetButton} ${!canAddTargets ? styles.addTargetButtonDisabled : ''}`}
                    >
                        + Add Target
                    </button>
                )}
            </div>

            {targets.length === 0 ? (
                <div className={styles.emptyState}>
                    {canAddTargets
                        ? 'No targets set.'
                        : 'Associate an activity with metrics to create a target.'}
                </div>
            ) : (
                <div className={styles.targetsWrap}>
                    {targets.map((target, index) => (
                        <div key={target.id || index} className={styles.targetWrapper}>
                            <div onClick={() => isEditing && handleOpenEditTarget(target)} style={{ cursor: isEditing ? 'pointer' : 'default' }}>
                                <TargetCard
                                    target={target}
                                    isCompleted={Boolean(target.completed || goalCompleted)}
                                    activityDefinitions={activityDefinitions}
                                    onEdit={undefined} // Handled by parent div click
                                    onDelete={() => confirmAndDeleteTarget(target.id)}
                                    goalType={goalType}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TargetManager;
