import React, { useEffect, useState } from 'react';
import CheckIcon from '../atoms/CheckIcon';
import TargetCard from '../TargetCard';
import notify from '../../utils/notify';
import { usePrograms } from '../../hooks/useProgramQueries';
import { useTargetMutations } from '../../hooks/useTargetQueries';
import DeleteConfirmModal from '../modals/DeleteConfirmModal';
import styles from './TargetManager.module.css';

const OPERATOR_SYMBOLS = { '>=': '≥', '>': '>', '<=': '≤', '<': '<', '==': '=' };

// Build a default target name from the configured metric conditions, e.g.
// "Form ≥ 9" or "Reps ≥ 5, Weight ≥ 45". Missing values default to 0 so the
// name reflects the metric configuration immediately.
function deriveMetricTargetName(activity, metricValues) {
    if (!activity?.metric_definitions?.length) return '';
    const parts = activity.metric_definitions.map((metric) => {
        const entry = metricValues[metric.id] || {};
        const op = OPERATOR_SYMBOLS[entry.operator || '>='] || (entry.operator || '>=');
        const value = (entry.value === '' || entry.value == null) ? 0 : entry.value;
        return `${metric.name} ${op} ${value}`;
    });
    return parts.join(', ');
}

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
    rootId, // Required for fetching programs
    goalId, // Required for per-target persistence (edit/delete) and analytics
    onSave, // Callback to persist changes if needed (e.g. immediate save in view mode)
    // New props for full view mode
    viewMode = 'list', // 'list' | 'builder'
    onOpenBuilder, // (target?) => void
    onCloseBuilder,
    initialTarget = null, // Target to edit if opening in builder mode
    headerColor, // New prop for header color
    goalType = null,
    showAddButton = true,
    initialActivityId = null,
    lockActivitySelection = false,
    onTargetClick = null, // (target) => void — opens the target analytics modal
    onRequestBuilder = null, // (target|null) => void — opens the add/edit builder in a dedicated modal
    onDraftChange = null, // (draft) => void — live builder form state, for graph preview
    onSaved = null, // ({ action, target, targets, result }) => void after direct per-target persistence
    hideBuilderHeader = false, // host renders its own header (e.g. analytics modal)
    stickyFooter = false, // pin the action footer to the bottom of the scroll area
    readOnly = false,
    goalCompleted = false,
}) => {
    // Edit/delete affordances on cards are available outside read-only contexts
    // (e.g. the public landing page), regardless of goal edit mode.
    const canEditTargets = !readOnly && Boolean(goalId);
    // Per-target mutations let view-mode add/edit/delete persist immediately.
    // Goal edit mode still uses the local setTargets/onSave path so unsaved goal
    // edits stay batched until the goal is saved.
    const {
        createTarget: createTargetMutation,
        updateTarget: updateTargetMutation,
        deleteTarget: deleteTargetMutation,
    } = useTargetMutations(rootId, goalId);
    // Internal view state: 'list' | 'add' | 'edit' (still used for internal builder state)
    // BUT we prioritize props if provided for view switching
    const [viewState, setViewState] = useState(initialTarget ? 'edit' : 'list');
    const [editingTarget, setEditingTarget] = useState(initialTarget);
    const [targetToDelete, setTargetToDelete] = useState(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Form State
    const [selectedActivityId, setSelectedActivityId] = useState(initialTarget?.activity_id || initialActivityId || '');
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
    const { programs = [] } = usePrograms(!readOnly && timeScope === 'program_block' ? rootId : null);
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
    const effectiveSelectedActivityId = selectedActivityId
        || (activitiesForTargets.length === 1 ? activitiesForTargets[0].id : '');
    const selectedActivity = activityDefinitions.find(a => a.id === effectiveSelectedActivityId);
    const metricDerivedName = deriveMetricTargetName(selectedActivity, metricValues);

    // Emit the live builder draft (activity + metric thresholds) so a host (the
    // analytics modal) can preview it on the graph as the user edits.
    useEffect(() => {
        if (!onDraftChange) return;
        const metrics = Object.entries(metricValues)
            .filter(([, data]) => data && data.value !== '' && data.value != null)
            .map(([metric_id, data]) => ({
                metric_id,
                metric_definition_id: metric_id,
                operator: data.operator || '>=',
                value: parseFloat(data.value),
                target_value: parseFloat(data.value),
            }));
        onDraftChange({
            activity_id: effectiveSelectedActivityId || null,
            name: targetName?.trim() || metricDerivedName,
            type: targetType,
            metrics,
        });
    }, [onDraftChange, effectiveSelectedActivityId, targetName, targetType, metricValues, metricDerivedName]);

    const handleOpenAddTarget = () => {
        setEditingTarget(null);
        setSelectedActivityId(initialActivityId || '');
        setTargetName('');
        setTargetDescription('');
        setMetricValues({});
        setTargetType('threshold');
        setTimeScope('all_time');
        setStartDate('');
        setEndDate('');
        setLinkedBlockId('');
        setFrequencyCount(1);

        if (onRequestBuilder) {
            onRequestBuilder(null);
        } else if (onOpenBuilder) {
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

        if (onRequestBuilder) {
            onRequestBuilder(target);
        } else if (onOpenBuilder) {
            onOpenBuilder(target);
        } else {
            setViewState('edit');
        }
    };

    const handleActivityChange = (activityId) => {
        setSelectedActivityId(activityId);
        setMetricValues({});
        // The name placeholder/save default follows the selected activity's metrics.
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

    const buildTargetPayload = () => {
        const name = targetName?.trim() || metricDerivedName || 'Unnamed Target';
        const metrics = Object.entries(metricValues).map(([metric_id, data]) => ({
            metric_id,
            value: parseFloat(data.value) || 0,
            operator: data.operator || '>='
        }));

        const target = {
            id: editingTarget?.id || crypto.randomUUID(),
            activity_id: effectiveSelectedActivityId,
            name,
            description: targetDescription,
            type: targetType,
            time_scope: timeScope,
            start_date: startDate || null,
            end_date: endDate || null,
            linked_block_id: linkedBlockId || null,
            frequency_count: parseInt(frequencyCount) || 1,
            metrics
        };
        return target;
    };

    const closeBuilder = () => {
        setViewState('list');
        setEditingTarget(null);
        if (onCloseBuilder) onCloseBuilder();
    };

    const handleSaveTarget = async () => {
        if (!effectiveSelectedActivityId) {
            notify.error('Please select an activity');
            return;
        }

        const target = buildTargetPayload();

        if (!isEditing && goalId) {
            try {
                const result = editingTarget
                    ? await updateTargetMutation(editingTarget.id, target)
                    : await createTargetMutation(target);
                let nextTargets = targets;
                if (Array.isArray(result?.targets)) {
                    nextTargets = result.targets;
                } else if (result?.target) {
                    nextTargets = editingTarget
                        ? targets.map(t => t.id === result.target.id ? result.target : t)
                        : [...targets, result.target];
                }
                setTargets(nextTargets);
                onSaved?.({
                    action: editingTarget ? 'update' : 'create',
                    target: result?.target || target,
                    targets: nextTargets,
                    result,
                });
                closeBuilder();
            } catch {
                // The mutation hook owns user-facing error notifications.
            }
            return;
        }

        let newTargets;
        if (editingTarget) {
            newTargets = targets.map(t => t.id === target.id ? target : t);
        } else {
            newTargets = [...targets, target];
        }

        setTargets(newTargets);
        if (onSave) onSave(newTargets);
        closeBuilder();
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
            if (isEditing) {
                // Goal edit mode: keep the change local until the goal is saved.
                handleDeleteTarget(targetToDelete);
            } else if (goalId) {
                // View mode: persist the delete immediately via the per-target API.
                deleteTargetMutation(targetToDelete).catch(() => { /* notified by hook */ });
            }
            setViewState('list');
            setEditingTarget(null);
            setTargetToDelete(null);
            setShowDeleteConfirm(false);
            if (onCloseBuilder) onCloseBuilder();
        }
    };

    const handleCancel = () => {
        closeBuilder();
    };

    // Determine current view mode
    // If viewMode prop is 'builder', we force render the builder
    // Otherwise fallback to internal state (though internal state should arguably be removed if fully controlled)
    const shouldRenderBuilder = viewMode === 'builder' || viewState === 'add' || viewState === 'edit';

    // Ensure we have the correct title if strictly in builder mode but local state was default
    const getBuilderTitle = () => {
        const isEditingTarget = viewState === 'edit' || initialTarget;
        const verb = isEditingTarget ? 'Edit Target' : 'Add Target';
        return selectedActivity?.name ? `${verb} for ${selectedActivity.name}` : verb;
    };

    // Confirmation Modal Render
    const renderDeleteConfirm = () => {
        if (!showDeleteConfirm) return null;
        const pendingTarget = targets.find((target) => target.id === targetToDelete) || editingTarget;
        const pendingTargetName = pendingTarget?.name || 'this target';
        return (
            <DeleteConfirmModal
                isOpen={showDeleteConfirm}
                onClose={() => {
                    setShowDeleteConfirm(false);
                    setTargetToDelete(null);
                }}
                onConfirm={executeDeleteTarget}
                title="Delete Target"
                message={`Delete "${pendingTargetName}"? This action cannot be undone.`}
                confirmText="Delete Target"
                overlayClassName={styles.deleteConfirmOverlay}
            />
        );
    };

    // Render Logic
    if (shouldRenderBuilder) {
        // When viewMode='builder' (rendered as full modal view), skip the container styling
        // When triggered by internal state (add/edit), we're embedded so keep container styling
        const containerClass = viewMode === 'builder' ? styles.containerFull : styles.containerEmbedded;

        return (
            <div className={`${containerClass} ${readOnly ? styles.readOnlyPreview : ''}`} aria-readonly={readOnly || undefined}
                onClickCapture={readOnly ? (event) => !event.target.closest(`.${styles.backButton}`) && event.preventDefault() : undefined}
                onKeyDownCapture={readOnly ? (event) => !event.target.closest(`.${styles.backButton}`) && event.preventDefault() : undefined}>
                {renderDeleteConfirm()}
                {/* Header (hidden when the host renders its own) */}
                {!hideBuilderHeader && (
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
                )}

                {/* Activity Selector — hidden when the activity is already determined
                    (locked or a single option), since the header names it. */}
                {(lockActivitySelection || activitiesForTargets.length <= 1) ? null : (
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
                )}

                {/* Target Name */}
                <div>
                    <label className={styles.inputLabelSmallMargin}>
                        Target Name
                    </label>
                    <input
                        type="text"
                        value={targetName}
                        onChange={(e) => setTargetName(e.target.value)}
                        placeholder={metricDerivedName || 'Target metrics'}
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
                <div className={`${styles.actionFooter} ${stickyFooter ? styles.actionFooterSticky : ''}`}>
                    {(viewState === 'edit' || initialTarget) && editingTarget ? (
                        <button
                            onClick={() => confirmAndDeleteTarget(editingTarget.id)}
                            className={styles.deleteButton}
                        >
                            Delete Target
                        </button>
                    ) : <div />}

                    <div className={styles.actionButtons}>
                        <button
                            onClick={handleCancel}
                            className={styles.cancelButton}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSaveTarget}
                            disabled={!effectiveSelectedActivityId}
                            className={`${styles.saveButton} ${!effectiveSelectedActivityId ? styles.saveButtonDisabled : ''}`}
                        >
                            {(viewState === 'edit' || initialTarget) ? 'Update Target' : 'Add Target'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

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
                {isEditing && showAddButton && (
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
                            <TargetCard
                                target={target}
                                isCompleted={Boolean(goalCompleted || target.completed)}
                                activityDefinitions={activityDefinitions}
                                onClick={onTargetClick ? () => onTargetClick(target) : undefined}
                                onEdit={canEditTargets ? () => handleOpenEditTarget(target) : undefined}
                                onDelete={canEditTargets ? () => confirmAndDeleteTarget(target.id) : undefined}
                                isEditMode={isEditing}
                                goalType={goalType}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TargetManager;
