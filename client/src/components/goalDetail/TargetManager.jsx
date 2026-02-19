import React, { useState, useEffect } from 'react';
import TargetCard from '../TargetCard';
import notify from '../../utils/notify';
import { fractalApi } from '../../utils/api';

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
    headerColor // New prop for header color
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

    const [programs, setPrograms] = useState([]);

    // Fetch Programs for Block Selection
    useEffect(() => {
        if (timeScope === 'program_block' && rootId && programs.length === 0) {
            fractalApi.getPrograms(rootId).then(res => {
                setPrograms(res.data || []);
            }).catch(err => console.error("Failed to fetch programs", err));
        }
    }, [timeScope, rootId, programs.length]);

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
        const containerStyle = viewMode === 'builder'
            ? { display: 'flex', flexDirection: 'column', gap: '14px' }  // Full view - no container box
            : { display: 'flex', flexDirection: 'column', gap: '14px', background: 'var(--color-bg-card-alt)', padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border)' };  // Embedded - has container

        return (
            <div style={containerStyle}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    paddingBottom: '12px',
                    borderBottom: '1px solid var(--color-border)'
                }}>
                    <button
                        onClick={handleCancel}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-text-muted)',
                            fontSize: '18px',
                            cursor: 'pointer',
                            padding: '0 4px'
                        }}
                    >
                        ←
                    </button>
                    <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--color-text-primary)' }}>
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
                                        {isSelected && <span>✓</span>}
                                        {activity.name}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Target Name */}
                <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        Target Name
                    </label>
                    <input
                        type="text"
                        value={targetName}
                        onChange={(e) => setTargetName(e.target.value)}
                        placeholder={selectedActivity?.name || 'Enter target name...'}
                        style={{
                            width: '100%',
                            padding: '8px',
                            background: 'var(--color-bg-input)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '4px',
                            color: 'var(--color-text-primary)',
                            fontSize: '13px'
                        }}
                    />
                </div>

                {/* Target Description */}
                <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        Description
                    </label>
                    <textarea
                        value={targetDescription}
                        onChange={(e) => setTargetDescription(e.target.value)}
                        placeholder="Optional description..."
                        rows={2}
                        style={{
                            width: '100%',
                            padding: '8px',
                            background: 'var(--color-bg-input)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '4px',
                            color: 'var(--color-text-primary)',
                            fontSize: '13px',
                            resize: 'vertical'
                        }}
                    />
                </div>

                {/* Target Type Selector */}
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        Target Type
                    </label>
                    <div style={{ display: 'flex', gap: '4px', background: 'var(--color-bg-input)', padding: '2px', borderRadius: '6px' }}>
                        {['threshold', 'sum', 'frequency'].map(type => (
                            <button
                                key={type}
                                onClick={() => setTargetType(type)}
                                style={{
                                    flex: 1,
                                    padding: '6px',
                                    border: 'none',
                                    borderRadius: '4px',
                                    background: targetType === type ? 'var(--color-bg-card-alt)' : 'transparent',
                                    color: targetType === type ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    fontWeight: targetType === type ? 600 : 400,
                                    boxShadow: targetType === type ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                }}
                            >
                                {type === 'threshold' ? 'Single Session' : type === 'sum' ? 'Accumulate' : 'Consistency'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Time Scope & Frequency */}
                {(targetType === 'sum' || targetType === 'frequency') && (
                    <div style={{ background: 'var(--color-bg-card-hover)', padding: '12px', borderRadius: '6px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            Time Scope
                        </label>
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                                <input type="radio" checked={timeScope === 'all_time'} onChange={() => setTimeScope('all_time')} />
                                All Time
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                                <input type="radio" checked={timeScope === 'program_block'} onChange={() => setTimeScope('program_block')} />
                                Program Block
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                                <input type="radio" checked={timeScope === 'custom'} onChange={() => setTimeScope('custom')} />
                                Custom Dates
                            </label>
                        </div>

                        {timeScope === 'program_block' && (
                            <div style={{ marginBottom: '10px' }}>
                                <select
                                    value={linkedBlockId}
                                    onChange={(e) => setLinkedBlockId(e.target.value)}
                                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
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
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '11px', color: '#aaa', display: 'block' }}>Start Date</label>
                                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '11px', color: '#aaa', display: 'block' }}>End Date</label>
                                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }} />
                                </div>
                            </div>
                        )}

                        {targetType === 'frequency' && (
                            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '10px' }}>
                                <label style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Required Sessions Count</label>
                                <input
                                    type="number"
                                    value={frequencyCount}
                                    onChange={e => setFrequencyCount(e.target.value)}
                                    style={{ marginLeft: '10px', width: '60px', padding: '4px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Metric Values */}
                {selectedActivity && selectedActivity.metric_definitions?.length > 0 && (
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            Target Metrics
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {selectedActivity.metric_definitions.map(metric => (
                                <div key={metric.id} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    padding: '10px',
                                    background: 'var(--color-bg-input)',
                                    borderRadius: '4px',
                                    border: '1px solid var(--color-border)'
                                }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: '500' }}>
                                            {metric.name}
                                        </div>
                                        {metric.description && (
                                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                                {metric.description}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        {/* Operator Selector */}
                                        <select
                                            value={metricValues[metric.id]?.operator || '>='}
                                            onChange={(e) => handleMetricChange(metric.id, 'operator', e.target.value)}
                                            style={{
                                                padding: '6px',
                                                background: 'var(--color-bg-card)',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: '4px',
                                                color: 'var(--color-text-primary)',
                                                fontSize: '13px',
                                                cursor: 'pointer'
                                            }}
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
                                            style={{
                                                width: '70px',
                                                padding: '6px',
                                                background: 'var(--color-bg-input)',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: '4px',
                                                color: 'var(--color-text-primary)',
                                                fontSize: '13px',
                                                textAlign: 'right'
                                            }}
                                        />
                                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', minWidth: '40px' }}>
                                            {metric.unit}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
                    {(viewState === 'edit' || initialTarget) && editingTarget ? (
                        <button
                            onClick={() => confirmAndDeleteTarget(editingTarget.id)}
                            style={{
                                padding: '8px 14px',
                                background: 'transparent',
                                border: '1px solid #f44336',
                                borderRadius: '4px',
                                color: '#f44336',
                                cursor: 'pointer',
                                fontSize: '13px'
                            }}
                        >
                            Delete Target
                        </button>
                    ) : <div />}

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={handleCancel}
                            style={{
                                padding: '8px 14px',
                                background: 'transparent',
                                border: '1px solid var(--color-border)',
                                borderRadius: '4px',
                                color: 'var(--color-text-secondary)',
                                cursor: 'pointer',
                                fontSize: '13px'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSaveTarget}
                            disabled={!selectedActivityId}
                            style={{
                                padding: '8px 14px',
                                background: selectedActivityId ? 'var(--color-success)' : 'var(--color-bg-input)',
                                border: 'none',
                                borderRadius: '4px',
                                color: selectedActivityId ? 'white' : 'var(--color-text-muted)',
                                cursor: selectedActivityId ? 'pointer' : 'not-allowed',
                                fontSize: '13px',
                                fontWeight: 600
                            }}
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
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.7)', zIndex: 1002,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
                <div style={{
                    background: 'var(--color-bg-card)', padding: '24px', borderRadius: '12px',
                    width: '90%', maxWidth: '400px', border: '1px solid var(--color-border)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: 'var(--color-text-primary)' }}>Delete Target?</h3>
                    <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
                        Are you sure you want to delete this target? This action cannot be undone.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <button
                            onClick={() => {
                                setShowDeleteConfirm(false);
                                setTargetToDelete(null);
                            }}
                            style={{
                                padding: '8px 16px', background: 'transparent',
                                border: '1px solid var(--color-border)', borderRadius: '6px',
                                color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '13px'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={executeDeleteTarget}
                            style={{
                                padding: '8px 16px', background: '#d32f2f',
                                border: 'none', borderRadius: '6px',
                                color: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '600'
                            }}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {renderDeleteConfirm()}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ display: 'block', margin: 0, fontSize: 'var(--font-size-xs)', color: headerColor || 'var(--color-text-muted)', fontWeight: 'bold' }}>
                        Targets
                    </label>
                    {targets.length > 0 && (
                        <span style={{
                            fontSize: '11px',
                            background: 'var(--color-bg-input)',
                            color: 'var(--color-text-muted)',
                            padding: '1px 7px',
                            borderRadius: '10px',
                            fontWeight: 500
                        }}>
                            {targets.length}
                        </span>
                    )}
                </div>
                {isEditing && (
                    <button
                        onClick={canAddTargets ? handleOpenAddTarget : undefined}
                        disabled={!canAddTargets}
                        style={{
                            background: 'transparent',
                            border: `1.5px solid ${canAddTargets ? '#4caf50' : 'var(--color-border)'}`,
                            borderRadius: '4px',
                            color: canAddTargets ? '#4caf50' : 'var(--color-text-muted)',
                            cursor: canAddTargets ? 'pointer' : 'not-allowed',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            padding: '2px 8px',
                            transition: 'all 0.2s'
                        }}
                    >
                        + Add Target
                    </button>
                )}
            </div>

            {targets.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                    {canAddTargets
                        ? 'No targets set.'
                        : 'Associate an activity with metrics to create a target.'}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {targets.map((target, index) => (
                        <div key={target.id || index} style={{ position: 'relative' }}>
                            <div onClick={() => isEditing && handleOpenEditTarget(target)} style={{ cursor: isEditing ? 'pointer' : 'default' }}>
                                <TargetCard
                                    target={target}
                                    isCompleted={target.completed}
                                    activityDefinitions={activityDefinitions}
                                    onEdit={undefined} // Handled by parent div click
                                    onDelete={() => confirmAndDeleteTarget(target.id)}
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
