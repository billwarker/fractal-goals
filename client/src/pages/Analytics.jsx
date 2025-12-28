import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import Plotly from 'plotly.js-dist-min';
import '../App.css';

/**
 * Analytics Page - View insights and statistics about practice sessions
 */
function Analytics() {
    const { rootId } = useParams();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [sessions, setSessions] = useState([]);
    const [activities, setActivities] = useState([]);
    const [activeTab, setActiveTab] = useState('goals'); // 'goals', 'sessions', or 'activities'

    // Activities tab state
    const [selectedActivity, setSelectedActivity] = useState(null);
    const [activityInstances, setActivityInstances] = useState({});
    const [selectedGraph, setSelectedGraph] = useState('scatter'); // 'scatter', etc.

    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        fetchData();
    }, [rootId, navigate]);

    const fetchData = async () => {
        try {
            // Fetch sessions and activities for analytics
            const [sessionsRes, activitiesRes] = await Promise.all([
                fractalApi.getSessions(rootId),
                fractalApi.getActivities(rootId)
            ]);

            setSessions(sessionsRes.data);
            setActivities(activitiesRes.data);

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

    // Render scatter plot for selected activity
    const renderScatterPlot = () => {
        console.log('renderScatterPlot called', { selectedActivity, activityInstances });

        if (!selectedActivity) {
            return (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: '#666',
                    fontSize: '14px'
                }}>
                    Select an activity to view analytics
                </div>
            );
        }

        const instances = activityInstances[selectedActivity.id] || [];
        const activityDef = activities.find(a => a.id === selectedActivity.id);

        console.log('Activity instances:', instances);
        console.log('Activity definition:', activityDef);

        if (!activityDef || instances.length === 0) {
            return (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: '#666',
                    fontSize: '14px'
                }}>
                    No data available for this activity
                </div>
            );
        }

        const metrics = activityDef.metric_definitions || [];

        console.log('Metrics:', metrics);

        if (metrics.length === 0) {
            return (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: '#666',
                    fontSize: '14px'
                }}>
                    This activity has no metrics to display
                </div>
            );
        }

        // Collect data points from instances
        const dataPoints = [];
        instances.forEach(instance => {
            const point = {
                session_name: instance.session_name,
                session_date: instance.session_date
            };

            // For activities with sets
            if (instance.has_sets && instance.sets) {
                instance.sets.forEach((set, setIdx) => {
                    const setPoint = { ...point, set_number: setIdx + 1 };
                    if (set.metrics) {
                        set.metrics.forEach(m => {
                            const metricDef = metrics.find(md => md.id === m.metric_id);
                            if (metricDef && m.value) {
                                setPoint[metricDef.name] = parseFloat(m.value);
                            }
                        });
                    }
                    if (Object.keys(setPoint).length > 3) { // Has at least one metric
                        dataPoints.push(setPoint);
                    }
                });
            }
            // For activities without sets
            else if (instance.metrics) {
                instance.metrics.forEach(m => {
                    const metricDef = metrics.find(md => md.id === m.metric_id);
                    if (metricDef && m.value) {
                        point[metricDef.name] = parseFloat(m.value);
                    }
                });
                if (Object.keys(point).length > 2) { // Has at least one metric
                    dataPoints.push(point);
                }
            }
        });

        console.log('Data points:', dataPoints);

        if (dataPoints.length === 0) {
            return (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: '#666',
                    fontSize: '14px'
                }}>
                    No metric data available for this activity
                </div>
            );
        }

        // Determine which metrics to plot (up to 3)
        const metricsToPlot = metrics.slice(0, 3);
        const is3D = metricsToPlot.length === 3;

        console.log('Metrics to plot:', metricsToPlot, 'is3D:', is3D);

        // Prepare plot data
        const xData = dataPoints.map(p => p[metricsToPlot[0].name]).filter(v => v != null);
        const yData = metricsToPlot[1] ? dataPoints.map(p => p[metricsToPlot[1].name]).filter(v => v != null) : [];
        const zData = is3D ? dataPoints.map(p => p[metricsToPlot[2].name]).filter(v => v != null) : [];

        console.log('Plot data:', { xData, yData, zData });

        if (xData.length === 0) {
            return (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: '#666',
                    fontSize: '14px'
                }}>
                    No valid metric values found
                </div>
            );
        }

        const plotData = [{
            x: xData,
            y: yData.length > 0 ? yData : undefined,
            z: zData.length > 0 ? zData : undefined,
            mode: 'markers',
            type: is3D ? 'scatter3d' : 'scatter',
            marker: {
                size: 8,
                color: '#2196f3',
                opacity: 0.7,
                line: {
                    color: '#1976d2',
                    width: 1
                }
            },
            text: dataPoints.map(p =>
                `${p.session_name}<br>Set ${p.set_number || 1}<br>${new Date(p.session_date).toLocaleDateString()}`
            ),
            hovertemplate: '%{text}<br>' +
                `${metricsToPlot[0].name}: %{x} ${metricsToPlot[0].unit}<br>` +
                (metricsToPlot[1] ? `${metricsToPlot[1].name}: %{y} ${metricsToPlot[1].unit}<br>` : '') +
                (is3D ? `${metricsToPlot[2].name}: %{z} ${metricsToPlot[2].unit}<br>` : '') +
                '<extra></extra>'
        }];

        const layout = {
            title: {
                text: `${selectedActivity.name} - Metrics Analysis`,
                font: { color: '#ccc', size: 16 }
            },
            paper_bgcolor: '#1e1e1e',
            plot_bgcolor: '#252525',
            font: { color: '#ccc' },
            margin: { l: 60, r: 40, t: 60, b: 60 },
            height: is3D ? 700 : 500, // Larger height for 3D plots
            autosize: true
        };

        // Add appropriate axes based on plot type
        if (is3D) {
            layout.scene = {
                xaxis: {
                    title: {
                        text: `${metricsToPlot[0].name} (${metricsToPlot[0].unit})`,
                        font: { color: '#ccc', size: 12 }
                    },
                    gridcolor: '#333',
                    backgroundcolor: '#252525'
                },
                yaxis: {
                    title: {
                        text: `${metricsToPlot[1].name} (${metricsToPlot[1].unit})`,
                        font: { color: '#ccc', size: 12 }
                    },
                    gridcolor: '#333',
                    backgroundcolor: '#252525'
                },
                zaxis: {
                    title: {
                        text: `${metricsToPlot[2].name} (${metricsToPlot[2].unit})`,
                        font: { color: '#ccc', size: 12 }
                    },
                    gridcolor: '#333',
                    backgroundcolor: '#252525'
                }
            };
        } else {
            layout.xaxis = {
                title: {
                    text: `${metricsToPlot[0].name} (${metricsToPlot[0].unit})`,
                    font: { color: '#ccc', size: 12 }
                },
                gridcolor: '#333',
                zerolinecolor: '#444'
            };
            if (metricsToPlot[1]) {
                layout.yaxis = {
                    title: {
                        text: `${metricsToPlot[1].name} (${metricsToPlot[1].unit})`,
                        font: { color: '#ccc', size: 12 }
                    },
                    gridcolor: '#333',
                    zerolinecolor: '#444'
                };
            }
        }

        console.log('Rendering plot with data:', plotData, 'layout:', layout);

        return <PlotlyChart data={plotData} layout={layout} />;
    };

    // Custom Plotly component that uses direct Plotly.js rendering
    const PlotlyChart = ({ data, layout }) => {
        const plotRef = useRef(null);

        useEffect(() => {
            if (plotRef.current && data && data.length > 0) {
                console.log('PlotlyChart useEffect - rendering plot');
                try {
                    Plotly.newPlot(plotRef.current, data, layout, {
                        responsive: true,
                        displayModeBar: true,
                        displaylogo: false
                    });
                } catch (error) {
                    console.error('Error rendering Plotly chart:', error);
                }
            }

            // Cleanup
            return () => {
                if (plotRef.current) {
                    Plotly.purge(plotRef.current);
                }
            };
        }, [data, layout]);

        return (
            <div
                ref={plotRef}
                style={{
                    width: '100%',
                    height: '100%',
                    minHeight: '500px'
                }}
            />
        );
    };

    if (loading) {
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

                return (
                    <div style={{
                        display: 'flex',
                        gap: '20px',
                        height: 'calc(100vh - 280px)', // Full height minus header
                        minHeight: '500px'
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
                                    gap: '8px',
                                    alignItems: 'center'
                                }}>
                                    <span style={{ fontSize: '12px', color: '#888', marginRight: '8px' }}>
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
                                </div>
                            </div>

                            {/* Graph Area */}
                            <div style={{
                                flex: 1,
                                padding: '20px',
                                overflow: 'hidden'
                            }}>
                                {renderScatterPlot()}
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
                <h1 style={{
                    fontSize: '28px',
                    fontWeight: 300,
                    margin: 0,
                    marginBottom: '8px',
                    color: 'white'
                }}>
                    Analytics
                </h1>
                <p style={{
                    fontSize: '14px',
                    color: '#888',
                    margin: '0 0 20px 0'
                }}>
                    Insights and statistics about your practice sessions
                </p>

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
