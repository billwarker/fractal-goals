import React, { useRef, useState } from 'react';
import ScatterPlot from './ScatterPlot';
import LineGraph from './LineGraph';
import GoalCompletionTimeline from './GoalCompletionTimeline';
import GoalTimeDistribution from './GoalTimeDistribution';
import ActivityHeatmap from './ActivityHeatmap';
import AnnotatedHeatmap from './AnnotatedHeatmap';
import AnnotatedChartWrapper from './AnnotatedChartWrapper';
import StreakTimeline from './StreakTimeline';
import WeeklyBarChart from './WeeklyBarChart';
import AnnotationsList from './AnnotationsList';
import { Bar, Line } from 'react-chartjs-2';
import { GOAL_COLOR_SYSTEM } from '../../utils/goalColors';

/**
 * ProfileWindow - A single analytics window that can display various visualizations
 * 
 * @param {object} props
 * @param {string} props.windowId - Unique ID for this window
 * @param {boolean} props.canSplit - Whether this window can be split (only first window)
 * @param {function} props.onSplit - Callback when split button is clicked
 * @param {boolean} props.canClose - Whether this window can be closed
 * @param {function} props.onClose - Callback when close button is clicked
 * @param {object} props.data - All analytics data (sessions, goalAnalytics, activities, activityInstances)
 * @param {object} props.windowState - Controlled state for this window (from parent)
 * @param {function} props.updateWindowState - Callback to update window state
 * @param {function} props.onAnnotationsClick - Callback when annotations category is clicked
 * @param {object} props.sourceWindowState - State from the source window (for annotations view)
 * @param {boolean} props.isSelected - Whether this window is selected for annotation targeting
 * @param {function} props.onSelect - Callback when the window is clicked to select it
 * @param {boolean} props.hasAnnotationsWindow - Whether any window is showing annotations
 */
function ProfileWindow({
    windowId,
    canSplit = false,
    onSplit, // Now accepts: onSplit(direction) where direction is 'vertical' or 'horizontal'
    canClose = false,
    onClose,
    data,
    windowState,
    updateWindowState,
    onAnnotationsClick,
    sourceWindowState,
    updateSourceWindowState,
    highlightedAnnotationId,
    setHighlightedAnnotationId,
    isSelected = false,
    onSelect,
    hasAnnotationsWindow = false
}) {
    const { sessions, goalAnalytics, activities, activityInstances, formatDuration, rootId } = data;
    const chartRef = useRef(null);
    const containerRef = useRef(null);

    // Local state for split dropdown
    const [showSplitMenu, setShowSplitMenu] = useState(false);

    // Track container width for responsive styling
    const [isNarrow, setIsNarrow] = useState(false);
    const [isVeryNarrow, setIsVeryNarrow] = useState(false);

    // Use ResizeObserver to detect width changes
    React.useEffect(() => {
        if (!containerRef.current) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const width = entry.contentRect.width;
                setIsNarrow(width < 400);
                setIsVeryNarrow(width < 280);
            }
        });

        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // Extract state from controlled windowState prop
    const {
        selectedCategory,
        selectedVisualization,
        selectedActivity,
        selectedMetric,
        selectedMetricY2,
        setsHandling,
        selectedSplit,
        selectedGoal,
        selectedGoalChart,
        heatmapMonths,
        isAnnotating // New state for annotation mode
    } = windowState;

    // Helper to update state (setSelectedCategory is handled by handleCategoryChange below)
    const setSelectedVisualization = (value) => updateWindowState({ selectedVisualization: value });
    const setSelectedActivity = (value) => updateWindowState({ selectedActivity: value });
    const setSelectedMetric = (value) => updateWindowState({ selectedMetric: value });
    const setSelectedMetricY2 = (value) => updateWindowState({ selectedMetricY2: value });
    const setSetsHandling = (value) => updateWindowState({ setsHandling: value });
    const setSelectedSplit = (value) => updateWindowState({ selectedSplit: value });
    const setSelectedGoal = (value) => updateWindowState({ selectedGoal: value });
    const setSelectedGoalChart = (value) => updateWindowState({ selectedGoalChart: value });
    const setHeatmapMonths = (value) => updateWindowState({ heatmapMonths: value });

    // Reset visualization when category changes
    const handleCategoryChange = (category) => {
        if (category !== selectedCategory) {
            updateWindowState({
                selectedCategory: category,
                selectedVisualization: null,
                selectedActivity: null,
                selectedGoal: null,
                isAnnotating: false
            });
        }
    };

    // ... (rest of file until AnnotatedChartWrapper usages)

    // We need to use multi_replace or specific target replacement for the AnnotatedChartWrapper usages.
    // Since there are multiple usages (completionTimeline, timeDistribution, weeklyChart, scatterPlot, lineGraph),
    // I will use a clever trick: I will replace the AnnotatedChartWrapper component usages.

    // But first, let's just make sure I updated the props deconstruction at the top correctly.
    // The simplified instruction above is not enough for the full file.
    // I will split this into two tool calls. One for the top, one for the bottom.


    // Define available visualizations for each category
    const visualizations = {
        goals: [
            { id: 'stats', name: 'Summary Stats', icon: '📊' },
            { id: 'completionTimeline', name: 'Completion Timeline', icon: '📈' },
            { id: 'timeDistribution', name: 'Time Distribution', icon: '🕒' },
            { id: 'goalDetail', name: 'Goal Detail View', icon: '🎯' }
        ],
        sessions: [
            { id: 'stats', name: 'Summary Stats', icon: '📊' },
            { id: 'heatmap', name: 'Activity Heatmap', icon: '🟩' },
            { id: 'streaks', name: 'Streak Timeline', icon: '🔥' },
            { id: 'weeklyChart', name: 'Weekly Chart', icon: '📅' }
        ],
        activities: [
            { id: 'scatterPlot', name: 'Scatter Plot', icon: '⚡' },
            { id: 'lineGraph', name: 'Line Graph', icon: '📈' }
        ],
        annotations: []
    };

    // Helper to extract visualization type from window state
    const getVisualizationType = (state) => {
        if (!state || !state.selectedCategory || !state.selectedVisualization) {
            return null;
        }

        const { selectedCategory: cat, selectedVisualization: viz } = state;

        // Map category + visualization to visualization type used by annotations
        if (cat === 'activities') {
            if (viz === 'scatterPlot') return 'scatter';
            if (viz === 'lineGraph') return 'line';
        } else if (cat === 'goals') {
            if (viz === 'completionTimeline') return 'timeline';
            if (viz === 'timeDistribution') return 'distribution';
            if (viz === 'goalDetail') return 'goalDetail';
            if (viz === 'stats') return 'goalStats';
        } else if (cat === 'sessions') {
            if (viz === 'weeklyChart') return 'bar';
            if (viz === 'heatmap') return 'heatmap';
            if (viz === 'streaks') return 'streaks';
            if (viz === 'stats') return 'sessionStats';
        }

        return null;
    };

    // Helper to extract context from window state
    const getVisualizationContext = (state) => {
        if (!state) return {};

        const context = {};

        // Add activity_id for activity visualizations
        if (state.selectedCategory === 'activities' && state.selectedActivity?.id) {
            context.activity_id = state.selectedActivity.id;
        }

        // Add goal_id for goal detail visualization
        if (state.selectedCategory === 'goals' && state.selectedVisualization === 'goalDetail' && state.selectedGoal?.id) {
            context.goal_id = state.selectedGoal.id;
        }

        // Add time_range for heatmap
        if (state.selectedCategory === 'sessions' && state.selectedVisualization === 'heatmap') {
            context.time_range = state.heatmapMonths || 12;
        }

        return context;
    };

    // Get goal type color
    const getGoalTypeColor = (type) => {
        return GOAL_COLOR_SYSTEM[type]?.primary || '#666';
    };

    // Prepare goal chart data
    const getActivityChartData = () => {
        if (!selectedGoal?.activity_breakdown?.length) {
            return { labels: [], datasets: [] };
        }
        const sortedActivities = [...selectedGoal.activity_breakdown]
            .sort((a, b) => b.instance_count - a.instance_count);
        return {
            labels: sortedActivities.map(a => a.activity_name),
            datasets: [{
                label: 'Instances',
                data: sortedActivities.map(a => a.instance_count),
                backgroundColor: '#2196f3',
                borderColor: '#1976d2',
                borderWidth: 1,
                borderRadius: 4
            }]
        };
    };

    const getDurationChartData = () => {
        if (!selectedGoal?.session_durations_by_date?.length) {
            return { labels: [], datasets: [] };
        }
        return {
            labels: selectedGoal.session_durations_by_date.map(s => new Date(s.date)),
            datasets: [{
                label: 'Duration (minutes)',
                data: selectedGoal.session_durations_by_date.map(s => Math.round(s.duration_seconds / 60)),
                borderColor: '#4caf50',
                backgroundColor: 'rgba(76, 175, 80, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        };
    };

    const activityChartOptions = {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(30, 30, 30, 0.95)',
                titleColor: '#fff',
                bodyColor: '#ccc',
                padding: 12,
                callbacks: {
                    label: (ctx) => `${ctx.raw} instance${ctx.raw !== 1 ? 's' : ''}`
                }
            }
        },
        scales: {
            x: {
                beginAtZero: true,
                ticks: { color: '#888', stepSize: 1 },
                grid: { color: '#333' }
            },
            y: {
                ticks: { color: '#ccc', font: { size: 11 } },
                grid: { display: false }
            }
        }
    };

    const durationChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(30, 30, 30, 0.95)',
                titleColor: '#fff',
                bodyColor: '#ccc',
                padding: 12,
                callbacks: {
                    title: (ctx) => {
                        const date = new Date(ctx[0].label);
                        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    },
                    label: (ctx) => {
                        const minutes = ctx.raw;
                        if (minutes >= 60) {
                            return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
                        }
                        return `${minutes}m`;
                    }
                }
            }
        },
        scales: {
            x: {
                type: 'time',
                time: { unit: 'day', displayFormats: { day: 'MMM d' } },
                ticks: { color: '#888' },
                grid: { color: '#333' }
            },
            y: {
                beginAtZero: true,
                title: { display: true, text: 'Duration (min)', color: '#888' },
                ticks: { color: '#888' },
                grid: { color: '#333' }
            }
        }
    };

    // Category icons for compact mode
    const categoryIcons = {
        goals: '🎯',
        sessions: '⏱️',
        activities: '🏋️',
        annotations: '📝'
    };

    // Render the category selector buttons
    const renderCategorySelector = () => (
        <div style={{
            display: 'flex',
            gap: isNarrow ? '2px' : '4px',
            padding: isNarrow ? '8px 8px' : '12px 16px',
            borderBottom: '1px solid #333',
            background: '#252525',
            flexWrap: isVeryNarrow ? 'wrap' : 'nowrap',
            alignItems: 'center'
        }}>
            {/* Main category buttons */}
            {['goals', 'sessions', 'activities'].map(category => (
                <button
                    key={category}
                    onClick={(e) => {
                        e.stopPropagation();
                        handleCategoryChange(category);
                    }}
                    title={category.charAt(0).toUpperCase() + category.slice(1)}
                    style={{
                        flex: isVeryNarrow ? '1 1 30%' : 1,
                        padding: isVeryNarrow ? '6px 4px' : (isNarrow ? '8px 8px' : '10px 16px'),
                        background: selectedCategory === category ? '#2196f3' : '#333',
                        border: 'none',
                        borderRadius: '6px',
                        color: selectedCategory === category ? 'white' : '#888',
                        fontSize: isVeryNarrow ? '11px' : (isNarrow ? '11px' : '13px'),
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        textTransform: 'capitalize',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        minWidth: 0
                    }}
                >
                    {isVeryNarrow ? (
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                            <span>{categoryIcons[category]}</span>
                            <span style={{ fontSize: '10px' }}>{category.slice(0, 4)}</span>
                        </span>
                    ) : isNarrow ? (
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                            <span>{categoryIcons[category]}</span>
                            <span>{category.slice(0, 5)}</span>
                        </span>
                    ) : (
                        category
                    )}
                </button>
            ))}

            {/* Divider between main categories and annotations */}
            <div style={{
                width: '1px',
                height: isNarrow ? '20px' : '24px',
                background: '#444',
                margin: isNarrow ? '0 4px' : '0 8px',
                flexShrink: 0
            }} />

            {/* Annotations button - smaller and separate */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onAnnotationsClick ? onAnnotationsClick() : handleCategoryChange('annotations');
                }}
                title="Annotations"
                style={{
                    flex: 'none',
                    padding: isVeryNarrow ? '6px 8px' : (isNarrow ? '8px 10px' : '10px 14px'),
                    background: selectedCategory === 'annotations' ? '#2196f3' : '#333',
                    border: 'none',
                    borderRadius: '6px',
                    color: selectedCategory === 'annotations' ? 'white' : '#888',
                    fontSize: isVeryNarrow ? '11px' : (isNarrow ? '11px' : '12px'),
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                }}
            >
                <span>{categoryIcons.annotations}</span>
                {!isVeryNarrow && <span>{isNarrow ? 'Notes' : 'Annotations'}</span>}
            </button>

            {/* Split/Close buttons */}
            <div style={{
                display: 'flex',
                gap: '4px',
                marginLeft: isVeryNarrow ? '0' : 'auto',
                position: 'relative',
                ...(isVeryNarrow && { width: '100%', marginTop: '4px', justifyContent: 'flex-end' })
            }}>
                {canSplit && (
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowSplitMenu(!showSplitMenu);
                            }}
                            title="Split profile window"
                            style={{
                                padding: isNarrow ? '6px 8px' : '8px 12px',
                                background: showSplitMenu ? '#444' : '#333',
                                border: '1px solid #444',
                                borderRadius: '6px',
                                color: '#888',
                                fontSize: isNarrow ? '12px' : '14px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                            onMouseEnter={(e) => {
                                if (!showSplitMenu) {
                                    e.currentTarget.style.background = '#444';
                                    e.currentTarget.style.borderColor = '#555';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!showSplitMenu) {
                                    e.currentTarget.style.background = '#333';
                                    e.currentTarget.style.borderColor = '#444';
                                }
                            }}
                        >
                            {isNarrow ? '⊞▾' : '⊞ Split ▾'}
                        </button>

                        {/* Split dropdown menu */}
                        {showSplitMenu && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: '100%',
                                    right: 0,
                                    marginTop: '4px',
                                    background: '#2a2a2a',
                                    border: '1px solid #444',
                                    borderRadius: '6px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                    zIndex: 100,
                                    minWidth: '160px',
                                    overflow: 'hidden'
                                }}
                            >
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onSplit('vertical');
                                        setShowSplitMenu(false);
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '10px 14px',
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#ccc',
                                        fontSize: '13px',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#333'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <span style={{ fontSize: '16px' }}>◫</span>
                                    Split Vertical
                                    <span style={{ fontSize: '10px', color: '#666', marginLeft: 'auto' }}>Side by side</span>
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onSplit('horizontal');
                                        setShowSplitMenu(false);
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '10px 14px',
                                        background: 'transparent',
                                        border: 'none',
                                        borderTop: '1px solid #333',
                                        color: '#ccc',
                                        fontSize: '13px',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#333'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <span style={{ fontSize: '16px' }}>⬓</span>
                                    Split Horizontal
                                    <span style={{ fontSize: '10px', color: '#666', marginLeft: 'auto' }}>Stacked</span>
                                </button>
                            </div>
                        )}
                    </div>
                )}
                {canClose && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                        title="Close window"
                        style={{
                            padding: '8px 12px',
                            background: '#333',
                            border: '1px solid #444',
                            borderRadius: '6px',
                            color: '#888',
                            fontSize: '14px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                            e.target.style.background = '#5c3030';
                            e.target.style.borderColor = '#744';
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.background = '#333';
                            e.target.style.borderColor = '#444';
                        }}
                    >
                        ✕
                    </button>
                )}
            </div>
        </div>
    );

    // Render visualization options for selected category
    const renderVisualizationOptions = () => {
        if (!selectedCategory) return null;

        const categoryVis = visualizations[selectedCategory];
        if (!categoryVis || categoryVis.length === 0) return null;

        return (
            <div style={{
                display: 'flex',
                gap: '8px',
                padding: '12px 16px',
                borderBottom: '1px solid #333',
                background: '#1e1e1e',
                flexWrap: 'wrap'
            }}>
                {categoryVis.map(vis => (
                    <button
                        key={vis.id}
                        onClick={() => setSelectedVisualization(vis.id)}
                        style={{
                            padding: '8px 14px',
                            background: selectedVisualization === vis.id ? '#2196f3' : '#333',
                            border: `1px solid ${selectedVisualization === vis.id ? '#1976d2' : '#444'}`,
                            borderRadius: '6px',
                            color: selectedVisualization === vis.id ? 'white' : '#888',
                            fontSize: '12px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <span>{vis.icon}</span>
                        {vis.name}
                    </button>
                ))}
            </div>
        );
    };

    // Render activity selector for activity visualizations
    const renderActivitySelector = () => {
        if (selectedCategory !== 'activities' || !selectedVisualization) return null;

        const sortedActivities = [...activities].sort((a, b) => {
            const aInstances = activityInstances[a.id] || [];
            const bInstances = activityInstances[b.id] || [];
            if (aInstances.length === 0 && bInstances.length === 0) return 0;
            if (aInstances.length === 0) return 1;
            if (bInstances.length === 0) return -1;
            const aLatest = aInstances.reduce((latest, inst) => {
                const instDate = new Date(inst.session_date);
                return instDate > latest ? instDate : latest;
            }, new Date(0));
            const bLatest = bInstances.reduce((latest, inst) => {
                const instDate = new Date(inst.session_date);
                return instDate > latest ? instDate : latest;
            }, new Date(0));
            return bLatest - aLatest;
        });

        const currentActivityDef = selectedActivity ? activities.find(a => a.id === selectedActivity.id) : null;
        const hasSplits = currentActivityDef?.has_splits && currentActivityDef?.split_definitions?.length > 0;

        return (
            <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid #333',
                background: '#1e1e1e',
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
                flexWrap: 'wrap'
            }}>
                <select
                    value={selectedActivity?.id || ''}
                    onChange={(e) => {
                        const activity = activities.find(a => a.id === e.target.value);
                        setSelectedActivity(activity || null);
                        setSelectedSplit('all');
                    }}
                    style={{
                        padding: '8px 12px',
                        background: '#333',
                        border: '1px solid #444',
                        borderRadius: '6px',
                        color: 'white',
                        fontSize: '12px',
                        minWidth: '200px'
                    }}
                >
                    <option value="">Select Activity...</option>
                    {sortedActivities.map(activity => (
                        <option key={activity.id} value={activity.id}>
                            {activity.name} ({(activityInstances[activity.id] || []).length} instances)
                        </option>
                    ))}
                </select>

                {selectedActivity && currentActivityDef?.has_sets && (
                    <select
                        value={setsHandling}
                        onChange={(e) => setSetsHandling(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            background: '#333',
                            border: '1px solid #444',
                            borderRadius: '6px',
                            color: 'white',
                            fontSize: '12px'
                        }}
                    >
                        <option value="top">Top Set</option>
                        <option value="average">Average</option>
                    </select>
                )}

                {selectedActivity && hasSplits && (
                    <select
                        value={selectedSplit}
                        onChange={(e) => setSelectedSplit(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            background: '#333',
                            border: '1px solid #444',
                            borderRadius: '6px',
                            color: 'white',
                            fontSize: '12px'
                        }}
                    >
                        <option value="all">All Splits</option>
                        {currentActivityDef.split_definitions.map(split => (
                            <option key={split.id} value={split.id}>{split.name}</option>
                        ))}
                    </select>
                )}
            </div>
        );
    };

    // Render goal selector for goal detail visualization
    const renderGoalSelector = () => {
        if (selectedCategory !== 'goals' || selectedVisualization !== 'goalDetail') return null;

        const goals = goalAnalytics?.goals || [];

        return (
            <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid #333',
                background: '#1e1e1e',
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
                flexWrap: 'wrap'
            }}>
                <select
                    value={selectedGoal?.id || ''}
                    onChange={(e) => {
                        const goal = goals.find(g => g.id === e.target.value);
                        setSelectedGoal(goal || null);
                    }}
                    style={{
                        padding: '8px 12px',
                        background: '#333',
                        border: '1px solid #444',
                        borderRadius: '6px',
                        color: 'white',
                        fontSize: '12px',
                        minWidth: '250px'
                    }}
                >
                    <option value="">Select Goal...</option>
                    {goals.map(goal => (
                        <option key={goal.id} value={goal.id}>
                            {goal.name} ({goal.session_count} sessions)
                        </option>
                    ))}
                </select>

                {selectedGoal && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                            onClick={() => setSelectedGoalChart('duration')}
                            style={{
                                padding: '6px 12px',
                                background: selectedGoalChart === 'duration' ? '#2196f3' : '#333',
                                border: 'none',
                                borderRadius: '4px',
                                color: selectedGoalChart === 'duration' ? 'white' : '#888',
                                fontSize: '11px',
                                cursor: 'pointer'
                            }}
                        >
                            Duration
                        </button>
                        <button
                            onClick={() => setSelectedGoalChart('activity')}
                            style={{
                                padding: '6px 12px',
                                background: selectedGoalChart === 'activity' ? '#2196f3' : '#333',
                                border: 'none',
                                borderRadius: '4px',
                                color: selectedGoalChart === 'activity' ? 'white' : '#888',
                                fontSize: '11px',
                                cursor: 'pointer'
                            }}
                        >
                            Activities
                        </button>
                    </div>
                )}
            </div>
        );
    };

    // Render the actual visualization content
    const renderVisualizationContent = () => {
        if (!selectedCategory) {
            return (
                <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#666',
                    fontSize: '14px',
                    flexDirection: 'column',
                    gap: '12px'
                }}>
                    <div style={{ fontSize: '32px', opacity: 0.5 }}>📊</div>
                    <div>Select a category above to view analytics</div>
                </div>
            );
        }

        if (!selectedVisualization && selectedCategory !== 'annotations') {
            return (
                <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#666',
                    fontSize: '14px',
                    flexDirection: 'column',
                    gap: '12px'
                }}>
                    <div style={{ fontSize: '32px', opacity: 0.5 }}>
                        {selectedCategory === 'goals' ? '🎯' : selectedCategory === 'sessions' ? '⏱️' : '🏋️'}
                    </div>
                    <div>Select a visualization type above</div>
                </div>
            );
        }

        const summary = goalAnalytics?.summary || {};
        const completedSessions = sessions.filter(s => s.completed);
        const totalDuration = sessions.reduce((sum, s) => sum + (s.total_duration_seconds || 0), 0);
        const avgDuration = sessions.length > 0 ? totalDuration / sessions.length : 0;

        // Goals visualizations
        if (selectedCategory === 'goals') {
            switch (selectedVisualization) {
                case 'stats':
                    return (
                        <div style={{
                            flex: 1,
                            padding: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px',
                            overflowY: 'auto'
                        }}>
                            <h3 style={{ margin: 0, color: '#ccc', fontSize: '16px' }}>Goal Summary</h3>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                <StatCard value={summary.completed_goals || 0} label="Completed" subLabel={`${summary.completion_rate?.toFixed(1) || 0}% rate`} color="#4caf50" />
                                <StatCard value={`${summary.avg_goal_age_days || 0}d`} label="Avg Age" subLabel="Days old" color="#2196f3" />
                                <StatCard value={`${summary.avg_time_to_completion_days || 0}d`} label="Avg to Complete" subLabel="Days" color="#ff9800" />
                                <StatCard value={formatDuration(summary.avg_duration_to_completion_seconds || 0)} label="Avg Time" subLabel="Per goal" color="#9c27b0" />
                            </div>
                        </div>
                    );
                case 'completionTimeline':
                    return (
                        <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column' }}>
                            <AnnotatedChartWrapper
                                chartRef={chartRef}
                                visualizationType="timeline"
                                rootId={rootId}
                                annotationMode={isAnnotating}
                                onSetAnnotationMode={(val) => updateWindowState({ isAnnotating: val })}
                                highlightedAnnotationId={highlightedAnnotationId}
                            >
                                <GoalCompletionTimeline goals={goalAnalytics?.goals || []} chartRef={chartRef} />
                            </AnnotatedChartWrapper>
                        </div>
                    );
                case 'timeDistribution':
                    return (
                        <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column' }}>
                            <AnnotatedChartWrapper
                                chartRef={chartRef}
                                visualizationType="distribution"
                                rootId={rootId}
                                annotationMode={isAnnotating}
                                onSetAnnotationMode={(val) => updateWindowState({ isAnnotating: val })}
                                highlightedAnnotationId={highlightedAnnotationId}
                            >
                                <GoalTimeDistribution goals={goalAnalytics?.goals || []} chartRef={chartRef} />
                            </AnnotatedChartWrapper>
                        </div>
                    );
                case 'goalDetail':
                    if (!selectedGoal) {
                        return (
                            <div style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#666',
                                fontSize: '14px'
                            }}>
                                Select a goal above to view details
                            </div>
                        );
                    }
                    return (
                        <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Goal header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <h3 style={{ margin: 0, color: '#fff', fontSize: '16px' }}>{selectedGoal.name}</h3>
                                <span style={{
                                    padding: '4px 10px',
                                    background: getGoalTypeColor(selectedGoal.type),
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    color: 'white'
                                }}>
                                    {selectedGoal.type.replace('Goal', '')}
                                </span>
                            </div>
                            {/* Goal stats */}
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                <StatCard value={formatDuration(selectedGoal.total_duration_seconds || 0)} label="Total Time" color="#2196f3" />
                                <StatCard value={selectedGoal.session_count || 0} label="Sessions" color="#4caf50" />
                                <StatCard value={`${selectedGoal.age_days || 0}d`} label="Goal Age" color="#ff9800" />
                            </div>
                            {/* Chart */}
                            <div style={{ flex: 1, position: 'relative', minHeight: '200px' }}>
                                {selectedGoalChart === 'duration' ? (
                                    selectedGoal.session_durations_by_date?.length > 0 ? (
                                        <Line data={getDurationChartData()} options={durationChartOptions} />
                                    ) : (
                                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
                                            No session data available
                                        </div>
                                    )
                                ) : (
                                    selectedGoal.activity_breakdown?.length > 0 ? (
                                        <Bar data={getActivityChartData()} options={activityChartOptions} />
                                    ) : (
                                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
                                            No activities recorded
                                        </div>
                                    )
                                )}
                            </div>
                        </div>
                    );
            }
        }

        // Sessions visualizations
        if (selectedCategory === 'sessions') {
            switch (selectedVisualization) {
                case 'stats':
                    return (
                        <div style={{
                            flex: 1,
                            padding: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px',
                            overflowY: 'auto'
                        }}>
                            <h3 style={{ margin: 0, color: '#ccc', fontSize: '16px' }}>Session Summary</h3>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                <StatCard value={sessions.length} label="Total Sessions" subLabel="All time" color="#2196f3" />
                                <StatCard value={completedSessions.length} label="Completed" subLabel={`${sessions.length > 0 ? Math.round((completedSessions.length / sessions.length) * 100) : 0}% rate`} color="#4caf50" />
                                <StatCard value={formatDuration(totalDuration)} label="Total Time" subLabel="Practiced" color="#ff9800" />
                                <StatCard value={formatDuration(avgDuration)} label="Avg Duration" subLabel="Per session" color="#9c27b0" />
                            </div>
                        </div>
                    );
                case 'heatmap': {
                    const timeRangeOptions = [
                        { value: 12, label: '1 Year' },
                        { value: 6, label: '6 Months' },
                        { value: 3, label: '3 Months' },
                        { value: 1, label: '1 Month' }
                    ];
                    return (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', padding: '16px' }}>
                            {/* Time range selector */}
                            <div style={{
                                display: 'flex',
                                gap: '8px',
                                padding: '12px 16px',
                                marginBottom: '16px',
                                background: '#252525',
                                borderRadius: '8px',
                                alignItems: 'center'
                            }}>
                                <span style={{ color: '#888', fontSize: '12px', marginRight: '8px' }}>
                                    Time Range:
                                </span>
                                {timeRangeOptions.map(option => (
                                    <button
                                        key={option.value}
                                        onClick={() => setHeatmapMonths(option.value)}
                                        style={{
                                            padding: '6px 14px',
                                            background: heatmapMonths === option.value ? '#2196f3' : '#333',
                                            border: 'none',
                                            borderRadius: '4px',
                                            color: heatmapMonths === option.value ? 'white' : '#888',
                                            fontSize: '12px',
                                            fontWeight: 500,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                            {/* Annotated Heatmap with selection support */}
                            <AnnotatedHeatmap
                                sessions={sessions}
                                months={heatmapMonths || 12}
                                rootId={rootId}
                            />
                        </div>
                    );
                }
                case 'streaks':
                    return (
                        <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <StreakTimeline sessions={sessions} />
                        </div>
                    );
                case 'weeklyChart':
                    return (
                        <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <AnnotatedChartWrapper
                                chartRef={chartRef}
                                visualizationType="bar"
                                rootId={rootId}
                                annotationMode={isAnnotating}
                                onSetAnnotationMode={(val) => updateWindowState({ isAnnotating: val })}
                                highlightedAnnotationId={highlightedAnnotationId}
                            >
                                <WeeklyBarChart sessions={sessions} weeks={12} chartRef={chartRef} />
                            </AnnotatedChartWrapper>
                        </div>
                    );
            }
        }

        // Activities visualizations
        if (selectedCategory === 'activities') {
            if (!selectedActivity) {
                return (
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#666',
                        fontSize: '14px'
                    }}>
                        Select an activity above to view data
                    </div>
                );
            }

            switch (selectedVisualization) {
                case 'scatterPlot':
                    return (
                        <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <AnnotatedChartWrapper
                                chartRef={chartRef}
                                visualizationType="scatter"
                                rootId={rootId}
                                context={{ activity_id: selectedActivity?.id }}
                                annotationMode={isAnnotating}
                                onSetAnnotationMode={(val) => updateWindowState({ isAnnotating: val })}
                                highlightedAnnotationId={highlightedAnnotationId}
                            >
                                <ScatterPlot
                                    selectedActivity={selectedActivity}
                                    activityInstances={activityInstances}
                                    activities={activities}
                                    setsHandling={setsHandling}
                                    selectedSplit={selectedSplit}
                                    chartRef={chartRef}
                                />
                            </AnnotatedChartWrapper>
                        </div>
                    );
                case 'lineGraph':
                    return (
                        <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <AnnotatedChartWrapper
                                chartRef={chartRef}
                                visualizationType="line"
                                rootId={rootId}
                                context={{ activity_id: selectedActivity?.id }}
                                annotationMode={isAnnotating}
                                onSetAnnotationMode={(val) => updateWindowState({ isAnnotating: val })}
                                highlightedAnnotationId={highlightedAnnotationId}
                            >
                                <LineGraph
                                    selectedActivity={selectedActivity}
                                    activityInstances={activityInstances}
                                    activities={activities}
                                    selectedMetric={selectedMetric}
                                    setSelectedMetric={setSelectedMetric}
                                    selectedMetricY2={selectedMetricY2}
                                    setSelectedMetricY2={setSelectedMetricY2}
                                    setsHandling={setsHandling}
                                    selectedSplit={selectedSplit}
                                    chartRef={chartRef}
                                />
                            </AnnotatedChartWrapper>
                        </div>
                    );
            }
        }

        // Annotations view
        if (selectedCategory === 'annotations') {
            // Get visualization type and context from source window
            const sourceVizType = getVisualizationType(sourceWindowState);
            const sourceContext = getVisualizationContext(sourceWindowState);

            // Debug logging
            console.log('ProfileWindow Annotations View:', {
                sourceWindowState,
                sourceVizType,
                sourceContext,
                rootId
            });

            return (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <AnnotationsList
                        rootId={rootId}
                        visualizationType={sourceVizType}
                        context={sourceContext}
                        isAnnotating={sourceWindowState?.isAnnotating}
                        onToggleAnnotationMode={() => updateSourceWindowState && updateSourceWindowState({ isAnnotating: !sourceWindowState?.isAnnotating })}
                        highlightedAnnotationId={highlightedAnnotationId}
                        onHighlight={setHighlightedAnnotationId}
                    />
                </div>
            );
        }

        return null;
    };

    // Whether this is a visualization window (not annotations)
    const isVisualizationWindow = selectedCategory !== 'annotations';

    return (
        <div
            ref={containerRef}
            onClick={() => {
                // Only allow selection for visualization windows
                if (isVisualizationWindow && onSelect) {
                    onSelect();
                }
            }}
            style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                background: '#1a1a1a',
                // Show selection indicator only when there's an annotations window open
                border: isVisualizationWindow && isSelected && hasAnnotationsWindow
                    ? '2px solid #2196f3'
                    : '1px solid #333',
                borderRadius: '8px',
                overflow: 'hidden',
                minWidth: 0,
                position: 'relative',
                cursor: isVisualizationWindow && hasAnnotationsWindow ? 'pointer' : 'default',
                // Add a subtle glow for selected window when annotations are open
                boxShadow: isVisualizationWindow && isSelected && hasAnnotationsWindow
                    ? '0 0 12px rgba(33, 150, 243, 0.3)'
                    : 'none',
                transition: 'border 0.2s ease, box-shadow 0.2s ease'
            }}
        >
            {renderCategorySelector()}
            {renderVisualizationOptions()}
            {renderActivitySelector()}
            {renderGoalSelector()}
            {renderVisualizationContent()}
        </div>
    );
}

// StatCard helper component
function StatCard({ value, label, subLabel, color }) {
    return (
        <div style={{
            background: '#252525',
            border: '1px solid #333',
            borderRadius: '6px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flex: '1 1 140px',
            minWidth: '140px'
        }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color }}>
                {value}
            </div>
            <div>
                <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {label}
                </div>
                {subLabel && (
                    <div style={{ fontSize: '10px', color: '#666' }}>
                        {subLabel}
                    </div>
                )}
            </div>
        </div>
    );
}

export default ProfileWindow;
