import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import { useActivities } from '../contexts/ActivitiesContext';
import ScatterPlot from '../components/analytics/ScatterPlot';
import LineGraph from '../components/analytics/LineGraph';
import GoalCompletionTimeline from '../components/analytics/GoalCompletionTimeline';
import GoalTimeDistribution from '../components/analytics/GoalTimeDistribution';
import ActivityHeatmap from '../components/analytics/ActivityHeatmap';
import StreakTimeline from '../components/analytics/StreakTimeline';
import WeeklyBarChart from '../components/analytics/WeeklyBarChart';
import { GOAL_COLOR_SYSTEM } from '../utils/goalColors';
import { Bar, Line } from 'react-chartjs-2';
import '../components/analytics/ChartJSWrapper'; // Registers Chart.js components
import '../App.css';

/**
 * Analytics Page - View insights and statistics about sessions
 */
function Analytics() {
    const { rootId } = useParams();
    const navigate = useNavigate();
    const { activities, fetchActivities, loading: activitiesLoading } = useActivities();

    const [loading, setLoading] = useState(true);
    const [sessions, setSessions] = useState([]);
    const [activeTab, setActiveTab] = useState('goals'); // 'goals', 'sessions', or 'activities'

    // Goal analytics state
    const [goalAnalytics, setGoalAnalytics] = useState(null);
    const [selectedGoal, setSelectedGoal] = useState(null);
    const [goalTypeFilter, setGoalTypeFilter] = useState('all'); // 'all', 'ShortTermGoal', 'ImmediateGoal', etc.
    const [goalStatusFilter, setGoalStatusFilter] = useState('all'); // 'all', 'completed', 'active'
    const [selectedGoalChart, setSelectedGoalChart] = useState('duration'); // 'duration' or 'activity'
    const [selectedOverviewChart, setSelectedOverviewChart] = useState('timeline'); // 'timeline' or 'timeDistribution'
    const [goalSortBy, setGoalSortBy] = useState('sessions'); // 'sessions', 'duration', 'recent', 'oldest', 'name'

    // Activities tab state
    const [selectedActivity, setSelectedActivity] = useState(null);
    const [activityInstances, setActivityInstances] = useState({});
    const [selectedGraph, setSelectedGraph] = useState('scatter'); // 'scatter', 'line'
    const [selectedMetric, setSelectedMetric] = useState(null); // For line graph (Y1 axis)
    const [selectedMetricY2, setSelectedMetricY2] = useState(null); // For line graph (Y2 axis)
    const [setsHandling, setSetsHandling] = useState('top'); // 'top' or 'average'
    const [selectedSplit, setSelectedSplit] = useState('all'); // 'all' or specific split ID

    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        fetchData();
    }, [rootId, navigate]);

    // Reset split selection when activity changes
    useEffect(() => {
        setSelectedSplit('all');
    }, [selectedActivity]);

    const fetchData = async () => {
        try {
            // Fetch sessions, activities, and goal analytics
            const [sessionsRes, goalAnalyticsRes] = await Promise.all([
                fractalApi.getSessions(rootId),
                fractalApi.getGoalAnalytics(rootId)
            ]);
            await fetchActivities(rootId); // Use context method

            setSessions(sessionsRes.data);
            setGoalAnalytics(goalAnalyticsRes.data);

            // Build activity instances map from sessions
            const instancesMap = {};
            sessionsRes.data.forEach(session => {
                const sessionData = session.attributes?.session_data;
                if (sessionData?.sections) {
                    sessionData.sections.forEach(section => {
                        if (section.exercises) {
                            section.exercises.forEach(exercise => {
                                if (exercise.type === 'activity' && exercise.activity_id) {
                                    if (!instancesMap[exercise.activity_id]) {
                                        instancesMap[exercise.activity_id] = [];
                                    }
                                    // Determine session date (prioritize session_start)
                                    const sessionStart = session.session_start || session.attributes?.session_data?.session_start || session.attributes?.created_at;

                                    instancesMap[exercise.activity_id].push({
                                        ...exercise,
                                        session_id: session.id,
                                        session_name: session.name,
                                        session_date: sessionStart
                                    });
                                }
                            });
                        }
                    });
                }
            });

            setActivityInstances(instancesMap);
            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch analytics data", err);
            setLoading(false);
        }
    };

    // Helper function to format duration
    const formatDuration = (seconds) => {
        if (!seconds || seconds === 0) return '0m';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    };

    // Filter goals based on type and status
    const getFilteredGoals = () => {
        if (!goalAnalytics?.goals) return [];

        return goalAnalytics.goals.filter(goal => {
            // Type filter
            if (goalTypeFilter !== 'all' && goal.type !== goalTypeFilter) return false;

            // Status filter
            if (goalStatusFilter === 'completed' && !goal.completed) return false;
            if (goalStatusFilter === 'active' && goal.completed) return false;

            return true;
        }).sort((a, b) => {
            switch (goalSortBy) {
                case 'sessions':
                    if (b.session_count !== a.session_count) return b.session_count - a.session_count;
                    return a.name.localeCompare(b.name);
                case 'duration':
                    if (b.total_duration_seconds !== a.total_duration_seconds) return b.total_duration_seconds - a.total_duration_seconds;
                    return a.name.localeCompare(b.name);
                case 'recent':
                    const aRecent = a.created_at ? new Date(a.created_at) : new Date(0);
                    const bRecent = b.created_at ? new Date(b.created_at) : new Date(0);
                    return bRecent - aRecent;
                case 'oldest':
                    const aOld = a.created_at ? new Date(a.created_at) : new Date(0);
                    const bOld = b.created_at ? new Date(b.created_at) : new Date(0);
                    return aOld - bOld;
                case 'name':
                    return a.name.localeCompare(b.name);
                default:
                    return 0;
            }
        });
    };

    // Get sort description for display
    const getSortDescription = () => {
        switch (goalSortBy) {
            case 'sessions': return 'Sorted by session count';
            case 'duration': return 'Sorted by total duration';
            case 'recent': return 'Sorted by most recent';
            case 'oldest': return 'Sorted by oldest first';
            case 'name': return 'Sorted by name';
            default: return '';
        }
    };

    // Goal type colors - use cosmic color system
    const getGoalTypeColor = (type) => {
        return GOAL_COLOR_SYSTEM[type]?.primary || '#666';
    };

    // Get activities sorted by last instantiated
    const getSortedActivities = () => {
        return [...activities].sort((a, b) => {
            const aInstances = activityInstances[a.id] || [];
            const bInstances = activityInstances[b.id] || [];

            if (aInstances.length === 0 && bInstances.length === 0) return 0;
            if (aInstances.length === 0) return 1;
            if (bInstances.length === 0) return -1;

            // Get most recent instance for each
            const aLatest = aInstances.reduce((latest, inst) => {
                const instDate = new Date(inst.session_date);
                return instDate > latest ? instDate : latest;
            }, new Date(0));

            const bLatest = bInstances.reduce((latest, inst) => {
                const instDate = new Date(inst.session_date);
                return instDate > latest ? instDate : latest;
            }, new Date(0));

            return bLatest - aLatest; // Most recent first
        });
    };

    if (loading || activitiesLoading) {
        return (
            <div className="page-container" style={{ textAlign: 'center', color: '#666', padding: '40px' }}>
                Loading analytics...
            </div>
        );
    }

    // Render content based on active tab
    const renderTabContent = () => {
        switch (activeTab) {
            case 'goals':
                const filteredGoals = getFilteredGoals();
                const summary = goalAnalytics?.summary || {};

                // Prepare activity breakdown bar chart data
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

                // Prepare duration over time line chart data
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
                            ticks: {
                                color: '#ccc',
                                font: { size: 11 }
                            },
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
                            time: {
                                unit: 'day',
                                displayFormats: { day: 'MMM d' }
                            },
                            ticks: { color: '#888' },
                            grid: { color: '#333' }
                        },
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Duration (min)',
                                color: '#888'
                            },
                            ticks: { color: '#888' },
                            grid: { color: '#333' }
                        }
                    }
                };

                return (
                    <div style={{
                        display: 'flex',
                        gap: '20px',
                        height: 'calc(100vh - 180px)',
                        minHeight: '600px'
                    }}>
                        {/* Main Content Area (Left) */}
                        <div style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '20px',
                            overflow: 'hidden'
                        }}>
                            {/* High-Level Stats Cards - Only show in multi-goal overview mode */}
                            {!selectedGoal && (
                                <div style={{
                                    display: 'flex',
                                    gap: '8px',
                                    flexWrap: 'nowrap'
                                }}>
                                    <div style={{
                                        background: '#1e1e1e',
                                        border: '1px solid #333',
                                        borderRadius: '6px',
                                        padding: '10px 12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        flex: '1 1 0',
                                        minWidth: 0
                                    }}>
                                        <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#4caf50' }}>
                                            {summary.completed_goals || 0}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                                Completed
                                            </div>
                                            <div style={{ fontSize: '9px', color: '#666' }}>
                                                {summary.completion_rate?.toFixed(1) || 0}% rate
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{
                                        background: '#1e1e1e',
                                        border: '1px solid #333',
                                        borderRadius: '6px',
                                        padding: '10px 12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        flex: '1 1 0',
                                        minWidth: 0
                                    }}>
                                        <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#2196f3' }}>
                                            {summary.avg_goal_age_days || 0}d
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                                Avg Age
                                            </div>
                                            <div style={{ fontSize: '9px', color: '#666' }}>
                                                Days old
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{
                                        background: '#1e1e1e',
                                        border: '1px solid #333',
                                        borderRadius: '6px',
                                        padding: '10px 12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        flex: '1 1 0',
                                        minWidth: 0
                                    }}>
                                        <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#ff9800' }}>
                                            {summary.avg_time_to_completion_days || 0}d
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                                Avg to Complete
                                            </div>
                                            <div style={{ fontSize: '9px', color: '#666' }}>
                                                Days
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{
                                        background: '#1e1e1e',
                                        border: '1px solid #333',
                                        borderRadius: '6px',
                                        padding: '10px 12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        flex: '1 1 0',
                                        minWidth: 0
                                    }}>
                                        <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#9c27b0' }}>
                                            {formatDuration(summary.avg_duration_to_completion_seconds || 0)}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                                Avg Time
                                            </div>
                                            <div style={{ fontSize: '9px', color: '#666' }}>
                                                Per goal
                                            </div>
                                        </div>
                                    </div>

                                    {/* Days Since Last Completion */}
                                    <div style={{
                                        background: '#1e1e1e',
                                        border: '1px solid #333',
                                        borderRadius: '6px',
                                        padding: '10px 12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        flex: '1 1 0',
                                        minWidth: 0
                                    }}>
                                        <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#e91e63' }}>
                                            {(() => {
                                                // Find the most recent completion date
                                                const completedGoals = (goalAnalytics?.goals || [])
                                                    .filter(g => g.completed && g.completed_at);
                                                if (completedGoals.length === 0) return '—';

                                                const mostRecent = completedGoals.reduce((latest, goal) => {
                                                    const date = new Date(goal.completed_at);
                                                    return date > latest ? date : latest;
                                                }, new Date(0));

                                                const daysSince = Math.floor((new Date() - mostRecent) / (1000 * 60 * 60 * 24));
                                                return `${daysSince}d`;
                                            })()}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                                Since Last
                                            </div>
                                            <div style={{ fontSize: '9px', color: '#666' }}>
                                                Completion
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Goal Detail Content */}
                            {selectedGoal ? (
                                <div style={{
                                    flex: 1,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '20px',
                                    overflow: 'auto'
                                }}>
                                    {/* Goal Header */}
                                    <div style={{
                                        background: '#1e1e1e',
                                        border: '1px solid #333',
                                        borderRadius: '8px',
                                        padding: '16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <button
                                                onClick={() => setSelectedGoal(null)}
                                                style={{
                                                    padding: '6px 12px',
                                                    background: '#333',
                                                    border: '1px solid #444',
                                                    borderRadius: '4px',
                                                    color: '#ccc',
                                                    fontSize: '12px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    transition: 'all 0.2s ease'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.target.style.background = '#444';
                                                    e.target.style.borderColor = '#555';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.target.style.background = '#333';
                                                    e.target.style.borderColor = '#444';
                                                }}
                                            >
                                                ← Overview
                                            </button>
                                            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#fff' }}>
                                                {selectedGoal.name}
                                            </h2>
                                            <span style={{
                                                padding: '4px 10px',
                                                background: getGoalTypeColor(selectedGoal.type),
                                                borderRadius: '4px',
                                                fontSize: '11px',
                                                fontWeight: 500,
                                                color: 'white'
                                            }}>
                                                {selectedGoal.type.replace('Goal', '')}
                                            </span>
                                            {selectedGoal.completed && (
                                                <span style={{
                                                    padding: '4px 10px',
                                                    background: '#4caf50',
                                                    borderRadius: '4px',
                                                    fontSize: '11px',
                                                    fontWeight: 500,
                                                    color: 'white'
                                                }}>
                                                    ✓ Completed
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Goal Stats Row - Compact */}
                                    <div style={{
                                        display: 'flex',
                                        gap: '12px',
                                        flexWrap: 'wrap'
                                    }}>
                                        <div style={{
                                            background: '#1e1e1e',
                                            border: '1px solid #333',
                                            borderRadius: '6px',
                                            padding: '12px 16px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            flex: '1 1 auto',
                                            minWidth: '140px'
                                        }}>
                                            <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#2196f3' }}>
                                                {formatDuration(selectedGoal.total_duration_seconds || 0)}
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                Total Time
                                            </div>
                                        </div>

                                        <div style={{
                                            background: '#1e1e1e',
                                            border: '1px solid #333',
                                            borderRadius: '6px',
                                            padding: '12px 16px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            flex: '1 1 auto',
                                            minWidth: '140px'
                                        }}>
                                            <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#4caf50' }}>
                                                {selectedGoal.session_count || 0}
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                Sessions
                                            </div>
                                        </div>

                                        <div style={{
                                            background: '#1e1e1e',
                                            border: '1px solid #333',
                                            borderRadius: '6px',
                                            padding: '12px 16px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            flex: '1 1 auto',
                                            minWidth: '140px'
                                        }}>
                                            <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#ff9800' }}>
                                                {selectedGoal.age_days || 0}d
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                Goal Age
                                            </div>
                                        </div>
                                    </div>

                                    {/* Chart Section with Toggle */}
                                    <div style={{
                                        flex: 1,
                                        background: '#1e1e1e',
                                        border: '1px solid #333',
                                        borderRadius: '8px',
                                        padding: '20px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        minHeight: '350px'
                                    }}>
                                        {/* Chart Toggle */}
                                        <div style={{
                                            display: 'flex',
                                            gap: '8px',
                                            marginBottom: '16px'
                                        }}>
                                            <button
                                                onClick={() => setSelectedGoalChart('duration')}
                                                style={{
                                                    padding: '8px 16px',
                                                    background: selectedGoalChart === 'duration' ? '#2196f3' : '#333',
                                                    border: `1px solid ${selectedGoalChart === 'duration' ? '#1976d2' : '#444'}`,
                                                    borderRadius: '4px',
                                                    color: selectedGoalChart === 'duration' ? 'white' : '#888',
                                                    fontSize: '12px',
                                                    fontWeight: 500,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                📈 Duration Over Time
                                            </button>
                                            <button
                                                onClick={() => setSelectedGoalChart('activity')}
                                                style={{
                                                    padding: '8px 16px',
                                                    background: selectedGoalChart === 'activity' ? '#2196f3' : '#333',
                                                    border: `1px solid ${selectedGoalChart === 'activity' ? '#1976d2' : '#444'}`,
                                                    borderRadius: '4px',
                                                    color: selectedGoalChart === 'activity' ? 'white' : '#888',
                                                    fontSize: '12px',
                                                    fontWeight: 500,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                📊 Activity Breakdown
                                            </button>
                                        </div>

                                        {/* Chart Content */}
                                        <div style={{ flex: 1, position: 'relative' }}>
                                            {selectedGoalChart === 'duration' ? (
                                                selectedGoal.session_durations_by_date?.length > 0 ? (
                                                    <Line data={getDurationChartData()} options={durationChartOptions} />
                                                ) : (
                                                    <div style={{
                                                        height: '100%',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: '#666',
                                                        fontSize: '13px'
                                                    }}>
                                                        No session data available for this goal
                                                    </div>
                                                )
                                            ) : (
                                                selectedGoal.activity_breakdown?.length > 0 ? (
                                                    <Bar data={getActivityChartData()} options={activityChartOptions} />
                                                ) : (
                                                    <div style={{
                                                        height: '100%',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: '#666',
                                                        fontSize: '13px'
                                                    }}>
                                                        No activities recorded for this goal
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* Multi-Goal Overview (default view) */
                                <div style={{
                                    flex: 1,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '16px',
                                    overflow: 'auto'
                                }}>
                                    {/* Overview Header with Chart Toggle */}
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        flexWrap: 'wrap',
                                        gap: '12px'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                            <h2 style={{
                                                margin: 0,
                                                fontSize: '18px',
                                                fontWeight: 600,
                                                color: '#ccc'
                                            }}>
                                                Goals Overview
                                            </h2>

                                            {/* Chart Toggle Buttons */}
                                            <div style={{
                                                display: 'flex',
                                                gap: '4px',
                                                background: '#252525',
                                                borderRadius: '6px',
                                                padding: '3px'
                                            }}>
                                                <button
                                                    onClick={() => setSelectedOverviewChart('timeline')}
                                                    style={{
                                                        padding: '6px 14px',
                                                        background: selectedOverviewChart === 'timeline' ? '#333' : 'transparent',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        color: selectedOverviewChart === 'timeline' ? '#fff' : '#888',
                                                        fontSize: '12px',
                                                        fontWeight: 500,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s ease'
                                                    }}
                                                >
                                                    Completion Timeline
                                                </button>
                                                <button
                                                    onClick={() => setSelectedOverviewChart('timeDistribution')}
                                                    style={{
                                                        padding: '6px 14px',
                                                        background: selectedOverviewChart === 'timeDistribution' ? '#333' : 'transparent',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        color: selectedOverviewChart === 'timeDistribution' ? '#fff' : '#888',
                                                        fontSize: '12px',
                                                        fontWeight: 500,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s ease'
                                                    }}
                                                >
                                                    Time Distribution
                                                </button>
                                            </div>
                                        </div>

                                        <span style={{
                                            fontSize: '12px',
                                            color: '#666'
                                        }}>
                                            Select a goal from the panel to view detailed analytics
                                        </span>
                                    </div>

                                    {/* Single Chart Container */}
                                    <div style={{
                                        flex: 1,
                                        background: '#1e1e1e',
                                        border: '1px solid #333',
                                        borderRadius: '8px',
                                        padding: '20px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        minHeight: '400px'
                                    }}>
                                        {selectedOverviewChart === 'timeline' ? (
                                            <GoalCompletionTimeline goals={goalAnalytics?.goals || []} />
                                        ) : (
                                            <GoalTimeDistribution goals={goalAnalytics?.goals || []} />
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Goals Panel (Right) */}
                        <div style={{
                            width: '340px',
                            background: '#1e1e1e',
                            border: '1px solid #333',
                            borderRadius: '8px',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden'
                        }}>
                            {/* Panel Header with Filters */}
                            <div style={{
                                padding: '16px',
                                borderBottom: '1px solid #333',
                                background: '#252525'
                            }}>
                                <h3 style={{
                                    margin: 0,
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    color: '#ccc'
                                }}>
                                    Goals
                                </h3>
                                <p style={{
                                    margin: '4px 0 12px 0',
                                    fontSize: '11px',
                                    color: '#666'
                                }}>
                                    {getSortDescription()}
                                </p>

                                {/* Filter & Sort Controls */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <select
                                            value={goalTypeFilter}
                                            onChange={(e) => setGoalTypeFilter(e.target.value)}
                                            style={{
                                                flex: 1,
                                                padding: '6px 10px',
                                                background: '#333',
                                                border: '1px solid #444',
                                                borderRadius: '4px',
                                                color: 'white',
                                                fontSize: '11px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <option value="all">All Types</option>
                                            <option value="UltimateGoal">Ultimate</option>
                                            <option value="LongTermGoal">Long Term</option>
                                            <option value="MidTermGoal">Mid Term</option>
                                            <option value="ShortTermGoal">Short Term</option>
                                            <option value="ImmediateGoal">Immediate</option>
                                        </select>

                                        <select
                                            value={goalStatusFilter}
                                            onChange={(e) => setGoalStatusFilter(e.target.value)}
                                            style={{
                                                flex: 1,
                                                padding: '6px 10px',
                                                background: '#333',
                                                border: '1px solid #444',
                                                borderRadius: '4px',
                                                color: 'white',
                                                fontSize: '11px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <option value="all">All Status</option>
                                            <option value="active">Active</option>
                                            <option value="completed">Completed</option>
                                        </select>
                                    </div>

                                    <select
                                        value={goalSortBy}
                                        onChange={(e) => setGoalSortBy(e.target.value)}
                                        style={{
                                            padding: '6px 10px',
                                            background: '#333',
                                            border: '1px solid #444',
                                            borderRadius: '4px',
                                            color: 'white',
                                            fontSize: '11px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <option value="sessions">Sort by Sessions</option>
                                        <option value="duration">Sort by Duration</option>
                                        <option value="recent">Sort by Most Recent</option>
                                        <option value="oldest">Sort by Oldest</option>
                                        <option value="name">Sort by Name</option>
                                    </select>
                                </div>
                            </div>

                            {/* Goals List */}
                            <div style={{
                                flex: 1,
                                overflowY: 'auto',
                                padding: '12px'
                            }}>
                                {filteredGoals.length === 0 ? (
                                    <div style={{
                                        textAlign: 'center',
                                        padding: '20px',
                                        color: '#666',
                                        fontSize: '13px'
                                    }}>
                                        No goals match the current filters
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {filteredGoals.map(goal => {
                                            const isSelected = selectedGoal?.id === goal.id;
                                            const typeColor = getGoalTypeColor(goal.type);

                                            return (
                                                <div
                                                    key={goal.id}
                                                    onClick={() => setSelectedGoal(goal)}
                                                    style={{
                                                        padding: '12px',
                                                        background: isSelected ? '#2196f3' : '#252525',
                                                        border: `1px solid ${isSelected ? '#1976d2' : '#333'}`,
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s ease',
                                                        borderLeft: `3px solid ${typeColor}`
                                                    }}
                                                >
                                                    <div style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'flex-start',
                                                        marginBottom: '4px'
                                                    }}>
                                                        <div style={{
                                                            fontSize: '13px',
                                                            fontWeight: 600,
                                                            color: isSelected ? 'white' : '#ccc',
                                                            flex: 1,
                                                            marginRight: '8px'
                                                        }}>
                                                            {goal.name}
                                                        </div>
                                                        {goal.completed && (
                                                            <span style={{
                                                                fontSize: '10px',
                                                                color: isSelected ? 'rgba(255,255,255,0.8)' : '#4caf50'
                                                            }}>
                                                                ✓
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{
                                                        fontSize: '11px',
                                                        color: isSelected ? 'rgba(255,255,255,0.7)' : '#666'
                                                    }}>
                                                        {goal.session_count} session{goal.session_count !== 1 ? 's' : ''}
                                                        {goal.total_duration_seconds > 0 && (
                                                            <span> • {formatDuration(goal.total_duration_seconds)}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );

            case 'sessions':
                const completedSessions = sessions.filter(s => s.completed);
                const totalDuration = sessions.reduce((sum, s) => sum + (s.total_duration_seconds || 0), 0);
                const avgDuration = sessions.length > 0 ? totalDuration / sessions.length : 0;

                return (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '20px',
                        height: 'calc(100vh - 180px)',
                        minHeight: '600px'
                    }}>
                        {/* Top Stats Row */}
                        <div style={{
                            display: 'flex',
                            gap: '12px',
                            flexWrap: 'wrap'
                        }}>
                            <div style={{
                                flex: '1 1 150px',
                                background: '#1e1e1e',
                                border: '1px solid #333',
                                borderRadius: '6px',
                                padding: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px'
                            }}>
                                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#2196f3' }}>
                                    {sessions.length}
                                </div>
                                <div>
                                    <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Total Sessions
                                    </div>
                                    <div style={{ fontSize: '10px', color: '#666' }}>
                                        All time
                                    </div>
                                </div>
                            </div>

                            <div style={{
                                flex: '1 1 150px',
                                background: '#1e1e1e',
                                border: '1px solid #333',
                                borderRadius: '6px',
                                padding: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px'
                            }}>
                                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#4caf50' }}>
                                    {completedSessions.length}
                                </div>
                                <div>
                                    <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Completed
                                    </div>
                                    <div style={{ fontSize: '10px', color: '#666' }}>
                                        {sessions.length > 0 ? Math.round((completedSessions.length / sessions.length) * 100) : 0}% rate
                                    </div>
                                </div>
                            </div>

                            <div style={{
                                flex: '1 1 150px',
                                background: '#1e1e1e',
                                border: '1px solid #333',
                                borderRadius: '6px',
                                padding: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px'
                            }}>
                                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ff9800' }}>
                                    {formatDuration(totalDuration)}
                                </div>
                                <div>
                                    <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Total Time
                                    </div>
                                    <div style={{ fontSize: '10px', color: '#666' }}>
                                        Practiced
                                    </div>
                                </div>
                            </div>

                            <div style={{
                                flex: '1 1 150px',
                                background: '#1e1e1e',
                                border: '1px solid #333',
                                borderRadius: '6px',
                                padding: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px'
                            }}>
                                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#9c27b0' }}>
                                    {formatDuration(avgDuration)}
                                </div>
                                <div>
                                    <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Avg Duration
                                    </div>
                                    <div style={{ fontSize: '10px', color: '#666' }}>
                                        Per session
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Activity Heatmap - Full Width */}
                        <ActivityHeatmap sessions={sessions} months={12} />

                        {/* Bottom Row: Streak Timeline + Weekly Chart */}
                        <div style={{
                            display: 'flex',
                            gap: '20px',
                            flex: 1,
                            minHeight: '300px'
                        }}>
                            {/* Streak Timeline - Left */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <StreakTimeline sessions={sessions} />
                            </div>

                            {/* Weekly Bar Chart - Right */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <WeeklyBarChart sessions={sessions} weeks={12} />
                            </div>
                        </div>
                    </div>
                );

            case 'activities':
                const sortedActivities = getSortedActivities();
                const currentActivityDef = selectedActivity ? activities.find(a => a.id === selectedActivity.id) : null;
                const hasSplits = currentActivityDef?.has_splits && currentActivityDef?.split_definitions?.length > 0;

                return (
                    <div style={{
                        display: 'flex',
                        gap: '20px',
                        height: 'calc(100vh - 180px)', // Full height minus compact header
                        minHeight: '600px'
                    }}>
                        {/* Graph Viewport (Left) */}
                        <div style={{
                            flex: 1,
                            background: '#1e1e1e',
                            border: '1px solid #333',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            {/* Graph Type Selector */}
                            <div style={{
                                padding: '16px',
                                borderBottom: '1px solid #333',
                                background: '#252525'
                            }}>
                                <div style={{
                                    display: 'flex',
                                    gap: '16px',
                                    alignItems: 'center',
                                    flexWrap: 'wrap'
                                }}>
                                    {/* Graph Type */}
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <span style={{ fontSize: '12px', color: '#888' }}>
                                            Graph Type:
                                        </span>
                                        <button
                                            onClick={() => setSelectedGraph('scatter')}
                                            style={{
                                                padding: '6px 12px',
                                                background: selectedGraph === 'scatter' ? '#2196f3' : '#333',
                                                border: 'none',
                                                borderRadius: '4px',
                                                color: selectedGraph === 'scatter' ? 'white' : '#888',
                                                cursor: 'pointer',
                                                fontSize: '12px',
                                                fontWeight: 500
                                            }}
                                        >
                                            Scatter Plot
                                        </button>
                                        <button
                                            onClick={() => setSelectedGraph('line')}
                                            style={{
                                                padding: '6px 12px',
                                                background: selectedGraph === 'line' ? '#2196f3' : '#333',
                                                border: 'none',
                                                borderRadius: '4px',
                                                color: selectedGraph === 'line' ? 'white' : '#888',
                                                cursor: 'pointer',
                                                fontSize: '12px',
                                                fontWeight: 500
                                            }}
                                        >
                                            Line Graph
                                        </button>
                                    </div>

                                    {/* Sets Handling - only show if selected activity uses sets */}
                                    {selectedActivity && currentActivityDef?.has_sets && (
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <span style={{ fontSize: '12px', color: '#888' }}>
                                                Sets Handling:
                                            </span>
                                            <select
                                                value={setsHandling}
                                                onChange={(e) => setSetsHandling(e.target.value)}
                                                style={{
                                                    padding: '6px 12px',
                                                    background: '#333',
                                                    border: '1px solid #444',
                                                    borderRadius: '4px',
                                                    color: 'white',
                                                    fontSize: '12px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <option value="top">Top Set</option>
                                                <option value="average">Average</option>
                                            </select>
                                        </div>
                                    )}

                                    {/* Split Selection - only show if selected activity has splits */}
                                    {selectedActivity && hasSplits && (
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <span style={{ fontSize: '12px', color: '#888' }}>
                                                Split:
                                            </span>
                                            <select
                                                value={selectedSplit}
                                                onChange={(e) => setSelectedSplit(e.target.value)}
                                                style={{
                                                    padding: '6px 12px',
                                                    background: '#333',
                                                    border: '1px solid #444',
                                                    borderRadius: '4px',
                                                    color: 'white',
                                                    fontSize: '12px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <option value="all">All Splits (Combined)</option>
                                                {currentActivityDef.split_definitions.map(split => (
                                                    <option key={split.id} value={split.id}>{split.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Graph Area */}
                            <div style={{
                                flex: 1,
                                padding: '20px',
                                overflow: 'hidden'
                            }}>
                                {selectedGraph === 'scatter' ? (
                                    <ScatterPlot
                                        selectedActivity={selectedActivity}
                                        activityInstances={activityInstances}
                                        activities={activities}
                                        setsHandling={setsHandling}
                                        selectedSplit={selectedSplit}
                                    />
                                ) : (
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
                                    />
                                )}
                            </div>
                        </div>

                        {/* Activity Selector Side Pane (Right) */}
                        <div style={{
                            width: '300px',
                            background: '#1e1e1e',
                            border: '1px solid #333',
                            borderRadius: '8px',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                padding: '16px',
                                borderBottom: '1px solid #333',
                                background: '#252525'
                            }}>
                                <h3 style={{
                                    margin: 0,
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    color: '#ccc'
                                }}>
                                    Activities
                                </h3>
                                <p style={{
                                    margin: '4px 0 0 0',
                                    fontSize: '11px',
                                    color: '#666'
                                }}>
                                    Sorted by last used
                                </p>
                            </div>

                            <div style={{
                                flex: 1,
                                overflowY: 'auto',
                                padding: '12px'
                            }}>
                                {sortedActivities.length === 0 ? (
                                    <div style={{
                                        textAlign: 'center',
                                        padding: '20px',
                                        color: '#666',
                                        fontSize: '13px'
                                    }}>
                                        No activities found
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {sortedActivities.map(activity => {
                                            const instances = activityInstances[activity.id] || [];
                                            const isSelected = selectedActivity?.id === activity.id;

                                            return (
                                                <div
                                                    key={activity.id}
                                                    onClick={() => setSelectedActivity(activity)}
                                                    style={{
                                                        padding: '12px',
                                                        background: isSelected ? '#2196f3' : '#252525',
                                                        border: `1px solid ${isSelected ? '#1976d2' : '#333'}`,
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s ease'
                                                    }}
                                                >
                                                    <div style={{
                                                        fontSize: '13px',
                                                        fontWeight: 600,
                                                        color: isSelected ? 'white' : '#ccc',
                                                        marginBottom: '4px'
                                                    }}>
                                                        {activity.name}
                                                    </div>
                                                    <div style={{
                                                        fontSize: '11px',
                                                        color: isSelected ? 'rgba(255,255,255,0.7)' : '#666'
                                                    }}>
                                                        {instances.length} instance{instances.length !== 1 ? 's' : ''}
                                                    </div>
                                                    {activity.metric_definitions && activity.metric_definitions.length > 0 && (
                                                        <div style={{
                                                            fontSize: '10px',
                                                            color: isSelected ? 'rgba(255,255,255,0.6)' : '#555',
                                                            marginTop: '4px'
                                                        }}>
                                                            {activity.metric_definitions.map(m => m.name).join(', ')}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            width: '100%',
            overflow: 'hidden',
            position: 'relative'
        }}>
            {/* Page Header */}
            <div style={{
                padding: '80px 40px 12px 40px',
                background: 'var(--bg-color)',
                borderBottom: '1px solid #333',
                zIndex: 10
            }}>
                {/* Sub-navigation Tabs */}
                <div style={{
                    display: 'flex',
                    gap: '8px',
                    borderBottom: '1px solid #333',
                    paddingBottom: '0'
                }}>
                    <button
                        onClick={() => setActiveTab('goals')}
                        style={{
                            padding: '12px 24px',
                            background: activeTab === 'goals' ? '#2196f3' : 'transparent',
                            border: 'none',
                            borderBottom: activeTab === 'goals' ? '3px solid #2196f3' : '3px solid transparent',
                            color: activeTab === 'goals' ? 'white' : '#888',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: activeTab === 'goals' ? 600 : 500,
                            transition: 'all 0.2s ease'
                        }}
                    >
                        Goals
                    </button>
                    <button
                        onClick={() => setActiveTab('sessions')}
                        style={{
                            padding: '12px 24px',
                            background: activeTab === 'sessions' ? '#2196f3' : 'transparent',
                            border: 'none',
                            borderBottom: activeTab === 'sessions' ? '3px solid #2196f3' : '3px solid transparent',
                            color: activeTab === 'sessions' ? 'white' : '#888',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: activeTab === 'sessions' ? 600 : 500,
                            transition: 'all 0.2s ease'
                        }}
                    >
                        Sessions
                    </button>
                    <button
                        onClick={() => setActiveTab('activities')}
                        style={{
                            padding: '12px 24px',
                            background: activeTab === 'activities' ? '#2196f3' : 'transparent',
                            border: 'none',
                            borderBottom: activeTab === 'activities' ? '3px solid #2196f3' : '3px solid transparent',
                            color: activeTab === 'activities' ? 'white' : '#888',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: activeTab === 'activities' ? 600 : 500,
                            transition: 'all 0.2s ease'
                        }}
                    >
                        Activities
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px 40px 40px 40px'
            }}>
                <div style={{
                    maxWidth: (activeTab === 'activities' || activeTab === 'goals' || activeTab === 'sessions') ? '100%' : '1200px',
                    margin: '0 auto',
                    height: (activeTab === 'activities' || activeTab === 'goals' || activeTab === 'sessions') ? '100%' : 'auto'
                }}>
                    {renderTabContent()}
                </div>
            </div>
        </div>
    );
}

export default Analytics;
