import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import { useActivities } from '../contexts/ActivitiesContext';
import ScatterPlot from '../components/analytics/ScatterPlot';
import LineGraph from '../components/analytics/LineGraph';
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
            // Sort by session count (descending), then by name
            if (b.session_count !== a.session_count) return b.session_count - a.session_count;
            return a.name.localeCompare(b.name);
        });
    };

    // Goal type colors
    const goalTypeColors = {
        'UltimateGoal': '#9c27b0',
        'LongTermGoal': '#673ab7',
        'MidTermGoal': '#3f51b5',
        'ShortTermGoal': '#2196f3',
        'ImmediateGoal': '#00bcd4',
        'MicroGoal': '#009688',
        'NanoGoal': '#4caf50'
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

                return (
                    <div style={{
                        display: 'flex',
                        gap: '20px',
                        height: 'calc(100vh - 180px)',
                        minHeight: '600px'
                    }}>
                        {/* Main Content Area */}
                        <div style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '20px',
                            overflow: 'hidden'
                        }}>
                            {/* High-Level Stats Cards */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(4, 1fr)',
                                gap: '16px'
                            }}>
                                <div style={{
                                    background: '#1e1e1e',
                                    border: '1px solid #333',
                                    borderRadius: '8px',
                                    padding: '20px'
                                }}>
                                    <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#4caf50', marginBottom: '8px' }}>
                                        {summary.completed_goals || 0}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Goals Completed
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                                        {summary.completion_rate?.toFixed(1) || 0}% completion rate
                                    </div>
                                </div>

                                <div style={{
                                    background: '#1e1e1e',
                                    border: '1px solid #333',
                                    borderRadius: '8px',
                                    padding: '20px'
                                }}>
                                    <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#2196f3', marginBottom: '8px' }}>
                                        {summary.avg_goal_age_days || 0}d
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Avg Goal Age
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                                        Days since creation
                                    </div>
                                </div>

                                <div style={{
                                    background: '#1e1e1e',
                                    border: '1px solid #333',
                                    borderRadius: '8px',
                                    padding: '20px'
                                }}>
                                    <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#ff9800', marginBottom: '8px' }}>
                                        {summary.avg_time_to_completion_days || 0}d
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Avg Time to Complete
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                                        Days from creation to completion
                                    </div>
                                </div>

                                <div style={{
                                    background: '#1e1e1e',
                                    border: '1px solid #333',
                                    borderRadius: '8px',
                                    padding: '20px'
                                }}>
                                    <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#9c27b0', marginBottom: '8px' }}>
                                        {formatDuration(summary.avg_duration_to_completion_seconds || 0)}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Avg Duration Invested
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                                        Time spent per completed goal
                                    </div>
                                </div>
                            </div>

                            {/* Goal Detail View */}
                            {selectedGoal ? (
                                <div style={{
                                    flex: 1,
                                    background: '#1e1e1e',
                                    border: '1px solid #333',
                                    borderRadius: '8px',
                                    padding: '24px',
                                    overflow: 'auto'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#fff' }}>
                                                    {selectedGoal.name}
                                                </h2>
                                                <span style={{
                                                    padding: '4px 8px',
                                                    background: goalTypeColors[selectedGoal.type] || '#666',
                                                    borderRadius: '4px',
                                                    fontSize: '11px',
                                                    fontWeight: 500,
                                                    color: 'white'
                                                }}>
                                                    {selectedGoal.type.replace('Goal', '')}
                                                </span>
                                                {selectedGoal.completed && (
                                                    <span style={{
                                                        padding: '4px 8px',
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
                                            {selectedGoal.description && (
                                                <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>
                                                    {selectedGoal.description}
                                                </p>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => setSelectedGoal(null)}
                                            style={{
                                                background: '#333',
                                                border: 'none',
                                                borderRadius: '4px',
                                                padding: '8px 12px',
                                                color: '#888',
                                                cursor: 'pointer',
                                                fontSize: '12px'
                                            }}
                                        >
                                            ← Back to List
                                        </button>
                                    </div>

                                    {/* Goal Stats */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(3, 1fr)',
                                        gap: '16px',
                                        marginBottom: '24px'
                                    }}>
                                        <div style={{
                                            background: '#252525',
                                            padding: '16px',
                                            borderRadius: '6px',
                                            border: '1px solid #333'
                                        }}>
                                            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#2196f3' }}>
                                                {formatDuration(selectedGoal.total_duration_seconds || 0)}
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                                                Total Time Spent
                                            </div>
                                        </div>

                                        <div style={{
                                            background: '#252525',
                                            padding: '16px',
                                            borderRadius: '6px',
                                            border: '1px solid #333'
                                        }}>
                                            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#4caf50' }}>
                                                {selectedGoal.session_count || 0}
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                                                Sessions
                                            </div>
                                        </div>

                                        <div style={{
                                            background: '#252525',
                                            padding: '16px',
                                            borderRadius: '6px',
                                            border: '1px solid #333'
                                        }}>
                                            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ff9800' }}>
                                                {selectedGoal.age_days || 0}d
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                                                Age
                                            </div>
                                        </div>
                                    </div>

                                    {/* Activity Breakdown */}
                                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#ccc', marginBottom: '12px' }}>
                                        Activity Breakdown
                                    </h3>
                                    {selectedGoal.activity_breakdown?.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {selectedGoal.activity_breakdown
                                                .sort((a, b) => b.instance_count - a.instance_count)
                                                .map(activity => (
                                                    <div
                                                        key={activity.activity_id}
                                                        style={{
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            padding: '12px 16px',
                                                            background: '#252525',
                                                            border: '1px solid #333',
                                                            borderRadius: '6px'
                                                        }}
                                                    >
                                                        <div style={{ fontSize: '13px', fontWeight: 500, color: '#ccc' }}>
                                                            {activity.activity_name}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '12px', color: '#888' }}>
                                                                {activity.instance_count} instance{activity.instance_count !== 1 ? 's' : ''}
                                                            </span>
                                                            {activity.total_duration_seconds > 0 && (
                                                                <span style={{ fontSize: '12px', color: '#2196f3' }}>
                                                                    {formatDuration(activity.total_duration_seconds)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    ) : (
                                        <div style={{
                                            padding: '20px',
                                            textAlign: 'center',
                                            color: '#666',
                                            fontSize: '13px',
                                            background: '#252525',
                                            borderRadius: '6px'
                                        }}>
                                            No activities recorded for this goal
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{
                                    flex: 1,
                                    background: '#1e1e1e',
                                    border: '1px solid #333',
                                    borderRadius: '8px',
                                    padding: '40px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexDirection: 'column'
                                }}>
                                    <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>🎯</div>
                                    <h3 style={{ fontSize: '16px', fontWeight: 400, color: '#888', margin: 0 }}>
                                        Select a goal to view details
                                    </h3>
                                    <p style={{ fontSize: '13px', color: '#666', marginTop: '8px' }}>
                                        Click on any goal in the list to see time spent, sessions, and activity breakdown
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Goal Selector Side Pane */}
                        <div style={{
                            width: '340px',
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
                                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#ccc', marginBottom: '12px' }}>
                                    Goals
                                </h3>

                                {/* Filters */}
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <select
                                        value={goalTypeFilter}
                                        onChange={(e) => setGoalTypeFilter(e.target.value)}
                                        style={{
                                            padding: '6px 10px',
                                            background: '#333',
                                            border: '1px solid #444',
                                            borderRadius: '4px',
                                            color: 'white',
                                            fontSize: '11px',
                                            cursor: 'pointer',
                                            flex: 1
                                        }}
                                    >
                                        <option value="all">All Types</option>
                                        <option value="ShortTermGoal">Short Term</option>
                                        <option value="ImmediateGoal">Immediate</option>
                                        <option value="MidTermGoal">Mid Term</option>
                                        <option value="LongTermGoal">Long Term</option>
                                    </select>

                                    <select
                                        value={goalStatusFilter}
                                        onChange={(e) => setGoalStatusFilter(e.target.value)}
                                        style={{
                                            padding: '6px 10px',
                                            background: '#333',
                                            border: '1px solid #444',
                                            borderRadius: '4px',
                                            color: 'white',
                                            fontSize: '11px',
                                            cursor: 'pointer',
                                            flex: 1
                                        }}
                                    >
                                        <option value="all">All Status</option>
                                        <option value="active">Active</option>
                                        <option value="completed">Completed</option>
                                    </select>
                                </div>
                            </div>

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
                                            const typeColor = goalTypeColors[goal.type] || '#666';

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
                                                        marginBottom: '6px'
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
                                                        display: 'flex',
                                                        gap: '12px',
                                                        fontSize: '11px',
                                                        color: isSelected ? 'rgba(255,255,255,0.7)' : '#888'
                                                    }}>
                                                        <span>{goal.session_count} session{goal.session_count !== 1 ? 's' : ''}</span>
                                                        {goal.total_duration_seconds > 0 && (
                                                            <span>{formatDuration(goal.total_duration_seconds)}</span>
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
                return (
                    <div style={{
                        background: '#1e1e1e',
                        border: '1px solid #333',
                        borderRadius: '8px',
                        padding: '40px',
                        textAlign: 'center'
                    }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
                        <h2 style={{ fontSize: '24px', fontWeight: 400, color: '#ccc', marginBottom: '12px' }}>
                            Sessions Analytics
                        </h2>
                        <p style={{ fontSize: '14px', color: '#888', maxWidth: '500px', margin: '0 auto' }}>
                            View session frequency, duration trends, and completion patterns over time.
                        </p>

                        {/* Quick Stats */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: '20px',
                            marginTop: '40px',
                            maxWidth: '800px',
                            margin: '40px auto 0'
                        }}>
                            <div style={{
                                background: '#252525',
                                padding: '20px',
                                borderRadius: '6px',
                                border: '1px solid #333'
                            }}>
                                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#2196f3' }}>
                                    {sessions.length}
                                </div>
                                <div style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
                                    Total Sessions
                                </div>
                            </div>

                            <div style={{
                                background: '#252525',
                                padding: '20px',
                                borderRadius: '6px',
                                border: '1px solid #333'
                            }}>
                                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#4caf50' }}>
                                    {sessions.filter(s => s.attributes?.completed).length}
                                </div>
                                <div style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
                                    Completed
                                </div>
                            </div>

                            <div style={{
                                background: '#252525',
                                padding: '20px',
                                borderRadius: '6px',
                                border: '1px solid #333'
                            }}>
                                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#ff9800' }}>
                                    {sessions.filter(s => !s.attributes?.completed).length}
                                </div>
                                <div style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
                                    In Progress
                                </div>
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
                padding: '80px 40px 20px 40px',
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
                padding: '40px',
                paddingBottom: '40px'
            }}>
                <div style={{
                    maxWidth: activeTab === 'activities' ? '100%' : '1200px',
                    margin: '0 auto',
                    height: activeTab === 'activities' ? '100%' : 'auto'
                }}>
                    {renderTabContent()}
                </div>
            </div>
        </div>
    );
}

export default Analytics;
