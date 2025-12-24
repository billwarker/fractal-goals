import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import { useHeader } from '../context/HeaderContext';
import ActivitiesManager from '../components/ActivitiesManager';
import '../App.css';

/**
 * Sessions Page - View and manage practice sessions
 * Displays all practice sessions for the current fractal in card format with horizontal sections
 */
function Sessions() {
    const { rootId } = useParams();
    const navigate = useNavigate();
    // Local page header is now rendered directly


    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterCompleted, setFilterCompleted] = useState('all');
    const [parentGoals, setParentGoals] = useState({});
    const [showActivitiesModal, setShowActivitiesModal] = useState(false);
    const [activities, setActivities] = useState([]);

    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        fetchSessions();
        fetchActivities();
    }, [rootId, navigate]);

    const fetchActivities = async () => {
        try {
            const res = await fractalApi.getActivities(rootId);
            setActivities(res.data);
        } catch (err) {
            console.error("Failed to fetch activities", err);
        }
    };

    // Filter logic removed from header effect


    const fetchSessions = async () => {
        try {
            const res = await fractalApi.getSessions(rootId);
            setSessions(res.data);

            // Fetch parent goals for all sessions
            const allParentIds = new Set();
            res.data.forEach(session => {
                if (session.attributes?.parent_ids) {
                    session.attributes.parent_ids.forEach(id => allParentIds.add(id));
                }
            });

            // Fetch goal details for all parent IDs
            const goalsMap = {};
            for (const goalId of allParentIds) {
                try {
                    const goalRes = await fractalApi.getGoal(rootId, goalId);
                    goalsMap[goalId] = goalRes.data;
                } catch (err) {
                    console.error(`Failed to fetch goal ${goalId}`, err);
                }
            }
            setParentGoals(goalsMap);
            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch practice sessions", err);
            setLoading(false);
            if (err.response?.status === 404) {
                navigate('/');
            }
        }
    };

    const filteredSessions = sessions.filter(session => {
        if (filterCompleted === 'completed') return session.attributes?.completed;
        if (filterCompleted === 'incomplete') return !session.attributes?.completed;
        return true;
    });

    // Helper to format date
    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    // Helper to format time
    const formatTime = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Helper to get formatted duration
    const getDuration = (session) => {
        // Try to get from session_data first (calculated from sections)
        const sessionData = session.attributes?.session_data;

        let minutes = 0;
        if (session.attributes?.duration_minutes) {
            minutes = session.attributes.duration_minutes;
        } else if (sessionData?.total_duration_minutes) {
            minutes = sessionData.total_duration_minutes;
        }

        if (!minutes) return '-';

        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;

        if (hours > 0) {
            return `${hours}h ${mins > 0 ? mins + 'm' : ''}`;
        }
        return `${mins}m`;
    };

    if (loading) {
        return <div className="page-container" style={{ textAlign: 'center', color: '#666', padding: '40px' }}>Loading sessions...</div>;
    }

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            width: '100%',
            overflow: 'hidden',
            position: 'relative'
        }}>
            {/* Page Header (Fixed) */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '80px 40px 20px 40px', // Top padding to clear fixed nav
                background: 'var(--bg-color)',
                borderBottom: '1px solid #333',
                zIndex: 10
            }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => setFilterCompleted('all')}
                        style={{
                            padding: '6px 12px',
                            background: filterCompleted === 'all' ? '#333' : 'transparent',
                            border: '1px solid #444',
                            borderRadius: '4px',
                            color: filterCompleted === 'all' ? 'white' : '#888',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500
                        }}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setFilterCompleted('incomplete')}
                        style={{
                            padding: '6px 12px',
                            background: filterCompleted === 'incomplete' ? '#333' : 'transparent',
                            border: '1px solid #444',
                            borderRadius: '4px',
                            color: filterCompleted === 'incomplete' ? 'white' : '#888',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500
                        }}
                    >
                        Incomplete
                    </button>
                    <button
                        onClick={() => setFilterCompleted('completed')}
                        style={{
                            padding: '6px 12px',
                            background: filterCompleted === 'completed' ? '#333' : 'transparent',
                            border: '1px solid #444',
                            borderRadius: '4px',
                            color: filterCompleted === 'completed' ? 'white' : '#888',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500
                        }}
                    >
                        Completed
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={() => navigate(`/${rootId}/create-session-template`)}
                        style={{
                            padding: '6px 16px',
                            background: '#2196f3',
                            border: 'none',
                            borderRadius: '4px',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        + Create Template
                    </button>
                    <button
                        onClick={() => setShowActivitiesModal(true)}
                        style={{
                            padding: '6px 16px',
                            background: '#333',
                            border: '1px solid #444',
                            borderRadius: '4px',
                            color: '#ccc',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500
                        }}
                    >
                        Manage Activities
                    </button>
                </div>
            </div>

            {/* Scrollable Sessions List */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px 40px',
                paddingBottom: '40px'
            }}>
                {filteredSessions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                        No sessions found. Start by clicking "+ ADD SESSION" in the navigation.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {filteredSessions.map(session => {
                            const sessionData = session.attributes?.session_data;
                            const sessionParentGoals = (session.attributes?.parent_ids || [])
                                .map(id => parentGoals[id])
                                .filter(Boolean);

                            return (
                                <div
                                    key={session.id}
                                    style={{
                                        background: '#1e1e1e',
                                        border: '1px solid #333',
                                        borderRadius: '8px',
                                        overflow: 'hidden',
                                        background: '#1e1e1e',
                                        border: '1px solid #333',
                                        borderRadius: '8px',
                                        overflow: 'hidden',
                                    }}
                                >
                                    {/* Top Level: High-level session info */}
                                    <div style={{
                                        padding: '16px',
                                        background: '#2a2a2a',
                                        borderBottom: '1px solid #333',
                                        display: 'grid',
                                        gridTemplateColumns: '2fr 1fr 1fr 1fr',
                                        gap: '16px',
                                        alignItems: 'center'
                                    }}>
                                        {/* Session Name (Link) */}
                                        <div>
                                            <Link
                                                to={`/${rootId}/session/${session.id}`}
                                                style={{
                                                    fontWeight: 600,
                                                    fontSize: '16px',
                                                    textDecoration: session.attributes?.completed ? 'line-through' : 'none',
                                                    color: '#2196f3',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {session.name}
                                            </Link>
                                            {session.attributes?.description && (
                                                <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                                                    {session.attributes.description}
                                                </div>
                                            )}
                                        </div>

                                        {/* Date */}
                                        <div>
                                            <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>Date</div>
                                            <div style={{ fontSize: '14px' }}>{formatDate(session.attributes?.created_at)}</div>
                                            <div style={{ fontSize: '11px', color: '#666' }}>
                                                {formatTime(session.attributes?.created_at)}
                                            </div>
                                        </div>

                                        {/* Duration */}
                                        <div>
                                            <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>Duration</div>
                                            <div style={{ fontSize: '14px', fontWeight: 500 }}>{getDuration(session)}</div>
                                        </div>

                                        {/* Template */}
                                        <div>
                                            <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>Template</div>
                                            {sessionData?.template_name ? (
                                                <span style={{
                                                    background: '#2196f3',
                                                    padding: '4px 8px',
                                                    borderRadius: '3px',
                                                    fontSize: '12px',
                                                    display: 'inline-block',
                                                    color: 'white'
                                                }}>
                                                    {sessionData.template_name}
                                                </span>
                                            ) : (
                                                <span style={{ color: '#666', fontSize: '12px' }}>None</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Parent Goals Section */}
                                    {sessionParentGoals.length > 0 && (
                                        <div style={{
                                            padding: '12px 16px',
                                            background: '#252525',
                                            borderBottom: '1px solid #333'
                                        }}>
                                            <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>
                                                Short-Term Goals:
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                {sessionParentGoals.map(goal => (
                                                    <div
                                                        key={goal.id}
                                                        style={{
                                                            padding: '6px 12px',
                                                            background: '#1e1e1e',
                                                            border: '1px solid #4caf50',
                                                            borderRadius: '4px',
                                                            fontSize: '13px',
                                                            color: '#4caf50'
                                                        }}
                                                    >
                                                        {goal.name}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Bottom Level: Session data with horizontal sections */}
                                    <div style={{ padding: '16px' }}>
                                        {sessionData?.sections && sessionData.sections.length > 0 ? (
                                            <>
                                                {/* Sections Grid - Horizontal Layout */}
                                                <div style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: `repeat(${sessionData.sections.length}, 1fr)`,
                                                    gap: '12px',
                                                    marginBottom: '12px'
                                                }}>
                                                    {sessionData.sections.map((section, sectionIndex) => (
                                                        <div
                                                            key={sectionIndex}
                                                            style={{
                                                                background: '#252525',
                                                                padding: '12px',
                                                                borderRadius: '6px',
                                                                borderLeft: '3px solid #2196f3',
                                                                display: 'flex',
                                                                flexDirection: 'column'
                                                            }}
                                                        >
                                                            {/* Section Header */}
                                                            <div style={{
                                                                fontWeight: 600,
                                                                fontSize: '14px',
                                                                marginBottom: '4px',
                                                                paddingBottom: '8px',
                                                                borderBottom: '1px solid #333'
                                                            }}>
                                                                {section.name}
                                                            </div>

                                                            <div style={{
                                                                fontSize: '11px',
                                                                color: '#888',
                                                                marginBottom: '12px'
                                                            }}>
                                                                {section.actual_duration_minutes || section.duration_minutes} min
                                                            </div>

                                                            {/* Exercises - Vertical List */}
                                                            {section.exercises && section.exercises.length > 0 && (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                    {section.exercises.map((exercise, exerciseIndex) => {
                                                                        const actDef = exercise.type === 'activity' ? activities.find(a => a.id === exercise.activity_id) : null;

                                                                        const getMetricInfo = (metricId) => {
                                                                            if (!actDef) return { name: '', unit: '' };
                                                                            const m = actDef.metric_definitions.find(md => md.id === metricId);
                                                                            return m || { name: '', unit: '' };
                                                                        };

                                                                        return (
                                                                            <div
                                                                                key={exerciseIndex}
                                                                                style={{
                                                                                    padding: '8px',
                                                                                    background: '#1e1e1e',
                                                                                    borderRadius: '4px',
                                                                                    fontSize: '13px',
                                                                                    border: exercise.type === 'activity' ? '1px solid #33691e' : 'none'
                                                                                }}
                                                                            >
                                                                                <div style={{ display: 'flex', alignItems: 'start', gap: '6px' }}>
                                                                                    {exercise.type !== 'activity' && (
                                                                                        <span style={{ fontSize: '14px', marginTop: '2px', color: exercise.completed ? '#4caf50' : '#666' }}>
                                                                                            {exercise.completed ? '✓' : '○'}
                                                                                        </span>
                                                                                    )}
                                                                                    <div style={{ flex: 1 }}>
                                                                                        <div style={{
                                                                                            fontWeight: 500,
                                                                                            textDecoration: exercise.completed ? 'line-through' : 'none',
                                                                                            marginBottom: '2px',
                                                                                            color: exercise.completed ? '#888' : 'white'
                                                                                        }}>
                                                                                            {exercise.name}
                                                                                        </div>

                                                                                        {/* Activity Data Display */}
                                                                                        {exercise.type === 'activity' && (
                                                                                            <div style={{ marginTop: '4px', fontSize: '12px', color: '#ccc' }}>
                                                                                                {/* Sets View */}
                                                                                                {exercise.has_sets && exercise.sets && exercise.sets.length > 0 && (
                                                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '8px', borderLeft: '2px solid #333', marginTop: '6px' }}>
                                                                                                        {exercise.sets.map((set, setIdx) => (
                                                                                                            <div key={setIdx} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                                                                                <span style={{ color: '#666', fontSize: '11px', width: '40px' }}>SET {setIdx + 1}</span>
                                                                                                                {set.metrics?.map(m => {
                                                                                                                    const mInfo = getMetricInfo(m.metric_id);
                                                                                                                    if (!m.value) return null;
                                                                                                                    return (
                                                                                                                        <div key={m.metric_id} style={{ display: 'flex', gap: '4px' }}>
                                                                                                                            <span style={{ color: '#888' }}>{mInfo.name}:</span>
                                                                                                                            <span style={{ fontWeight: 'bold' }}>{m.value} {mInfo.unit}</span>
                                                                                                                        </div>
                                                                                                                    );
                                                                                                                })}
                                                                                                            </div>
                                                                                                        ))}
                                                                                                    </div>
                                                                                                )}

                                                                                                {/* Single Metrics View */}
                                                                                                {!exercise.has_sets && exercise.has_metrics && exercise.metrics && (
                                                                                                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '4px' }}>
                                                                                                        {exercise.metrics.map(m => {
                                                                                                            const mInfo = getMetricInfo(m.metric_id);
                                                                                                            if (!m.value) return null;
                                                                                                            return (
                                                                                                                <div key={m.metric_id} style={{ background: '#263238', padding: '2px 8px', borderRadius: '3px', border: '1px solid #37474F' }}>
                                                                                                                    <span style={{ color: '#aaa', marginRight: '4px' }}>{mInfo.name}:</span>
                                                                                                                    <span style={{ fontWeight: 'bold' }}>{m.value} {mInfo.unit}</span>
                                                                                                                </div>
                                                                                                            )
                                                                                                        })}
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                        )}

                                                                                        {exercise.description && (
                                                                                            <div style={{
                                                                                                fontSize: '11px',
                                                                                                color: '#888',
                                                                                                marginTop: '4px',
                                                                                                marginBottom: '4px'
                                                                                            }}>
                                                                                                {exercise.description}
                                                                                            </div>
                                                                                        )}
                                                                                        {exercise.notes && (
                                                                                            <div style={{
                                                                                                fontSize: '11px',
                                                                                                color: '#4caf50',
                                                                                                fontStyle: 'italic'
                                                                                            }}>
                                                                                                💡 {exercise.notes}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Session Notes */}
                                                {sessionData.notes && (
                                                    <div style={{
                                                        padding: '12px',
                                                        background: '#252525',
                                                        borderRadius: '6px',
                                                        borderLeft: '3px solid #ff9800'
                                                    }}>
                                                        <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>
                                                            Session Notes:
                                                        </div>
                                                        <div style={{ fontSize: '13px' }}>{sessionData.notes}</div>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <p style={{ color: '#666', textAlign: 'center', padding: '20px', margin: 0 }}>
                                                No session data available
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {showActivitiesModal && (
                <ActivitiesManager
                    rootId={rootId}
                    onClose={() => setShowActivitiesModal(false)}
                />
            )}
        </div>
    );
}

export default Sessions;
