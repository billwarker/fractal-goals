import React, { useState, useEffect } from 'react';
import Input from './atoms/Input';
import TextArea from './atoms/TextArea';
import Select from './atoms/Select';
import Button from './atoms/Button';
import Checkbox from './atoms/Checkbox';
import { useActivities } from '../contexts/ActivitiesContext';
import { useGoals } from '../contexts/GoalsContext';
import { fractalApi } from '../utils/api';
import { useTheme } from '../contexts/ThemeContext';
import DeleteConfirmModal from './modals/DeleteConfirmModal';
import styles from './ActivityBuilder.module.css';

/**
 * Activity Builder Component - Reusable form for creating/editing activities
 */
function ActivityBuilder({ isOpen, onClose, editingActivity, rootId, onSave }) {
    const { createActivity, updateActivity, activityGroups, fetchActivityGroups } = useActivities();
    const { useFractalTreeQuery } = useGoals();
    const { getGoalColor, getGoalTextColor } = useTheme();

    // Use the query hook to get the fractal tree
    const { data: currentFractal, isLoading: isLoadingGoals } = useFractalTreeQuery(rootId);

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

    const allGoals = React.useMemo(() => flattenGoals(currentFractal), [currentFractal]);

    // Fetch groups when opened
    useEffect(() => {
        if (isOpen && rootId) {
            fetchActivityGroups(rootId);
        }
    }, [isOpen, rootId, fetchActivityGroups]);

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
            if (editingActivity && editingActivity.id) {
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
            <div className={styles.overlay} onClick={handleCancel}>
                {/* Modal Content */}
                <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                    <h2 className={styles.modalTitle}>
                        {editingActivity && editingActivity.id ? 'Edit Activity' : 'Create Activity'}
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
                                    onChange={e => setName(e.target.value)}
                                    placeholder="e.g. Scale Practice"
                                    fullWidth
                                    required
                                />
                            </div>

                            <div>
                                <TextArea
                                    label="Description"
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="Optional description"
                                    fullWidth
                                />
                            </div>

                            {/* Associated Goals Section - Tree Navigation */}
                            <div>
                                <div className={styles.goalHeader}>
                                    <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                                        Associated Goals ({selectedGoalIds.length})
                                    </label>
                                    <Button
                                        type="button"
                                        onClick={() => {
                                            setShowGoalSelector(!showGoalSelector);
                                            if (!showGoalSelector) setSelectedLevel(null);
                                        }}
                                        variant="ghost"
                                        size="sm"
                                        style={{ color: 'var(--color-brand-primary)' }}
                                    >
                                        {showGoalSelector ? 'Done' : 'Select Goals'}
                                    </Button>
                                </div>

                                {/* Selected Goals Display */}
                                {selectedGoalIds.length > 0 && !showGoalSelector && (
                                    <div className={styles.selectedGoalsContainer}>
                                        {selectedGoalIds.map(goalId => {
                                            const goal = allGoals.find(g => g.id === goalId);
                                            if (!goal) return null;
                                            const goalColor = getGoalColor(goal.type);
                                            return (
                                                <div
                                                    key={goalId}
                                                    className={styles.selectedGoalTag}
                                                    style={{
                                                        background: `${goalColor}20`,
                                                        border: `1px solid ${goalColor}`,
                                                        color: goalColor
                                                    }}
                                                >
                                                    {goal.name}
                                                    <span
                                                        onClick={() => setSelectedGoalIds(prev => prev.filter(id => id !== goalId))}
                                                        className={styles.removeGoalBtn}
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
                                    <div className={styles.goalSelectorArea}>
                                        {/* Level Badges Row */}
                                        <div className={styles.levelBadgesRow} style={{ marginBottom: selectedLevel ? '12px' : '0' }}>
                                            {levelsWithGoals.length === 0 ? (
                                                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                                                    No goals available
                                                </div>
                                            ) : (
                                                levelsWithGoals.map(level => {
                                                    const goalColor = getGoalColor(level.type);
                                                    const textColor = getGoalTextColor(level.type);
                                                    const count = goalsByLevel[level.type]?.length || 0;
                                                    const isActive = selectedLevel === level.type;

                                                    return (
                                                        <Button
                                                            key={level.type}
                                                            type="button"
                                                            onClick={() => setSelectedLevel(isActive ? null : level.type)}
                                                            className={`${styles.levelBadge} ${isActive ? styles.levelBadgeActive : styles.levelBadgeInactive}`}
                                                            style={{
                                                                background: goalColor,
                                                                color: textColor,
                                                                border: isActive ? '2px solid white' : '2px solid transparent',
                                                                opacity: isActive ? 1 : 0.85
                                                            }}
                                                            size="sm"
                                                        >
                                                            {level.name} ({count})
                                                        </Button>
                                                    );
                                                })
                                            )}
                                        </div>

                                        {/* Goals at Selected Level */}
                                        {selectedLevel && (
                                            <div className={styles.goalsListLevel}>
                                                <div className={styles.goalsGrid}>
                                                    {goalsByLevel[selectedLevel]?.map(goal => {
                                                        const goalColor = getGoalColor(goal.type);
                                                        const isSelected = selectedGoalIds.includes(goal.id);

                                                        return (
                                                            <label
                                                                key={goal.id}
                                                                className={styles.goalCheckboxLabel}
                                                                style={{
                                                                    background: isSelected ? `${goalColor}25` : 'var(--color-bg-input)',
                                                                    border: isSelected ? `2px solid ${goalColor}` : '1px solid var(--color-border)'
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
                                                                <span
                                                                    className={styles.goalName}
                                                                    style={{
                                                                        color: isSelected ? goalColor : 'var(--color-text-muted)',
                                                                        fontWeight: isSelected ? 'bold' : 'normal'
                                                                    }}
                                                                >
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

                                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                    Goals with associated activities meet the SMART "Achievable" criterion
                                </div>
                            </div>

                            {/* Group Selection */}
                            <div>
                                <Select
                                    label="Activity Group"
                                    value={groupId}
                                    onChange={e => setGroupId(e.target.value)}
                                    fullWidth
                                >
                                    <option value="">(No Group)</option>
                                    {activityGroups && activityGroups.map(group => (
                                        <option key={group.id} value={group.id}>
                                            {group.name}
                                        </option>
                                    ))}
                                </Select>
                            </div>

                            {/* Flags */}
                            <div className={styles.flagsContainer}>
                                <Checkbox
                                    label="Track Sets"
                                    checked={hasSets}
                                    onChange={e => setHasSets(e.target.checked)}
                                />
                                <Checkbox
                                    label="Track Splits"
                                    checked={hasSplits}
                                    onChange={e => setHasSplits(e.target.checked)}
                                />
                                <Checkbox
                                    label="Enable Metrics"
                                    checked={hasMetrics}
                                    onChange={e => setHasMetrics(e.target.checked)}
                                />
                                {metrics.length >= 2 && (
                                    <Checkbox
                                        label="Metrics are multiplicative"
                                        checked={metricsMultiplicative}
                                        onChange={e => setMetricsMultiplicative(e.target.checked)}
                                    />
                                )}
                            </div>

                            {/* Splits Section */}
                            {hasSplits && (
                                <div>
                                    <label className={styles.label} style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Splits (Min 2, Max 5)</label>
                                    <div className={styles.splitsContainer}>
                                        {splits.map((split, idx) => (
                                            <div key={idx} className={styles.splitRow}>
                                                <Input
                                                    value={split.name}
                                                    onChange={e => handleSplitChange(idx, e.target.value)}
                                                    placeholder={`Split #${idx + 1}`}
                                                    style={{ marginBottom: 0, width: '200px' }}
                                                />
                                                {splits.length > 2 && (
                                                    <Button
                                                        type="button"
                                                        onClick={() => handleRemoveSplit(idx)}
                                                        variant="ghost"
                                                        style={{ color: 'var(--color-brand-danger)', padding: '8px' }}
                                                    >
                                                        ×
                                                    </Button>
                                                )}
                                                {idx === splits.length - 1 && splits.length < 5 && (
                                                    <Button
                                                        type="button"
                                                        onClick={handleAddSplit}
                                                        variant="secondary"
                                                        size="sm"
                                                    >
                                                        + Add Split
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Metrics Section */}
                            {hasMetrics && (
                                <div>
                                    <label className={styles.label} style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Metrics (Max 3)</label>
                                    <div className={styles.metricsList}>
                                        {metrics.map((metric, idx) => (
                                            <div key={idx} className={styles.metricCard}>
                                                <div className={styles.metricRow}>
                                                    <Input
                                                        value={metric.name}
                                                        onChange={e => handleMetricChange(idx, 'name', e.target.value)}
                                                        placeholder="Metric Name (e.g. Speed)"
                                                        style={{ marginBottom: 0, flex: 1 }}
                                                    />
                                                    <Input
                                                        value={metric.unit}
                                                        onChange={e => handleMetricChange(idx, 'unit', e.target.value)}
                                                        placeholder="Unit (e.g. bpm)"
                                                        style={{ marginBottom: 0, width: '120px' }}
                                                    />
                                                    {metrics.length > 1 && (
                                                        <Button
                                                            type="button"
                                                            onClick={() => handleRemoveMetric(idx)}
                                                            variant="ghost"
                                                            style={{ color: 'var(--color-brand-danger)', padding: '8px' }}
                                                        >
                                                            ×
                                                        </Button>
                                                    )}
                                                </div>

                                                {/* Metric Flags */}
                                                <div className={styles.metricFlags}>
                                                    {hasSets && (
                                                        <Checkbox
                                                            label="Top Set Metric"
                                                            checked={metric.is_top_set_metric || false}
                                                            onChange={e => handleMetricChange(idx, 'is_top_set_metric', e.target.checked)}
                                                            className={styles.subFlagLabel}
                                                        />
                                                    )}
                                                    {metricsMultiplicative && (
                                                        <Checkbox
                                                            label="Multiplicative"
                                                            checked={metric.is_multiplicative !== undefined ? metric.is_multiplicative : true}
                                                            onChange={e => handleMetricChange(idx, 'is_multiplicative', e.target.checked)}
                                                            className={styles.subFlagLabel}
                                                        />
                                                    )}
                                                </div>
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
                                </div>
                            )}

                            {/* Action Buttons */}
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
                                    {editingActivity && editingActivity.id ? 'Save Activity' : 'Create Activity'}
                                </Button>
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
