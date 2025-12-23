import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import '../App.css';

/**
 * Sessions Page - View and manage practice sessions
 * Displays all practice sessions for the current fractal in table format
 */
function Sessions() {
    const { rootId } = useParams();
    const navigate = useNavigate();

    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedSession, setSelectedSession] = useState(null);
    const [filterCompleted, setFilterCompleted] = useState('all'); // 'all', 'completed', 'incomplete'

    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        fetchSessions();
    }, [rootId, navigate]);

    const fetchSessions = async () => {
        try {
            const res = await fractalApi.getSessions(rootId);
            setSessions(res.data);
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

    const handleToggleCompletion = async (sessionId, currentStatus) => {
        try {
            await fractalApi.toggleGoalCompletion(rootId, sessionId, !currentStatus);
            await fetchSessions();
            if (selectedSession?.id === sessionId) {
                setSelectedSession(null);
            }
        } catch (err) {
            alert('Error updating session completion: ' + err.message);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const formatTime = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    const getSectionCount = (sessionData) => {
        return sessionData?.sections?.length || 0;
    };

    const getDuration = (sessionData) => {
        if (sessionData?.actual_duration_minutes) {
            return `${sessionData.actual_duration_minutes}m`;
        }
        if (sessionData?.total_duration_minutes) {
            return `${sessionData.total_duration_minutes}m`;
        }
        return 'N/A';
    };

    const getCompletedExercises = (sessionData) => {
        if (!sessionData?.sections) return { completed: 0, total: 0 };

        let completed = 0;
        let total = 0;

        sessionData.sections.forEach(section => {
            if (section.exercises) {
                section.exercises.forEach(exercise => {
                    total++;
                    if (exercise.completed) completed++;
                });
            }
        });

        return { completed, total };
    };

    return (
        <div className="sessions-page" style={{ padding: '20px', color: 'white' }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #444',
                paddingBottom: '15px',
                marginBottom: '20px'
            }}>
                <h1 style={{ margin: 0, fontWeight: 300 }}>Practice Sessions</h1>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        className={`filter-btn ${filterCompleted === 'all' ? 'active' : ''}`}
                        onClick={() => setFilterCompleted('all')}
                        style={{
                            padding: '8px 16px',
                            background: filterCompleted === 'all' ? '#2196f3' : '#333',
                            border: 'none',
                            borderRadius: '4px',
                            color: 'white',
                            cursor: 'pointer'
                        }}
                    >
                        All
                    </button>
                    <button
                        className={`filter-btn ${filterCompleted === 'incomplete' ? 'active' : ''}`}
                        onClick={() => setFilterCompleted('incomplete')}
                        style={{
                            padding: '8px 16px',
                            background: filterCompleted === 'incomplete' ? '#2196f3' : '#333',
                            border: 'none',
                            borderRadius: '4px',
                            color: 'white',
                            cursor: 'pointer'
                        }}
                    >
                        Incomplete
                    </button>
                    <button
                        className={`filter-btn ${filterCompleted === 'completed' ? 'active' : ''}`}
                        onClick={() => setFilterCompleted('completed')}
                        style={{
                            padding: '8px 16px',
                            background: filterCompleted === 'completed' ? '#2196f3' : '#333',
                            border: 'none',
                            borderRadius: '4px',
                            color: 'white',
                            cursor: 'pointer'
                        }}
                    >
                        Completed
                    </button>
                </div>
            </div>

            {loading ? (
                <p>Loading sessions...</p>
            ) : filteredSessions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                    <p>No {filterCompleted !== 'all' ? filterCompleted : ''} sessions found</p>
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        background: '#1e1e1e',
                        borderRadius: '8px',
                        overflow: 'hidden'
                    }}>
                        <thead>
                            <tr style={{ background: '#2a2a2a', borderBottom: '2px solid #444' }}>
                                <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>Session Name</th>
                                <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>Date</th>
                                <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>Template</th>
                                <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}>Duration</th>
                                <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}>Sections</th>
                                <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}>Progress</th>
                                <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}>Status</th>
                                <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSessions.map((session, index) => {
                                const sessionData = session.attributes?.session_data;
                                const exerciseProgress = getCompletedExercises(sessionData);

                                return (
                                    <tr
                                        key={session.id}
                                        style={{
                                            borderBottom: '1px solid #333',
                                            opacity: session.attributes?.completed ? 0.7 : 1,
                                            background: index % 2 === 0 ? '#1e1e1e' : '#252525'
                                        }}
                                    >
                                        <td style={{
                                            padding: '12px',
                                            textDecoration: session.attributes?.completed ? 'line-through' : 'none'
                                        }}>
                                            <div style={{ fontWeight: 500 }}>{session.name}</div>
                                            {session.attributes?.description && (
                                                <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                                                    {session.attributes.description.substring(0, 50)}
                                                    {session.attributes.description.length > 50 ? '...' : ''}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <div>{formatDate(session.attributes?.created_at)}</div>
                                            <div style={{ fontSize: '11px', color: '#666' }}>
                                                {formatTime(session.attributes?.created_at)}
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            {sessionData?.template_name ? (
                                                <span style={{
                                                    background: '#2196f3',
                                                    padding: '2px 8px',
                                                    borderRadius: '3px',
                                                    fontSize: '11px'
                                                }}>
                                                    {sessionData.template_name}
                                                </span>
                                            ) : (
                                                <span style={{ color: '#666', fontSize: '12px' }}>No template</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            {getDuration(sessionData)}
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            {getSectionCount(sessionData)}
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            {exerciseProgress.total > 0 ? (
                                                <div>
                                                    <div style={{ fontSize: '13px' }}>
                                                        {exerciseProgress.completed}/{exerciseProgress.total}
                                                    </div>
                                                    <div style={{
                                                        width: '60px',
                                                        height: '4px',
                                                        background: '#333',
                                                        borderRadius: '2px',
                                                        margin: '4px auto 0',
                                                        overflow: 'hidden'
                                                    }}>
                                                        <div style={{
                                                            width: `${(exerciseProgress.completed / exerciseProgress.total) * 100}%`,
                                                            height: '100%',
                                                            background: '#4caf50',
                                                            transition: 'width 0.3s'
                                                        }} />
                                                    </div>
                                                </div>
                                            ) : (
                                                <span style={{ color: '#666' }}>-</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            <button
                                                onClick={() => handleToggleCompletion(session.id, session.attributes?.completed)}
                                                style={{
                                                    padding: '4px 12px',
                                                    background: session.attributes?.completed ? '#4caf50' : '#666',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    color: 'white',
                                                    fontSize: '12px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {session.attributes?.completed ? '✓ Done' : 'Mark Done'}
                                            </button>
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            <button
                                                onClick={() => setSelectedSession(session)}
                                                style={{
                                                    padding: '4px 12px',
                                                    background: '#2196f3',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    color: 'white',
                                                    fontSize: '12px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                View Details
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Session Details Modal */}
            {selectedSession && (
                <div
                    className="modal-overlay"
                    onClick={() => setSelectedSession(null)}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.8)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000
                    }}
                >
                    <div
                        className="modal-content"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: '#1e1e1e',
                            border: '1px solid #444',
                            borderRadius: '8px',
                            padding: '24px',
                            maxWidth: '700px',
                            width: '90%',
                            maxHeight: '80vh',
                            overflow: 'auto'
                        }}
                    >
                        <h2 style={{ margin: '0 0 16px 0' }}>{selectedSession.name}</h2>

                        {selectedSession.attributes?.description && (
                            <p style={{ color: '#aaa', marginBottom: '20px' }}>
                                {selectedSession.attributes.description}
                            </p>
                        )}

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                            gap: '12px',
                            marginBottom: '20px',
                            padding: '16px',
                            background: '#2a2a2a',
                            borderRadius: '6px'
                        }}>
                            <div>
                                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Date</div>
                                <div style={{ fontWeight: 500 }}>{formatDate(selectedSession.attributes?.created_at)}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Duration</div>
                                <div style={{ fontWeight: 500 }}>{getDuration(selectedSession.attributes?.session_data)}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Status</div>
                                <div style={{ fontWeight: 500 }}>
                                    {selectedSession.attributes?.completed ? '✓ Completed' : 'In Progress'}
                                </div>
                            </div>
                        </div>

                        {selectedSession.attributes?.session_data?.sections && selectedSession.attributes.session_data.sections.length > 0 ? (
                            <>
                                <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Sections & Exercises:</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {selectedSession.attributes.session_data.sections.map((section, sectionIndex) => (
                                        <div
                                            key={sectionIndex}
                                            style={{
                                                background: '#2a2a2a',
                                                padding: '12px',
                                                borderRadius: '6px',
                                                borderLeft: '4px solid #2196f3'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                <strong>{section.name}</strong>
                                                <span style={{ color: '#888', fontSize: '13px' }}>
                                                    {section.actual_duration_minutes || section.duration_minutes} min
                                                </span>
                                            </div>

                                            {section.exercises && section.exercises.length > 0 && (
                                                <div style={{ paddingLeft: '12px', borderLeft: '2px solid #444' }}>
                                                    {section.exercises.map((exercise, exerciseIndex) => (
                                                        <div
                                                            key={exerciseIndex}
                                                            style={{
                                                                padding: '8px',
                                                                marginBottom: '6px',
                                                                background: '#1e1e1e',
                                                                borderRadius: '4px',
                                                                opacity: exercise.completed ? 0.7 : 1
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'start', gap: '8px' }}>
                                                                <span style={{ fontSize: '16px' }}>
                                                                    {exercise.completed ? '✓' : '○'}
                                                                </span>
                                                                <div style={{ flex: 1 }}>
                                                                    <div style={{
                                                                        fontWeight: 500,
                                                                        textDecoration: exercise.completed ? 'line-through' : 'none'
                                                                    }}>
                                                                        {exercise.name}
                                                                    </div>
                                                                    {exercise.description && (
                                                                        <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                                                                            {exercise.description}
                                                                        </div>
                                                                    )}
                                                                    {exercise.notes && (
                                                                        <div style={{
                                                                            fontSize: '12px',
                                                                            color: '#4caf50',
                                                                            marginTop: '4px',
                                                                            fontStyle: 'italic'
                                                                        }}>
                                                                            Note: {exercise.notes}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <p style={{ color: '#666', textAlign: 'center', padding: '20px' }}>
                                No session data available
                            </p>
                        )}

                        {selectedSession.attributes?.session_data?.notes && (
                            <div style={{ marginTop: '20px', padding: '12px', background: '#2a2a2a', borderRadius: '6px' }}>
                                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Session Notes:</div>
                                <div>{selectedSession.attributes.session_data.notes}</div>
                            </div>
                        )}

                        <button
                            onClick={() => setSelectedSession(null)}
                            style={{
                                marginTop: '20px',
                                padding: '10px 20px',
                                background: '#2196f3',
                                border: 'none',
                                borderRadius: '4px',
                                color: 'white',
                                cursor: 'pointer',
                                width: '100%'
                            }}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Sessions;
