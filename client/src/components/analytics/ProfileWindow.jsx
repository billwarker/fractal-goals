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
import { useTheme } from '../../contexts/ThemeContext';
import styles from './ProfileWindow.module.css';

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
    const { getGoalColor } = useTheme();
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

    const handleBack = () => {
        if (selectedVisualization) {
            updateWindowState({
                selectedVisualization: null,
                selectedActivity: null,
                selectedGoal: null,
                isAnnotating: false
            });
        } else if (selectedCategory) {
            updateWindowState({
                selectedCategory: null,
                selectedVisualization: null,
                selectedActivity: null,
                selectedGoal: null,
                isAnnotating: false
            });
        }
    };

    const handleTop = () => {
        updateWindowState({
            selectedCategory: null,
            selectedVisualization: null,
            selectedActivity: null,
            selectedGoal: null,
            isAnnotating: false
        });
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
        return getGoalColor(type);
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

    const renderUnifiedHeader = () => {
        const hasCategory = !!selectedCategory;
        const hasViz = !!selectedVisualization;

        return (
            <div className={`${styles.header} ${isVeryNarrow ? styles.wrap : ''}`}>
                {/* Navigation Controls (Back/Top) */}
                {hasCategory && (
                    <div className={styles.navGroup}>
                        <button
                            onClick={handleTop}
                            title="Top Level (All Categories)"
                            className={styles.navBtn}
                        >
                            🏠
                        </button>
                        <button
                            onClick={handleBack}
                            title="Go Back"
                            className={styles.navBtn}
                        >
                            ⬅️
                        </button>
                    </div>
                )}

                {/* Main Action Area */}
                <div className={styles.mainActions}>
                    {!hasCategory && renderLevel0()}
                    {hasCategory && !hasViz && renderLevel1()}
                    {hasCategory && hasViz && renderLevel2()}
                </div>

                {/* Global Actions (Annotations, Split, Close) */}
                <div className={styles.globalActions}>
                    {(!hasAnnotationsWindow || selectedCategory === 'annotations') && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onAnnotationsClick ? onAnnotationsClick() : handleCategoryChange('annotations');
                            }}
                            title="View Annotations"
                            className={`${styles.navBtn} ${styles.btnAnnotations} ${selectedCategory === 'annotations' ? styles.active : ''} ${isNarrow ? styles.narrow : ''}`}
                        >
                            <span>📝</span>
                            {!isNarrow && <span style={{ marginLeft: '4px' }}>Annotations</span>}
                        </button>
                    )}

                    {canSplit && (
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowSplitMenu(!showSplitMenu);
                                }}
                                className={`${styles.navBtn} ${styles.btnSplit}`}
                            >
                                {isNarrow ? '⊞▾' : '⊞ Split ▾'}
                            </button>
                            {showSplitMenu && (
                                <div className={styles.splitMenu}>
                                    <button onClick={(e) => { e.stopPropagation(); onSplit('vertical'); setShowSplitMenu(false); }}
                                        className={styles.splitMenuItem}>
                                        <span style={{ fontSize: '16px' }}>◫</span> Split Vertical
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); onSplit('horizontal'); setShowSplitMenu(false); }}
                                        className={styles.splitMenuItem}>
                                        <span style={{ fontSize: '16px' }}>⬓</span> Split Horizontal
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                    {canClose && (
                        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className={styles.navBtn}>✕</button>
                    )}
                </div>
            </div>
        );
    };

    const renderLevel0 = () => (
        <>
            {['goals', 'sessions', 'activities'].map(category => (
                <button
                    key={category}
                    onClick={() => handleCategoryChange(category)}
                    className={`${styles.levelBtn} ${selectedCategory === category ? styles.active : ''}`}
                >
                    {categoryIcons[category]} {category.charAt(0).toUpperCase() + category.slice(1)}
                </button>
            ))}
        </>
    );

    const renderLevel1 = () => (
        <>
            <span className={styles.levelLabel}>
                {selectedCategory}:
            </span>
            {visualizations[selectedCategory]?.map(vis => (
                <button
                    key={vis.id}
                    onClick={() => setSelectedVisualization(vis.id)}
                    className={`${styles.levelBtn} ${selectedVisualization === vis.id ? styles.active : ''}`}
                >
                    {vis.icon} {vis.name}
                </button>
            ))}
        </>
    );

    const renderLevel2 = () => {
        // Special renderers for Level 2 based on selected visualization
        if (selectedCategory === 'sessions' && selectedVisualization === 'heatmap') {
            const timeRangeOptions = [
                { value: 12, label: '1 Year' }, { value: 6, label: '6 Months' },
                { value: 3, label: '3 Months' }, { value: 1, label: '1 Month' }
            ];
            return (
                <>
                    <span className={styles.levelLabel} style={{ marginRight: '8px' }}>Range:</span>
                    {timeRangeOptions.map(option => (
                        <button
                            key={option.value}
                            onClick={() => setHeatmapMonths(option.value)}
                            className={`${styles.levelBtn} ${heatmapMonths === option.value ? styles.active : ''}`}
                        >
                            {option.label}
                        </button>
                    ))}
                </>
            );
        }

        if (selectedCategory === 'activities') {
            const sortedActivities = [...activities].sort((a, b) => (activityInstances[b.id]?.length || 0) - (activityInstances[a.id]?.length || 0));
            const currentActivityDef = selectedActivity ? activities.find(a => a.id === selectedActivity.id) : null;

            return (
                <div className={styles.level2Container}>
                    <select
                        value={selectedActivity?.id || ''}
                        onChange={(e) => {
                            const activity = activities.find(a => a.id === e.target.value);
                            setSelectedActivity(activity || null);
                            setSelectedSplit('all');
                        }}
                        className={styles.select}
                    >
                        <option value="">Select Activity...</option>
                        {sortedActivities.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>

                    {selectedActivity && currentActivityDef?.has_sets && (
                        <select
                            value={setsHandling}
                            onChange={(e) => setSetsHandling(e.target.value)}
                            className={styles.select}
                        >
                            <option value="top">Top Set</option>
                            <option value="average">Avg</option>
                        </select>
                    )}

                    {selectedActivity && currentActivityDef?.has_splits && currentActivityDef?.split_definitions?.length > 0 && (
                        <select
                            value={selectedSplit}
                            onChange={(e) => setSelectedSplit(e.target.value)}
                            className={styles.select}
                        >
                            <option value="all">All Splits</option>
                            {currentActivityDef.split_definitions.map(split => (
                                <option key={split.id} value={split.id}>{split.name}</option>
                            ))}
                        </select>
                    )}
                </div>
            );
        }

        if (selectedCategory === 'goals' && selectedVisualization === 'goalDetail') {
            const goals = goalAnalytics?.goals || [];
            return (
                <div className={styles.level2Container}>
                    <select
                        value={selectedGoal?.id || ''}
                        onChange={(e) => setSelectedGoal(goals.find(g => g.id === e.target.value) || null)}
                        className={styles.select}
                    >
                        <option value="">Select Goal...</option>
                        {goals.map(g => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                    </select>
                    {selectedGoal && (
                        <div className={styles.controlGroup}>
                            <button onClick={() => setSelectedGoalChart('duration')} className={`${styles.levelBtn} ${selectedGoalChart === 'duration' ? styles.active : ''}`}>Time</button>
                            <button onClick={() => setSelectedGoalChart('activity')} className={`${styles.levelBtn} ${selectedGoalChart === 'activity' ? styles.active : ''}`}>Acts</button>
                        </div>
                    )}
                </div>
            );
        }

        // Just show the viz name for others
        return (
            <span className={styles.vizName}>
                {visualizations[selectedCategory]?.find(v => v.id === selectedVisualization)?.name}
            </span>
        );
    };







    // Render the actual visualization content
    const renderVisualizationContent = () => {
        if (!selectedCategory) {
            return (
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>📊</div>
                    <div>Select a category above to view analytics</div>
                </div>
            );
        }

        if (!selectedVisualization && selectedCategory !== 'annotations') {
            return (
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>
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
                        <div className={styles.vizContainer}>
                            <h3 className={styles.vizTitle}>Goal Summary</h3>
                            <div className={styles.statsGrid}>
                                <StatCard value={summary.completed_goals || 0} label="Completed" subLabel={`${summary.completion_rate?.toFixed(1) || 0}% rate`} color="#4caf50" />
                                <StatCard value={`${summary.avg_goal_age_days || 0}d`} label="Avg Age" subLabel="Days old" color="#2196f3" />
                                <StatCard value={`${summary.avg_time_to_completion_days || 0}d`} label="Avg to Complete" subLabel="Days" color="#ff9800" />
                                <StatCard value={formatDuration(summary.avg_duration_to_completion_seconds || 0)} label="Avg Time" subLabel="Per goal" color="#9c27b0" />
                            </div>
                        </div>
                    );
                case 'completionTimeline':
                    return (
                        <div className={styles.vizContainerHidden}>
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
                        <div className={styles.vizContainerHidden}>
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
                            <div className={styles.emptyState}>
                                Select a goal above to view details
                            </div>
                        );
                    }
                    return (
                        <div className={styles.vizContainer}>
                            {/* Goal header */}
                            <div className={styles.goalHeader}>
                                <h3 className={styles.goalTitle}>{selectedGoal.name}</h3>
                                <span className={styles.goalBadge} style={{ background: getGoalTypeColor(selectedGoal.type) }}>
                                    {selectedGoal.type.replace('Goal', '')}
                                </span>
                            </div>
                            {/* Goal stats */}
                            <div className={styles.statsGrid}>
                                <StatCard value={formatDuration(selectedGoal.total_duration_seconds || 0)} label="Total Time" color="#2196f3" />
                                <StatCard value={selectedGoal.session_count || 0} label="Sessions" color="#4caf50" />
                                <StatCard value={`${selectedGoal.age_days || 0}d`} label="Goal Age" color="#ff9800" />
                            </div>
                            {/* Chart */}
                            <div className={styles.chartContainer}>
                                {selectedGoalChart === 'duration' ? (
                                    selectedGoal.session_durations_by_date?.length > 0 ? (
                                        <Line data={getDurationChartData()} options={durationChartOptions} />
                                    ) : (
                                        <div className={styles.noData}>
                                            No session data available
                                        </div>
                                    )
                                ) : (
                                    selectedGoal.activity_breakdown?.length > 0 ? (
                                        <Bar data={getActivityChartData()} options={activityChartOptions} />
                                    ) : (
                                        <div className={styles.noData}>
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
                        <div className={styles.vizContainer}>
                            <h3 className={styles.vizTitle}>Session Summary</h3>
                            <div className={styles.statsGrid}>
                                <StatCard value={sessions.length} label="Total Sessions" subLabel="All time" color="#2196f3" />
                                <StatCard value={completedSessions.length} label="Completed" subLabel={`${sessions.length > 0 ? Math.round((completedSessions.length / sessions.length) * 100) : 0}% rate`} color="#4caf50" />
                                <StatCard value={formatDuration(totalDuration)} label="Total Time" subLabel="Practiced" color="#ff9800" />
                                <StatCard value={formatDuration(avgDuration)} label="Avg Duration" subLabel="Per session" color="#9c27b0" />
                            </div>
                        </div>
                    );
                case 'heatmap': {
                    return (
                        <div className={styles.vizContainerHeatmap}>
                            {/* Annotated Heatmap with selection support */}
                            <AnnotatedHeatmap
                                sessions={sessions}
                                months={heatmapMonths || 12}
                                rootId={rootId}
                                highlightedAnnotationId={highlightedAnnotationId}
                                setHighlightedAnnotationId={setHighlightedAnnotationId}
                            />
                        </div>
                    );
                }
                case 'streaks':
                    return (
                        <div className={styles.vizContainerHidden}>
                            <StreakTimeline sessions={sessions} />
                        </div>
                    );
                case 'weeklyChart':
                    return (
                        <div className={styles.vizContainerHidden}>
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
                    <div className={styles.emptyState}>
                        Select an activity above to view data
                    </div>
                );
            }

            switch (selectedVisualization) {
                case 'scatterPlot':
                    return (
                        <div className={styles.vizContainerHidden}>
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
                        <div className={styles.vizContainerHidden}>
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
                <div className={styles.vizContainerHidden}>
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
            className={`${styles.windowContainer} ${isVisualizationWindow && hasAnnotationsWindow ? styles.selectable : ''} ${isVisualizationWindow && isSelected && hasAnnotationsWindow ? styles.selected : ''}`}
        >
            {renderUnifiedHeader()}
            {renderVisualizationContent()}
        </div>
    );
}

// StatCard helper component
function StatCard({ value, label, subLabel, color }) {
    return (
        <div className={styles.statCard}>
            <div className={styles.statValue} style={{ color }}>
                {value}
            </div>
            <div>
                <div className={styles.statLabel}>
                    {label}
                </div>
                {subLabel && (
                    <div className={styles.statSubLabel}>
                        {subLabel}
                    </div>
                )}
            </div>
        </div>
    );
}

export default ProfileWindow;
