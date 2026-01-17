import React, { useState, useEffect } from 'react';
import { useActivities } from '../contexts/ActivitiesContext';
import { useGoals } from '../contexts/GoalsContext';
import { fractalApi } from '../utils/api';
import { getGoalColor, getGoalTextColor } from '../utils/goalColors';
import DeleteConfirmModal from './modals/DeleteConfirmModal';

/**
 * Activity Builder Component - Reusable form for creating/editing activities
 */
function ActivityBuilder({ isOpen, onClose, editingActivity, rootId, onSave }) {
    const { createActivity, updateActivity, activityGroups, fetchActivityGroups } = useActivities();
    const { currentFractal, fetchFractalTree } = useGoals();

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
    const [groupId, setGroupId] = useState('');
    const [selectedGoalIds, setSelectedGoalIds] = useState([]);
    const [showGoalSelector, setShowGoalSelector] = useState(false);
    const [currentGoalPath, setCurrentGoalPath] = useState([]); // Stack of goal nodes for navigation

    // Flatten goal tree for selection
    const flattenGoals = (node, goals = []) => {
        if (!node) return goals;
        goals.push({
            id: node.id || node.attributes?.id,
            name: node.name,
            type: node.attributes?.type || node.type
        });
        if (node.children && node.children.length > 0) {
            node.children.forEach(child => flattenGoals(child, goals));
        }
        return goals;
    };

    const allGoals = flattenGoals(currentFractal);

    // Fetch groups and goals when opened
    useEffect(() => {
        if (isOpen && rootId) {
            fetchActivityGroups(rootId);
            // Fetch goal tree if not already loaded
            if (!currentFractal) {
                fetchFractalTree(rootId);
            }
        }
    }, [isOpen, rootId, fetchActivityGroups, fetchFractalTree, currentFractal]);

    // Load activity data when editing
    useEffect(() => {
        if (editingActivity) {
            setName(editingActivity.name);
            setDescription(editingActivity.description || '');
            setHasSets(editingActivity.has_sets);
            setMetricsMultiplicative(editingActivity.metrics_multiplicative || false);
            setHasSplits(editingActivity.has_splits || false);
            setGroupId(editingActivity.group_id || '');

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

            // Load associated goal IDs
            setSelectedGoalIds(editingActivity.associated_goal_ids || []);
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
        setGroupId('');
        setSelectedGoalIds([]);
        setShowGoalSelector(false);
        setCurrentGoalPath([]); // Repurpose as selected level type
        setSelectedLevel(null);
        setError(null);
    };

    // Goal level type ordering and display names
    const GOAL_LEVELS = [
        { type: 'UltimateGoal', name: 'Ultimate' },
        { type: 'LongTermGoal', name: 'Long Term' },
        { type: 'MidTermGoal', name: 'Mid Term' },
        { type: 'ShortTermGoal', name: 'Short Term' },
        { type: 'ImmediateGoal', name: 'Immediate' },
        { type: 'MicroGoal', name: 'Micro' },
        { type: 'NanoGoal', name: 'Nano' }
    ];

    // Track which level is currently selected for viewing
    const [selectedLevel, setSelectedLevel] = useState(null);

    // Group goals by their type/level
    const getGoalsByLevel = () => {
        const goalsByLevel = {};
        GOAL_LEVELS.forEach(level => {
            goalsByLevel[level.type] = [];
        });

        allGoals.forEach(goal => {
            if (goalsByLevel[goal.type]) {
                goalsByLevel[goal.type].push(goal);
            }
        });

        return goalsByLevel;
    };

    const goalsByLevel = getGoalsByLevel();

    // Get levels that have goals
    const levelsWithGoals = GOAL_LEVELS.filter(level => goalsByLevel[level.type]?.length > 0);

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
                has_splits: hasSplits,
                group_id: groupId || null
            };

            let result;
            if (editingActivity) {
                result = await updateActivity(rootId, editingActivity.id, dataToSubmit);
                // Update goal associations
                await fractalApi.setActivityGoals(rootId, editingActivity.id, selectedGoalIds);
            } else {
                result = await createActivity(rootId, dataToSubmit);
                // Set goal associations for new activity
                if (result && result.id && selectedGoalIds.length > 0) {
                    await fractalApi.setActivityGoals(rootId, result.id, selectedGoalIds);
                }
            }

            resetForm();
            setCreating(false);
            setPendingSubmission(null);
            setShowMetricWarning(false);
            onSave?.(result);
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
                        has_splits: hasSplits,
                        group_id: groupId || null
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

                            {/* Associated Goals Section - Tree Navigation */}
                            <div>
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        marginBottom: '6px'
                                    }}
                                >
                                    <label style={{ fontSize: '12px', color: '#aaa' }}>
                                        Associated Goals ({selectedGoalIds.length})
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowGoalSelector(!showGoalSelector);
                                            if (!showGoalSelector) setSelectedLevel(null);
                                        }}
                                        style={{
                                            padding: '4px 10px',
                                            background: 'transparent',
                                            border: '1px solid #4caf50',
                                            borderRadius: '4px',
                                            color: '#4caf50',
                                            cursor: 'pointer',
                                            fontSize: '11px'
                                        }}
                                    >
                                        {showGoalSelector ? 'Done' : 'Select Goals'}
                                    </button>
                                </div>

                                {/* Selected Goals Display */}
                                {selectedGoalIds.length > 0 && !showGoalSelector && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                                        {selectedGoalIds.map(goalId => {
                                            const goal = allGoals.find(g => g.id === goalId);
                                            if (!goal) return null;
                                            const goalColor = getGoalColor(goal.type);
                                            return (
                                                <div
                                                    key={goalId}
                                                    style={{
                                                        padding: '4px 8px',
                                                        background: `${goalColor}20`,
                                                        border: `1px solid ${goalColor}`,
                                                        borderRadius: '4px',
                                                        fontSize: '11px',
                                                        color: goalColor,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px'
                                                    }}
                                                >
                                                    {goal.name}
                                                    <span
                                                        onClick={() => setSelectedGoalIds(prev => prev.filter(id => id !== goalId))}
                                                        style={{ cursor: 'pointer', fontWeight: 'bold' }}
                                                    >
                                                        ×
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Goal Level Navigator */}
                                {showGoalSelector && (
                                    <div style={{
                                        background: '#252525',
                                        padding: '16px',
                                        borderRadius: '6px',
                                        border: '1px solid #444'
                                    }}>
                                        {/* Level Badges Row */}
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: selectedLevel ? '12px' : '0' }}>
                                            {levelsWithGoals.length === 0 ? (
                                                <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                                                    No goals available
                                                </div>
                                            ) : (
                                                levelsWithGoals.map(level => {
                                                    const goalColor = getGoalColor(level.type);
                                                    const textColor = getGoalTextColor(level.type);
                                                    const count = goalsByLevel[level.type]?.length || 0;
                                                    const isActive = selectedLevel === level.type;

                                                    return (
                                                        <button
                                                            key={level.type}
                                                            type="button"
                                                            onClick={() => setSelectedLevel(isActive ? null : level.type)}
                                                            style={{
                                                                padding: '6px 14px',
                                                                background: goalColor,
                                                                border: isActive ? '2px solid white' : '2px solid transparent',
                                                                borderRadius: '4px',
                                                                color: textColor,
                                                                cursor: 'pointer',
                                                                fontSize: '12px',
                                                                fontWeight: 'bold',
                                                                transition: 'all 0.2s',
                                                                whiteSpace: 'nowrap',
                                                                opacity: isActive ? 1 : 0.85
                                                            }}
                                                        >
                                                            {level.name} ({count})
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </div>

                                        {/* Goals at Selected Level */}
                                        {selectedLevel && (
                                            <div style={{
                                                borderTop: '1px solid #444',
                                                paddingTop: '12px'
                                            }}>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                    {goalsByLevel[selectedLevel]?.map(goal => {
                                                        const goalColor = getGoalColor(goal.type);
                                                        const isSelected = selectedGoalIds.includes(goal.id);

                                                        return (
                                                            <label
                                                                key={goal.id}
                                                                style={{
                                                                    padding: '8px 12px',
                                                                    background: isSelected ? `${goalColor}25` : '#333',
                                                                    border: isSelected ? `2px solid ${goalColor}` : '1px solid #555',
                                                                    borderRadius: '6px',
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '8px',
                                                                    transition: 'all 0.2s'
                                                                }}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isSelected}
                                                                    onChange={(e) => {
                                                                        if (e.target.checked) {
                                                                            setSelectedGoalIds(prev => [...prev, goal.id]);
                                                                        } else {
                                                                            setSelectedGoalIds(prev => prev.filter(id => id !== goal.id));
                                                                        }
                                                                    }}
                                                                />
                                                                <span style={{
                                                                    fontSize: '13px',
                                                                    color: isSelected ? goalColor : '#ccc',
                                                                    fontWeight: isSelected ? 'bold' : 'normal'
                                                                }}>
                                                                    {goal.name}
                                                                </span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
                                    Goals with associated activities meet the SMART "Achievable" criterion
                                </div>
                            </div>

                            {/* Group Selection */}
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '6px' }}>Activity Group</label>
                                <select
                                    value={groupId}
                                    onChange={e => setGroupId(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        background: '#2a2a2a',
                                        border: '1px solid #444',
                                        borderRadius: '4px',
                                        color: 'white'
                                    }}
                                >
                                    <option value="">(No Group)</option>
                                    {activityGroups && activityGroups.map(group => (
                                        <option key={group.id} value={group.id}>
                                            {group.name}
                                        </option>
                                    ))}
                                </select>
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
