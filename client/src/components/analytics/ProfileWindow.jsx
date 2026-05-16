import React, { useMemo, useRef, useState } from 'react';
import ScatterPlot from './ScatterPlot';
import LineGraph from './LineGraph';
import GoalCompletionTimeline from './GoalCompletionTimeline';
import GoalTimeDistribution from './GoalTimeDistribution';
import ActivityHeatmap from './ActivityHeatmap';
import StreakTimeline from './StreakTimeline';
import WeeklyBarChart from './WeeklyBarChart';
import { Bar, Line } from 'react-chartjs-2';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import Button from '../atoms/Button';
import CloseIcon from '../atoms/CloseIcon';
import Select from '../atoms/Select';
import { Heading } from '../atoms/Typography';
import GoalHierarchySelectionModal from '../goals/GoalHierarchySelectionModal';

import ActivityGraphSelector from './ActivityGraphSelector';
import {
    ActivityFrequencyChart,
    ActivityGroupMixChart,
    ActivityMetricVolumeChart,
    ActivityPersonalBestTrend,
    ActivityTimeByActivity,
    GoalAgingChart,
    GoalCompletionRateByLevel,
    GoalMomentumChart,
    SessionCompletionRateChart,
    SessionConsistencyChart,
    SessionDurationHistogram,
    SessionDurationTrend,
    SessionPlannedVsActualChart,
    SessionSectionPie,
    SessionStartDistribution,
    StaleGoalsChart,
} from './AnalyticsExtraCharts';
import {
    AnalyticsGoalIcon,
    BackIcon,
    ChartIcon,
    HomeIcon,
    LightningIcon,
    SplitIcon,
    TimerIcon,
} from './AnalyticsIcons';
import { DISABLED_CHART_ANIMATION } from './ChartJSWrapper';
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
 * @param {boolean} props.isSelected - Whether this window is selected
 * @param {function} props.onSelect - Callback when the window is clicked to select it
 */
function ProfileWindow({
    canSplit = false,
    onSplit, // Now accepts: onSplit(direction) where direction is 'vertical' or 'horizontal'
    canClose = false,
    onClose,
    data,
    windowState,
    updateWindowState,
    isSelected = false,
    onSelect,
    globalDateRange = null,
    onGlobalDateRangeChange,
}) {
    const { getGoalColor, getGoalSecondaryColor, getGoalIcon } = useGoalLevels();
    const { sessions, goalAnalytics, activities, activityGroups, activityInstances, formatDuration, rootId } = data;
    const chartRef = useRef(null);
    const containerRef = useRef(null);

    // Local state for split dropdown
    const [showSplitMenu, setShowSplitMenu] = useState(false);
    const [isGoalPickerOpen, setIsGoalPickerOpen] = useState(false);

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
    const effectiveSelectedActivity = selectedActivity;
    const effectiveDateRange = globalDateRange;

    // Reset visualization when category changes
    const handleCategoryChange = (category) => {
        if (category !== selectedCategory) {
            updateWindowState({
                selectedCategory: category,
                selectedVisualization: null,
                selectedActivity: null,
                selectedGoal: null,
            });
        }
    };

    const handleBack = () => {
        if (selectedVisualization) {
            updateWindowState({
                selectedVisualization: null,
                selectedActivity: null,
                selectedGoal: null,
            });
        } else if (selectedCategory) {
            updateWindowState({
                selectedCategory: null,
                selectedVisualization: null,
                selectedActivity: null,
                selectedGoal: null,
            });
        }
    };

    const handleTop = () => {
        updateWindowState({
            selectedCategory: null,
            selectedVisualization: null,
            selectedActivity: null,
            selectedModeIds: [],
            selectedGoal: null,
        });
    };

    // Define available visualizations for each category
    const rootGoal = useMemo(() => (
        (goalAnalytics?.goals || []).find((goal) => goal.id === rootId || !goal.parent_id) || null
    ), [goalAnalytics?.goals, rootId]);

    const categoryIcons = {
        goals: <AnalyticsGoalIcon goal={rootGoal} getGoalColor={getGoalColor} getGoalSecondaryColor={getGoalSecondaryColor} getGoalIcon={getGoalIcon} size={16} />,
        sessions: <TimerIcon size={16} />,
        activities: <LightningIcon size={16} />,
    };

    const visualizationIcons = {
        stats: <ChartIcon size={15} />,
        completionTimeline: <ChartIcon size={15} />,
        timeDistribution: <ChartIcon size={15} />,
        goalDetail: <AnalyticsGoalIcon goal={rootGoal} getGoalColor={getGoalColor} getGoalSecondaryColor={getGoalSecondaryColor} getGoalIcon={getGoalIcon} size={15} />,
        completionRateByLevel: <ChartIcon size={15} />,
        goalAging: <ChartIcon size={15} />,
        goalMomentum: <ChartIcon size={15} />,
        staleGoals: <ChartIcon size={15} />,
        heatmap: <ChartIcon size={15} />,
        streaks: <ChartIcon size={15} />,
        weeklyChart: <ChartIcon size={15} />,
        durationTrend: <ChartIcon size={15} />,
        sectionPie: <ChartIcon size={15} />,
        completionRate: <ChartIcon size={15} />,
        startDistribution: <ChartIcon size={15} />,
        durationHistogram: <ChartIcon size={15} />,
        plannedVsActual: <ChartIcon size={15} />,
        consistency: <ChartIcon size={15} />,
        scatterPlot: <ChartIcon size={15} />,
        lineGraph: <ChartIcon size={15} />,
        activityFrequency: <ChartIcon size={15} />,
        timeByActivity: <ChartIcon size={15} />,
        personalBest: <ChartIcon size={15} />,
        metricVolume: <ChartIcon size={15} />,
        groupMix: <ChartIcon size={15} />,
    };

    const visualizations = {
        goals: [
            { id: 'stats', name: 'Summary Stats' },
            { id: 'completionTimeline', name: 'Completion Timeline' },
            { id: 'timeDistribution', name: 'Time Spent Per Goal' },
            { id: 'completionRateByLevel', name: 'Completion Rate' },
            { id: 'goalAging', name: 'Goal Aging' },
            { id: 'goalMomentum', name: 'Goal Momentum' },
            { id: 'staleGoals', name: 'Stale Goals' },
            { id: 'goalDetail', name: 'Goal Detail View' }
        ],
        sessions: [
            { id: 'stats', name: 'Summary Stats' },
            { id: 'durationTrend', name: 'Duration Trend' },
            { id: 'sectionPie', name: 'Section Time' },
            { id: 'heatmap', name: 'Activity Heatmap' },
            { id: 'streaks', name: 'Streak Timeline' },
            { id: 'weeklyChart', name: 'Weekly Chart' },
            { id: 'completionRate', name: 'Completion Rate' },
            { id: 'startDistribution', name: 'Start Times' },
            { id: 'durationHistogram', name: 'Duration Histogram' },
            { id: 'plannedVsActual', name: 'Planned vs Actual' },
            { id: 'consistency', name: 'Consistency' }
        ],
        activities: [
            { id: 'scatterPlot', name: 'Scatter Plot' },
            { id: 'lineGraph', name: 'Line Graph' },
            { id: 'activityFrequency', name: 'Frequency' },
            { id: 'timeByActivity', name: 'Time Per Activity' },
            { id: 'personalBest', name: 'Personal Best' },
            { id: 'metricVolume', name: 'Metric Volume' },
            { id: 'groupMix', name: 'Group Mix' }
        ]
    };

    // Get goal type color
    const getGoalTypeColor = (type) => {
        return getGoalColor(type);
    };

    const filteredSessions = useMemo(() => {
        const start = effectiveDateRange?.start ? new Date(`${effectiveDateRange.start}T00:00:00`) : null;
        const end = effectiveDateRange?.end ? new Date(`${effectiveDateRange.end}T23:59:59`) : null;
        if (!start && !end) {
            return sessions;
        }
        return sessions.filter((session) => {
            const rawDate = session.session_start || session.created_at;
            const date = rawDate ? new Date(rawDate) : null;
            if (!date || Number.isNaN(date.getTime())) {
                return false;
            }
            if (start && date < start) return false;
            if (end && date > end) return false;
            return true;
        });
    }, [effectiveDateRange?.end, effectiveDateRange?.start, sessions]);

    const filteredActivityInstances = useMemo(() => {
        const start = effectiveDateRange?.start ? new Date(`${effectiveDateRange.start}T00:00:00`) : null;
        const end = effectiveDateRange?.end ? new Date(`${effectiveDateRange.end}T23:59:59`) : null;
        if (!start && !end) {
            return activityInstances;
        }
        return Object.fromEntries(Object.entries(activityInstances || {}).map(([activityId, instances]) => [
            activityId,
            (instances || []).filter((instance) => {
                const rawDate = instance.session_date || instance.created_at;
                const date = rawDate ? new Date(rawDate) : null;
                if (!date || Number.isNaN(date.getTime())) {
                    return false;
                }
                if (start && date < start) return false;
                if (end && date > end) return false;
                return true;
            }),
        ]));
    }, [activityInstances, effectiveDateRange?.end, effectiveDateRange?.start]);

    const activityCounts = useMemo(() => Object.fromEntries(
        activities.map((activity) => [activity.id, filteredActivityInstances[activity.id]?.length || 0])
    ), [activities, filteredActivityInstances]);

    const groupCounts = useMemo(() => {
        const childGroupsByParent = new Map();
        activityGroups.forEach((group) => {
            const parentId = group.parent_id || '__root__';
            if (!childGroupsByParent.has(parentId)) {
                childGroupsByParent.set(parentId, []);
            }
            childGroupsByParent.get(parentId).push(group);
        });

        const activitiesByGroup = new Map();
        activities.forEach((activity) => {
            const groupId = activity.group_id || '__ungrouped__';
            if (!activitiesByGroup.has(groupId)) {
                activitiesByGroup.set(groupId, []);
            }
            activitiesByGroup.get(groupId).push(activity);
        });

        const totals = {};
        const collectTotal = (groupId) => {
            const directTotal = (activitiesByGroup.get(groupId) || []).reduce(
                (sum, activity) => sum + (activityCounts[activity.id] || 0),
                0
            );
            const childTotal = (childGroupsByParent.get(groupId) || []).reduce(
                (sum, group) => sum + collectTotal(group.id),
                0
            );
            const total = directTotal + childTotal;
            totals[groupId] = total;
            return total;
        };

        activityGroups.forEach((group) => {
            if (!(group.id in totals)) {
                collectTotal(group.id);
            }
        });

        return totals;
    }, [activities, activityCounts, activityGroups]);

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
        ...DISABLED_CHART_ANIMATION,
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
        ...DISABLED_CHART_ANIMATION,
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

    const renderUnifiedHeader = () => {
        const hasCategory = !!selectedCategory;
        const hasViz = !!selectedVisualization;

        return (
            <div className={`${styles.header} ${isVeryNarrow ? styles.wrap : ''}`}>
                {/* Navigation Controls (Back/Top) */}
                {hasCategory && (
                    <div className={styles.navGroup}>
                        <Button
                            onClick={handleTop}
                            title="Top Level (All Categories)"
                            variant="secondary"
                            size="sm"
                            style={{ padding: '0 8px', minWidth: '32px' }}
                        >
                            <HomeIcon size={15} />
                        </Button>
                        <Button
                            onClick={handleBack}
                            title="Go Back"
                            variant="secondary"
                            size="sm"
                            style={{ padding: '0 8px', minWidth: '32px' }}
                        >
                            <BackIcon size={15} />
                        </Button>
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
                    {canSplit && (
                        <div style={{ position: 'relative' }}>
                            <Button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowSplitMenu(!showSplitMenu);
                                }}
                                variant="secondary"
                                size="sm"
                                style={{ padding: '0 8px' }}
                            >
                                <SplitIcon size={15} />
                                {!isNarrow && <span>Split</span>}
                            </Button>
                            {showSplitMenu && (
                                <div className={styles.splitMenu}>
                                    <button onClick={(e) => { e.stopPropagation(); onSplit('vertical'); setShowSplitMenu(false); }}
                                        className={styles.splitMenuItem}>
                                        <span className={styles.menuIcon}><SplitIcon size={15} /></span> Split Vertical
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); onSplit('horizontal'); setShowSplitMenu(false); }}
                                        className={styles.splitMenuItem}>
                                        <span className={styles.menuIcon}><SplitIcon size={15} /></span> Split Horizontal
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                    {canClose && (
                        <Button
                            onClick={(e) => { e.stopPropagation(); onClose(); }}
                            variant="ghost"
                            size="sm"
                            style={{ padding: '0 8px', minWidth: '32px' }}
                            aria-label="Close analytics window"
                        >
                            <CloseIcon size={16} />
                        </Button>
                    )}
                </div>
            </div>
        );
    };

    const renderLevel0 = () => (
        <>
            {['goals', 'sessions', 'activities'].map(category => (
                <Button
                    key={category}
                    onClick={() => handleCategoryChange(category)}
                    variant={selectedCategory === category ? 'primary' : 'secondary'}
                    size="sm"
                    style={{ whiteSpace: 'nowrap' }}
                >
                    <span className={styles.buttonIcon}>{categoryIcons[category]}</span>
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                </Button>
            ))}
        </>
    );

    const renderLevel1 = () => (
        <>
            <span className={styles.levelLabel}>
                {selectedCategory}:
            </span>
            {visualizations[selectedCategory]?.map(vis => (
                <Button
                    key={vis.id}
                    onClick={() => setSelectedVisualization(vis.id)}
                    variant={selectedVisualization === vis.id ? 'primary' : 'secondary'}
                    size="sm"
                    style={{ whiteSpace: 'nowrap' }}
                >
                    <span className={styles.buttonIcon}>{visualizationIcons[vis.id]}</span>
                    {vis.name}
                </Button>
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
                        <Button
                            key={option.value}
                            onClick={() => setHeatmapMonths(option.value)}
                            variant={heatmapMonths === option.value ? 'primary' : 'secondary'}
                            size="sm"
                        >
                            {option.label}
                        </Button>
                    ))}
                </>
            );
        }

        if (selectedCategory === 'activities') {
            const sortedActivities = [...activities].sort((a, b) => (
                (filteredActivityInstances[b.id]?.length || 0) - (filteredActivityInstances[a.id]?.length || 0)
            ));
            const currentActivityDef = effectiveSelectedActivity ? activities.find(a => a.id === effectiveSelectedActivity.id) : null;

            return (
                <div className={styles.level2Container}>
                    <ActivityGraphSelector
                        activities={sortedActivities}
                        activityGroups={activityGroups}
                        value={effectiveSelectedActivity}
                        activityCounts={activityCounts}
                        groupCounts={groupCounts}
                        onChange={(activity) => {
                            setSelectedActivity(activity || null);
                            setSelectedSplit('all');
                        }}
                    />

                    {effectiveSelectedActivity && currentActivityDef?.has_sets && (
                        <Select
                            value={setsHandling}
                            onChange={(e) => setSetsHandling(e.target.value)}
                            className={styles.selectAtom}
                        >
                            <option value="top">Top Set</option>
                            <option value="average">Avg</option>
                        </Select>
                    )}

                    {effectiveSelectedActivity && currentActivityDef?.has_splits && currentActivityDef?.split_definitions?.length > 0 && (
                        <Select
                            value={selectedSplit}
                            onChange={(e) => setSelectedSplit(e.target.value)}
                            className={styles.selectAtom}
                        >
                            <option value="all">All Splits</option>
                            {currentActivityDef.split_definitions.map(split => (
                                <option key={split.id} value={split.id}>{split.name}</option>
                            ))}
                        </Select>
                    )}

                </div>
            );
        }

        if (selectedCategory === 'goals' && selectedVisualization === 'goalDetail') {
            const goals = goalAnalytics?.goals || [];
            return (
                <div className={styles.level2Container} style={{ gap: '8px' }}>
                    <Button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            setIsGoalPickerOpen(true);
                        }}
                        variant={selectedGoal ? 'primary' : 'secondary'}
                        size="sm"
                    >
                        {selectedGoal ? selectedGoal.name : 'Select Goal'}
                    </Button>
                    {selectedGoal && (
                        <div className={styles.controlGroup}>
                            <Button
                                onClick={() => setSelectedGoalChart('duration')}
                                variant={selectedGoalChart === 'duration' ? 'primary' : 'secondary'}
                                size="sm"
                            >
                                Time
                            </Button>
                            <Button
                                onClick={() => setSelectedGoalChart('activity')}
                                variant={selectedGoalChart === 'activity' ? 'primary' : 'secondary'}
                                size="sm"
                            >
                                Acts
                            </Button>
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
                    <div className={styles.emptyIcon}><ChartIcon size={34} /></div>
                    <div>Select a category above to view analytics</div>
                </div>
            );
        }

        if (!selectedVisualization) {
            return (
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>
                        {categoryIcons[selectedCategory]}
                    </div>
                    <div>Select a visualization type above</div>
                </div>
            );
        }

        const summary = goalAnalytics?.summary || {};
        const completedSessions = filteredSessions.filter(s => s.completed);
        const totalDuration = filteredSessions.reduce((sum, s) => sum + (s.total_duration_seconds || 0), 0);
        const avgDuration = filteredSessions.length > 0 ? totalDuration / filteredSessions.length : 0;

        // Goals visualizations
        if (selectedCategory === 'goals') {
            switch (selectedVisualization) {
                case 'stats':
                    return (
                        <div className={styles.vizContainer}>
                            <Heading level={3} className={styles.vizTitle}>Goal Summary</Heading>
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
                            <GoalCompletionTimeline goals={goalAnalytics?.goals || []} chartRef={chartRef} />
                        </div>
                    );
                case 'timeDistribution':
                    return (
                        <div className={styles.vizContainerHidden}>
                            <GoalTimeDistribution goals={goalAnalytics?.goals || []} chartRef={chartRef} />
                        </div>
                    );
                case 'completionRateByLevel':
                    return <div className={styles.vizContainerHidden}><GoalCompletionRateByLevel goals={goalAnalytics?.goals || []} chartRef={chartRef} /></div>;
                case 'goalAging':
                    return <div className={styles.vizContainerHidden}><GoalAgingChart goals={goalAnalytics?.goals || []} chartRef={chartRef} /></div>;
                case 'goalMomentum':
                    return <div className={styles.vizContainerHidden}><GoalMomentumChart goals={goalAnalytics?.goals || []} chartRef={chartRef} /></div>;
                case 'staleGoals':
                    return <div className={styles.vizContainer}><StaleGoalsChart goals={goalAnalytics?.goals || []} /></div>;
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
                                <Heading level={3} className={styles.goalTitle}>{selectedGoal.name}</Heading>
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
                            <Heading level={3} className={styles.vizTitle}>Session Summary</Heading>
                            <div className={styles.statsGrid}>
                                <StatCard value={filteredSessions.length} label="Total Sessions" subLabel="Selected range" color="#2196f3" />
                                <StatCard value={completedSessions.length} label="Completed" subLabel={`${filteredSessions.length > 0 ? Math.round((completedSessions.length / filteredSessions.length) * 100) : 0}% rate`} color="#4caf50" />
                                <StatCard value={formatDuration(totalDuration)} label="Total Time" subLabel="Practiced" color="#ff9800" />
                                <StatCard value={formatDuration(avgDuration)} label="Avg Duration" subLabel="Per session" color="#9c27b0" />
                            </div>
                        </div>
                    );
                case 'heatmap': {
                    return (
                        <div className={styles.vizContainerHeatmap}>
                            <ActivityHeatmap
                                sessions={filteredSessions}
                                months={heatmapMonths || 12}
                            />
                        </div>
                    );
                }
                case 'streaks':
                    return (
                        <div className={styles.vizContainerHidden}>
                            <StreakTimeline sessions={filteredSessions} />
                        </div>
                    );
                case 'weeklyChart':
                    return (
                        <div className={styles.vizContainerHidden}>
                            <WeeklyBarChart
                                sessions={filteredSessions}
                                weeks={12}
                                chartRef={chartRef}
                                selectedDateRange={effectiveDateRange}
                                onDateRangeChange={onGlobalDateRangeChange}
                            />
                        </div>
                    );
                case 'durationTrend':
                    return <div className={styles.vizContainerHidden}><SessionDurationTrend sessions={filteredSessions} chartRef={chartRef} /></div>;
                case 'sectionPie':
                    return <div className={styles.vizContainerHidden}><SessionSectionPie sessions={filteredSessions} activityInstances={filteredActivityInstances} chartRef={chartRef} /></div>;
                case 'completionRate':
                    return <div className={styles.vizContainerHidden}><SessionCompletionRateChart sessions={filteredSessions} chartRef={chartRef} /></div>;
                case 'startDistribution':
                    return <div className={styles.vizContainerHidden}><SessionStartDistribution sessions={filteredSessions} chartRef={chartRef} /></div>;
                case 'durationHistogram':
                    return <div className={styles.vizContainerHidden}><SessionDurationHistogram sessions={filteredSessions} chartRef={chartRef} /></div>;
                case 'plannedVsActual':
                    return <div className={styles.vizContainerHidden}><SessionPlannedVsActualChart sessions={filteredSessions} chartRef={chartRef} /></div>;
                case 'consistency':
                    return <div className={styles.vizContainerHidden}><SessionConsistencyChart sessions={filteredSessions} chartRef={chartRef} /></div>;
            }
        }

        // Activities visualizations
        if (selectedCategory === 'activities') {
            const activityNeedsSelection = ['scatterPlot', 'lineGraph', 'personalBest', 'metricVolume'].includes(selectedVisualization);
            if (activityNeedsSelection && !effectiveSelectedActivity) {
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
                            <ScatterPlot
                                selectedActivity={effectiveSelectedActivity}
                                activityInstances={filteredActivityInstances}
                                activities={activities}
                                setsHandling={setsHandling}
                                selectedSplit={selectedSplit}
                                chartRef={chartRef}
                            />
                        </div>
                    );
                case 'lineGraph':
                    return (
                        <div className={styles.vizContainerHidden}>
                            <LineGraph
                                selectedActivity={effectiveSelectedActivity}
                                activityInstances={filteredActivityInstances}
                                activities={activities}
                                selectedMetric={selectedMetric}
                                setSelectedMetric={setSelectedMetric}
                                selectedMetricY2={selectedMetricY2}
                                setSelectedMetricY2={setSelectedMetricY2}
                                setsHandling={setsHandling}
                                selectedSplit={selectedSplit}
                                chartRef={chartRef}
                                selectedDateRange={effectiveDateRange}
                                onDateRangeChange={onGlobalDateRangeChange}
                            />
                        </div>
                    );
                case 'activityFrequency':
                    return <div className={styles.vizContainerHidden}><ActivityFrequencyChart activities={activities} activityInstances={filteredActivityInstances} chartRef={chartRef} /></div>;
                case 'timeByActivity':
                    return <div className={styles.vizContainerHidden}><ActivityTimeByActivity activities={activities} activityInstances={filteredActivityInstances} chartRef={chartRef} /></div>;
                case 'personalBest':
                    return <div className={styles.vizContainerHidden}><ActivityPersonalBestTrend selectedActivity={effectiveSelectedActivity} activities={activities} activityInstances={filteredActivityInstances} chartRef={chartRef} /></div>;
                case 'metricVolume':
                    return <div className={styles.vizContainerHidden}><ActivityMetricVolumeChart selectedActivity={effectiveSelectedActivity} activities={activities} activityInstances={filteredActivityInstances} chartRef={chartRef} /></div>;
                case 'groupMix':
                    return <div className={styles.vizContainerHidden}><ActivityGroupMixChart activities={activities} activityGroups={activityGroups} activityInstances={filteredActivityInstances} chartRef={chartRef} /></div>;
            }
        }

        return null;
    };

    return (
        <div
            ref={containerRef}
            onClick={() => {
                if (onSelect) {
                    onSelect();
                }
            }}
            className={`${styles.windowContainer} ${isSelected ? styles.selected : ''}`}
        >
            {renderUnifiedHeader()}
            {renderVisualizationContent()}
            <GoalHierarchySelectionModal
                isOpen={isGoalPickerOpen}
                title="Select Goal"
                goals={goalAnalytics?.goals || []}
                selectedGoalIds={selectedGoal?.id ? [selectedGoal.id] : []}
                selectionMode="single"
                confirmLabel="Select Goal"
                onClose={() => setIsGoalPickerOpen(false)}
                onConfirm={(goalIds) => {
                    const goal = (goalAnalytics?.goals || []).find((item) => item.id === goalIds[0]);
                    setSelectedGoal(goal || null);
                }}
            />
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
