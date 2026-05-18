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
import { Heading } from '../atoms/Typography';

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
    MinimizeHeaderIcon,
    RestoreHeaderIcon,
    SplitIcon,
    TimerIcon,
    VisualizationIcon,
} from './AnalyticsIcons';
import { DISABLED_CHART_ANIMATION } from './ChartJSWrapper';
import { resolveAnalyticsGlobalFilters } from './analyticsGlobalFilters';
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
    globalFilters = null,
}) {
    const { getGoalColor, getGoalSecondaryColor, getGoalIcon } = useGoalLevels();
    const { sessions, goalAnalytics, activities, activityGroups, activityInstances, formatDuration, rootId } = data;
    const chartRef = useRef(null);
    const containerRef = useRef(null);

    // Local state for split dropdown
    const [showSplitMenu, setShowSplitMenu] = useState(false);
    const [isHeaderMinimized, setIsHeaderMinimized] = useState(false);

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
        selectedMetricX,
        selectedMetricY,
        selectedMetric,
        selectedMetricY2,
        setsHandling,
        selectedSplit,
        selectedGoal,
        selectedGoalChart,
        goalTimeDurationMode,
        goalTimeInheritanceMode,
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
    const effectiveDateRange = globalDateRange;
    const resolvedGlobalFilters = useMemo(() => resolveAnalyticsGlobalFilters({
        filters: globalFilters,
        goalAnalytics,
        activities,
        activityGroups,
        activityInstances,
    }), [activities, activityGroups, activityInstances, globalFilters, goalAnalytics]);
    const scopedActivities = useMemo(() => (
        resolvedGlobalFilters.hasActivityFilter
            ? activities.filter((activity) => resolvedGlobalFilters.activityIds.has(activity.id))
            : activities
    ), [activities, resolvedGlobalFilters.activityIds, resolvedGlobalFilters.hasActivityFilter]);
    const effectiveSelectedActivity = selectedActivity && scopedActivities.some((activity) => activity.id === selectedActivity.id)
        ? selectedActivity
        : null;
    const hasActiveDateRange = Boolean(effectiveDateRange?.start || effectiveDateRange?.end);

    const isDateInRange = React.useCallback((value) => {
        if (!hasActiveDateRange) return true;
        const date = value ? new Date(value) : null;
        if (!date || Number.isNaN(date.getTime())) return false;
        const start = effectiveDateRange?.start ? new Date(`${effectiveDateRange.start}T00:00:00`) : null;
        const end = effectiveDateRange?.end ? new Date(`${effectiveDateRange.end}T23:59:59`) : null;
        if (start && date < start) return false;
        if (end && date > end) return false;
        return true;
    }, [effectiveDateRange?.end, effectiveDateRange?.start, hasActiveDateRange]);

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

    const categoryLabels = {
        goals: 'Goals',
        sessions: 'Sessions',
        activities: 'Activities',
    };

    const visualizations = {
        goals: [
            { id: 'stats', name: 'Summary Stats', iconType: 'goals:stats' },
            { id: 'completionTimeline', name: 'Completion Timeline', iconType: 'goals:completionTimeline' },
            { id: 'timeDistribution', name: 'Time Spent Per Goal', iconType: 'goals:timeDistribution' },
            { id: 'completionRateByLevel', name: 'Completion Rate', iconType: 'goals:completionRateByLevel' },
            { id: 'goalAging', name: 'Goal Aging', iconType: 'goals:goalAging' },
            { id: 'goalMomentum', name: 'Goal Momentum', iconType: 'goals:goalMomentum' },
            { id: 'staleGoals', name: 'Stale Goals', iconType: 'goals:staleGoals' },
            { id: 'goalDetail', name: 'Goal Detail View', iconType: 'goals:goalDetail' }
        ],
        sessions: [
            { id: 'stats', name: 'Summary Stats', iconType: 'sessions:stats' },
            { id: 'durationTrend', name: 'Duration Trend', iconType: 'sessions:durationTrend' },
            { id: 'sectionPie', name: 'Section Time', iconType: 'sessions:sectionPie' },
            { id: 'heatmap', name: 'Activity Heatmap', iconType: 'sessions:heatmap' },
            { id: 'streaks', name: 'Streak Timeline', iconType: 'sessions:streaks' },
            { id: 'weeklyChart', name: 'Weekly Chart', iconType: 'sessions:weeklyChart' },
            { id: 'completionRate', name: 'Completion Rate', iconType: 'sessions:completionRate' },
            { id: 'startDistribution', name: 'Start Times', iconType: 'sessions:startDistribution' },
            { id: 'durationHistogram', name: 'Duration Histogram', iconType: 'sessions:durationHistogram' },
            { id: 'plannedVsActual', name: 'Planned vs Actual', iconType: 'sessions:plannedVsActual' },
            { id: 'consistency', name: 'Consistency', iconType: 'sessions:consistency' }
        ],
        activities: [
            { id: 'scatterPlot', name: 'Scatter Plot', iconType: 'activities:scatterPlot' },
            { id: 'lineGraph', name: 'Line Graph', iconType: 'activities:lineGraph' },
            { id: 'activityFrequency', name: 'Frequency', iconType: 'activities:activityFrequency' },
            { id: 'timeByActivity', name: 'Time Per Activity', iconType: 'activities:timeByActivity' },
            { id: 'personalBest', name: 'Personal Best', iconType: 'activities:personalBest' },
            { id: 'metricVolume', name: 'Metric Volume', iconType: 'activities:metricVolume' },
            { id: 'groupMix', name: 'Group Mix', iconType: 'activities:groupMix' }
        ]
    };

    // Get goal type color
    const getGoalTypeColor = (type) => {
        return getGoalColor(type);
    };

    const filteredSessions = useMemo(() => {
        const dateFiltered = sessions.filter((session) => {
            const rawDate = session.session_start || session.created_at;
            return isDateInRange(rawDate);
        });
        if (!resolvedGlobalFilters.hasActivityFilter) {
            return dateFiltered;
        }
        return dateFiltered.filter((session) => resolvedGlobalFilters.sessionIds.has(session.id));
    }, [isDateInRange, resolvedGlobalFilters.hasActivityFilter, resolvedGlobalFilters.sessionIds, sessions]);

    const filteredActivityInstances = useMemo(() => {
        return Object.fromEntries(Object.entries(activityInstances || {}).map(([activityId, instances]) => [
            activityId,
            (instances || []).filter((instance) => {
                if (resolvedGlobalFilters.hasActivityFilter && !resolvedGlobalFilters.activityIds.has(activityId)) {
                    return false;
                }
                const rawDate = instance.session_date || instance.created_at;
                return isDateInRange(rawDate);
            }),
        ]));
    }, [activityInstances, isDateInRange, resolvedGlobalFilters.activityIds, resolvedGlobalFilters.hasActivityFilter]);

    const filteredGoalAnalyticsGoals = useMemo(() => {
        const goals = goalAnalytics?.goals || [];
        const scopedGoals = resolvedGlobalFilters.hasGoalFilter
            ? goals.filter((goal) => resolvedGlobalFilters.goalIds.has(goal.id))
            : goals;
        const allowedActivityNames = resolvedGlobalFilters.hasActivityFilter
            ? new Set(scopedActivities.map((activity) => activity.name))
            : null;

        return scopedGoals.map((goal) => {
            const activityDurations = (goal.activity_durations_by_date || []).filter((item) => (
                isDateInRange(item.date)
                && (!allowedActivityNames || allowedActivityNames.has(item.activity_name))
            ));
            const sessionDurations = allowedActivityNames
                ? Object.values(activityDurations.reduce((byDate, item) => {
                    const key = item.date || 'Unknown';
                    byDate[key] = byDate[key] || { date: item.date, duration_seconds: 0, session_name: 'Filtered activities' };
                    byDate[key].duration_seconds += item.duration_seconds || 0;
                    return byDate;
                }, {}))
                : (goal.session_durations_by_date || []).filter((item) => isDateInRange(item.date));
            const activityBreakdownByName = new Map();

            activityDurations.forEach((item) => {
                const name = item.activity_name || 'Unknown';
                const current = activityBreakdownByName.get(name) || {
                    activity_id: name,
                    activity_name: name,
                    instance_count: 0,
                    total_duration_seconds: 0,
                };
                current.instance_count += 1;
                current.total_duration_seconds += item.duration_seconds || 0;
                activityBreakdownByName.set(name, current);
            });

            return {
                ...goal,
                completed: Boolean(goal.completed && isDateInRange(goal.completed_at)),
                session_durations_by_date: sessionDurations,
                activity_durations_by_date: activityDurations,
                activity_breakdown: hasActiveDateRange || allowedActivityNames
                    ? Array.from(activityBreakdownByName.values())
                    : goal.activity_breakdown,
                total_duration_seconds: sessionDurations.reduce((sum, item) => sum + (item.duration_seconds || 0), 0),
                session_count: sessionDurations.length,
            };
        });
    }, [goalAnalytics?.goals, hasActiveDateRange, isDateInRange, resolvedGlobalFilters.goalIds, resolvedGlobalFilters.hasActivityFilter, resolvedGlobalFilters.hasGoalFilter, scopedActivities]);

    const filteredGoalSummary = useMemo(() => {
        const completedGoals = filteredGoalAnalyticsGoals.filter((goal) => goal.completed);
        const completionTimes = completedGoals.map((goal) => {
            const created = goal.created_at ? new Date(goal.created_at) : null;
            const completed = goal.completed_at ? new Date(goal.completed_at) : null;
            if (!created || !completed || Number.isNaN(created.getTime()) || Number.isNaN(completed.getTime())) {
                return null;
            }
            return Math.max(0, Math.round((completed - created) / 86400000));
        }).filter((value) => value != null);
        const durations = completedGoals.map((goal) => goal.total_duration_seconds || 0).filter((value) => value > 0);

        return {
            completed_goals: completedGoals.length,
            completion_rate: filteredGoalAnalyticsGoals.length > 0
                ? (completedGoals.length / filteredGoalAnalyticsGoals.length) * 100
                : 0,
            avg_goal_age_days: goalAnalytics?.summary?.avg_goal_age_days || 0,
            avg_time_to_completion_days: completionTimes.length
                ? completionTimes.reduce((sum, value) => sum + value, 0) / completionTimes.length
                : 0,
            avg_duration_to_completion_seconds: durations.length
                ? durations.reduce((sum, value) => sum + value, 0) / durations.length
                : 0,
        };
    }, [filteredGoalAnalyticsGoals, goalAnalytics?.summary?.avg_goal_age_days]);

    const effectiveSelectedGoal = useMemo(() => {
        if (selectedGoal?.id && filteredGoalAnalyticsGoals.some((goal) => goal.id === selectedGoal.id)) {
            return filteredGoalAnalyticsGoals.find((goal) => goal.id === selectedGoal.id);
        }
        if (resolvedGlobalFilters.filters.goals.goalIds.length === 1) {
            const goalId = resolvedGlobalFilters.filters.goals.goalIds[0];
            return filteredGoalAnalyticsGoals.find((goal) => goal.id === goalId) || null;
        }
        return null;
    }, [filteredGoalAnalyticsGoals, resolvedGlobalFilters.filters.goals.goalIds, selectedGoal?.id]);

    const activityCounts = useMemo(() => Object.fromEntries(
        scopedActivities.map((activity) => [activity.id, filteredActivityInstances[activity.id]?.length || 0])
    ), [scopedActivities, filteredActivityInstances]);

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
        scopedActivities.forEach((activity) => {
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
    }, [scopedActivities, activityCounts, activityGroups]);

    // Prepare goal chart data
    const getActivityChartData = () => {
        if (!effectiveSelectedGoal?.activity_breakdown?.length) {
            return { labels: [], datasets: [] };
        }
        const sortedActivities = [...effectiveSelectedGoal.activity_breakdown]
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
        if (!effectiveSelectedGoal?.session_durations_by_date?.length) {
            return { labels: [], datasets: [] };
        }
        return {
            labels: effectiveSelectedGoal.session_durations_by_date.map(s => new Date(s.date)),
            datasets: [{
                label: 'Duration (minutes)',
                data: effectiveSelectedGoal.session_durations_by_date.map(s => Math.round(s.duration_seconds / 60)),
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

    const selectedVisualizationMeta = selectedCategory
        ? visualizations[selectedCategory]?.find((vis) => vis.id === selectedVisualization)
        : null;

    const renderUnifiedHeader = () => {
        const hasCategory = !!selectedCategory;

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
                    <div className={styles.headerContext}>
                        <span className={styles.buttonIcon}>
                            {selectedVisualizationMeta
                                ? <VisualizationIcon type={selectedVisualizationMeta.iconType} size={16} />
                                : hasCategory
                                    ? categoryIcons[selectedCategory]
                                    : <ChartIcon size={16} />}
                        </span>
                        <span>
                            {selectedVisualizationMeta?.name || categoryLabels[selectedCategory] || 'Analytics'}
                        </span>
                    </div>
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
                    <Button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowSplitMenu(false);
                            setIsHeaderMinimized(true);
                        }}
                        variant="ghost"
                        size="sm"
                        style={{ padding: '0 8px', minWidth: '32px' }}
                        aria-label="Minimize analytics panel header"
                        title="Minimize header"
                    >
                        <MinimizeHeaderIcon size={16} />
                    </Button>
                    <Button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (canClose) {
                                onClose();
                            }
                        }}
                        variant="ghost"
                        size="sm"
                        style={{ padding: '0 8px', minWidth: '32px' }}
                        aria-label="Close analytics window"
                        title={canClose ? 'Close analytics window' : 'At least one analytics panel is required'}
                        disabled={!canClose}
                    >
                        <CloseIcon size={16} />
                    </Button>
                </div>
            </div>
        );
    };

    const renderMinimizedHeaderOverlay = () => (
        <div className={styles.minimizedHeaderOverlay} onClick={(event) => event.stopPropagation()}>
            <button
                type="button"
                className={styles.minimizedHeaderButton}
                onClick={() => setIsHeaderMinimized(false)}
                aria-label="Restore analytics panel header"
                title="Restore header"
            >
                <RestoreHeaderIcon size={15} />
            </button>
            <button
                type="button"
                className={styles.minimizedHeaderButton}
                onClick={onClose}
                aria-label="Close analytics window"
                title={canClose ? 'Close analytics window' : 'At least one analytics panel is required'}
                disabled={!canClose}
            >
                <CloseIcon size={15} />
            </button>
        </div>
    );

    const renderCategoryCards = () => (
        <div className={styles.selectionSurface}>
            <div className={styles.selectionGrid}>
                {['goals', 'sessions', 'activities'].map(category => (
                    <button
                        key={category}
                        type="button"
                        className={styles.selectionCard}
                        onClick={() => handleCategoryChange(category)}
                    >
                        <span className={styles.selectionIcon}>{categoryIcons[category]}</span>
                        <span className={styles.selectionName}>{categoryLabels[category]}</span>
                    </button>
                ))}
            </div>
        </div>
    );

    const renderVisualizationCards = () => (
        <div className={styles.selectionSurface}>
            <div className={styles.selectionGrid}>
                {visualizations[selectedCategory]?.map(vis => (
                    <button
                        key={vis.id}
                        type="button"
                        className={styles.selectionCard}
                        onClick={() => setSelectedVisualization(vis.id)}
                    >
                        <span className={styles.selectionIcon}><VisualizationIcon type={vis.iconType} size={22} /></span>
                        <span className={styles.selectionName}>{vis.name}</span>
                    </button>
                ))}
            </div>
        </div>
    );







    // Render the actual visualization content
    const renderVisualizationContent = () => {
        if (!selectedCategory) {
            return renderCategoryCards();
        }

        if (!selectedVisualization) {
            return renderVisualizationCards();
        }

        const summary = filteredGoalSummary;
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
                            <GoalCompletionTimeline goals={filteredGoalAnalyticsGoals} chartRef={chartRef} />
                        </div>
                    );
                case 'timeDistribution':
                    return (
                        <div className={styles.vizContainerHidden}>
                            <GoalTimeDistribution
                                goals={filteredGoalAnalyticsGoals}
                                chartRef={chartRef}
                                durationMode={goalTimeDurationMode || 'activity'}
                                inheritanceMode={goalTimeInheritanceMode || 'direct'}
                            />
                        </div>
                    );
                case 'completionRateByLevel':
                    return <div className={styles.vizContainerHidden}><GoalCompletionRateByLevel goals={filteredGoalAnalyticsGoals} chartRef={chartRef} /></div>;
                case 'goalAging':
                    return <div className={styles.vizContainerHidden}><GoalAgingChart goals={filteredGoalAnalyticsGoals} chartRef={chartRef} /></div>;
                case 'goalMomentum':
                    return <div className={styles.vizContainerHidden}><GoalMomentumChart goals={filteredGoalAnalyticsGoals} chartRef={chartRef} /></div>;
                case 'staleGoals':
                    return <div className={styles.vizContainer}><StaleGoalsChart goals={filteredGoalAnalyticsGoals} /></div>;
                case 'goalDetail':
                    if (!effectiveSelectedGoal) {
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
                                <Heading level={3} className={styles.goalTitle}>{effectiveSelectedGoal.name}</Heading>
                                <span className={styles.goalBadge} style={{ background: getGoalTypeColor(effectiveSelectedGoal.type) }}>
                                    {effectiveSelectedGoal.type.replace('Goal', '')}
                                </span>
                            </div>
                            {/* Goal stats */}
                            <div className={styles.statsGrid}>
                                <StatCard value={formatDuration(effectiveSelectedGoal.total_duration_seconds || 0)} label="Total Time" subLabel="Selected range" color="#2196f3" />
                                <StatCard value={effectiveSelectedGoal.session_count || 0} label="Sessions" subLabel="Selected range" color="#4caf50" />
                                <StatCard value={`${effectiveSelectedGoal.age_days || 0}d`} label="Goal Age" color="#ff9800" />
                            </div>
                            {/* Chart */}
                            <div className={styles.chartContainer}>
                                {selectedGoalChart === 'duration' ? (
                                    effectiveSelectedGoal.session_durations_by_date?.length > 0 ? (
                                        <Line data={getDurationChartData()} options={durationChartOptions} />
                                    ) : (
                                        <div className={styles.noData}>
                                            No session data available
                                        </div>
                                    )
                                ) : (
                                    effectiveSelectedGoal.activity_breakdown?.length > 0 ? (
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
                                showMetricSelectors={false}
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
                        Select an activity in the filters panel
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
                                activities={scopedActivities}
                                setsHandling={setsHandling}
                                selectedSplit={selectedSplit}
                                chartRef={chartRef}
                                selectedMetricX={selectedMetricX}
                                selectedMetricY={selectedMetricY}
                            />
                        </div>
                    );
                case 'lineGraph':
                    return (
                        <div className={styles.vizContainerHidden}>
                            <LineGraph
                                selectedActivity={effectiveSelectedActivity}
                                activityInstances={filteredActivityInstances}
                                activities={scopedActivities}
                                selectedMetric={selectedMetric}
                                setSelectedMetric={setSelectedMetric}
                                selectedMetricY2={selectedMetricY2}
                                setSelectedMetricY2={setSelectedMetricY2}
                                setsHandling={setsHandling}
                                selectedSplit={selectedSplit}
                                chartRef={chartRef}
                                selectedDateRange={effectiveDateRange}
                                onDateRangeChange={onGlobalDateRangeChange}
                                showMetricSelectors={false}
                            />
                        </div>
                    );
                case 'activityFrequency':
                    return <div className={styles.vizContainerHidden}><ActivityFrequencyChart activities={scopedActivities} activityInstances={filteredActivityInstances} chartRef={chartRef} /></div>;
                case 'timeByActivity':
                    return <div className={styles.vizContainerHidden}><ActivityTimeByActivity activities={scopedActivities} activityInstances={filteredActivityInstances} chartRef={chartRef} /></div>;
                case 'personalBest':
                    return <div className={styles.vizContainerHidden}><ActivityPersonalBestTrend selectedActivity={effectiveSelectedActivity} activities={scopedActivities} activityInstances={filteredActivityInstances} chartRef={chartRef} /></div>;
                case 'metricVolume':
                    return <div className={styles.vizContainerHidden}><ActivityMetricVolumeChart selectedActivity={effectiveSelectedActivity} activities={scopedActivities} activityInstances={filteredActivityInstances} chartRef={chartRef} /></div>;
                case 'groupMix':
                    return <div className={styles.vizContainerHidden}><ActivityGroupMixChart activities={scopedActivities} activityGroups={activityGroups} activityInstances={filteredActivityInstances} chartRef={chartRef} /></div>;
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
            {isHeaderMinimized ? renderMinimizedHeaderOverlay() : renderUnifiedHeader()}
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
