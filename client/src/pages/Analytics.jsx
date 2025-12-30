import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import { useActivities } from '../contexts/ActivitiesContext';
import ScatterPlot from '../components/analytics/ScatterPlot';
import LineGraph from '../components/analytics/LineGraph';
import '../App.css';

/**
 * Analytics Page - View insights and statistics about practice sessions
 */
function Analytics() {
    const { rootId } = useParams();
    const navigate = useNavigate();
    const { activities, fetchActivities, loading: activitiesLoading } = useActivities();

    const [loading, setLoading] = useState(true);
    const [sessions, setSessions] = useState([]);
    const [activeTab, setActiveTab] = useState('goals'); // 'goals', 'sessions', or 'activities'

    // Activities tab state
    const [selectedActivity, setSelectedActivity] = useState(null);
    const [activityInstances, setActivityInstances] = useState({});
    const [selectedGraph, setSelectedGraph] = useState('scatter'); // 'scatter', 'line'
    const [selectedMetric, setSelectedMetric] = useState(null); // For line graph
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
            // Fetch sessions and activities for analytics
            const sessionsRes = await fractalApi.getSessions(rootId);
            await fetchActivities(rootId); // Use context method

            setSessions(sessionsRes.data);

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
                                    instancesMap[exercise.activity_id].push({
                                        ...exercise,
                                        session_id: session.id,
                                        session_name: session.name,
                                        session_date: session.attributes?.created_at
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
                return (
                    <div style={{
                        background: '#1e1e1e',
                        border: '1px solid #333',
                        borderRadius: '8px',
                        padding: '40px',
                        textAlign: 'center'
                    }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎯</div>
                        <h2 style={{ fontSize: '24px', fontWeight: 400, color: '#ccc', marginBottom: '12px' }}>
                            Goals Analytics
                        </h2>
                        <p style={{ fontSize: '14px', color: '#888', maxWidth: '500px', margin: '0 auto' }}>
                            Track goal completion rates, progress over time, and target achievement statistics.
                        </p>
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
