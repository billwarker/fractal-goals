import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import '../App.css';

/**
 * Session Detail Page
 * Fill in practice session details based on template sections
 */
function SessionDetail() {
    const { rootId, sessionId } = useParams();
    const navigate = useNavigate();

    const [session, setSession] = useState(null);
    const [sessionData, setSessionData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!rootId || !sessionId) {
            navigate('/');
            return;
        }
        fetchSession();
    }, [rootId, sessionId, navigate]);

    const fetchSession = async () => {
        try {
            const res = await fractalApi.getSessions(rootId);
            const foundSession = res.data.find(s => s.id === sessionId);

            if (!foundSession) {
                alert('Session not found');
                navigate(`/${rootId}/sessions`);
                return;
            }

            setSession(foundSession);

            // Parse session_data
            const parsedData = foundSession.attributes?.session_data;
            if (parsedData) {
                setSessionData(parsedData);
            }

            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch session", err);
            setLoading(false);
        }
    };

    const handleSectionDurationChange = (sectionIndex, value) => {
        const updatedData = { ...sessionData };
        updatedData.sections[sectionIndex].actual_duration_minutes = parseInt(value) || 0;
        setSessionData(updatedData);
    };

    const handleExerciseChange = (sectionIndex, exerciseIndex, field, value) => {
        const updatedData = { ...sessionData };
        updatedData.sections[sectionIndex].exercises[exerciseIndex][field] = value;
        setSessionData(updatedData);
    };

    const handleToggleExerciseComplete = (sectionIndex, exerciseIndex) => {
        const updatedData = { ...sessionData };
        const exercise = updatedData.sections[sectionIndex].exercises[exerciseIndex];
        exercise.completed = !exercise.completed;
        setSessionData(updatedData);
    };

    const handleSaveSession = async () => {
        setSaving(true);
        try {
            await fractalApi.updateSession(rootId, sessionId, {
                session_data: JSON.stringify(sessionData)
            });

            alert('Session saved successfully!');
            navigate(`/${rootId}/sessions`);
        } catch (err) {
            console.error('Error saving session:', err);
            alert('Error saving session: ' + err.message);
            setSaving(false);
        }
    };

    const handleDeleteSession = async () => {
        if (!window.confirm('Are you sure you want to delete this session? This action cannot be undone.')) {
            return;
        }

        try {
            await fractalApi.deleteSession(rootId, sessionId);
            navigate(`/${rootId}/sessions`);
        } catch (err) {
            console.error('Error deleting session:', err);
            alert('Error deleting session: ' + err.message);
        }
    };

    if (loading) {
        return (
            <div className="page-container">
                <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                    <p>Loading session...</p>
                </div>
            </div>
        );
    }

    if (!session || !sessionData) {
        return (
            <div className="page-container">
                <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                    <p>Session not found</p>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container" style={{ color: 'white' }}>
            {/* Header */}
            <div style={{
                position: 'sticky',
                top: 0,
                zIndex: 100,
                background: '#121212',
                paddingBottom: '20px',
                borderBottom: '1px solid #444',
                marginBottom: '20px'
            }}>
                <h1 style={{ fontWeight: 300, marginBottom: '10px' }}>
                    {session.name}
                </h1>
                <div style={{ display: 'flex', gap: '20px', fontSize: '14px', color: '#aaa' }}>
                    <span>Template: {sessionData.template_name}</span>
                    <span>Total Duration: {sessionData.total_duration_minutes} min</span>
                    <span>Sections: {sessionData.sections?.length || 0}</span>
                </div>
            </div>

            {/* Sections */}
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                {sessionData.sections?.map((section, sectionIndex) => (
                    <div
                        key={sectionIndex}
                        style={{
                            background: '#1e1e1e',
                            border: '1px solid #333',
                            borderLeft: '4px solid #2196f3',
                            borderRadius: '8px',
                            padding: '20px',
                            marginBottom: '20px'
                        }}
                    >
                        {/* Section Header */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '16px',
                            paddingBottom: '12px',
                            borderBottom: '1px solid #333'
                        }}>
                            <h2 style={{ fontSize: '20px', margin: 0 }}>
                                {section.name}
                            </h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <label style={{ color: '#aaa', fontSize: '14px' }}>
                                    Actual Duration (min):
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={section.actual_duration_minutes || section.duration_minutes || 0}
                                    onChange={(e) => handleSectionDurationChange(sectionIndex, e.target.value)}
                                    style={{
                                        width: '80px',
                                        padding: '6px 10px',
                                        background: '#2a2a2a',
                                        border: '1px solid #444',
                                        borderRadius: '4px',
                                        color: 'white',
                                        fontSize: '14px'
                                    }}
                                />
                                <span style={{ color: '#666', fontSize: '14px' }}>
                                    (planned: {section.duration_minutes} min)
                                </span>
                            </div>
                        </div>

                        {/* Exercises */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {section.exercises?.map((exercise, exerciseIndex) => (
                                <div
                                    key={exerciseIndex}
                                    style={{
                                        background: '#2a2a2a',
                                        border: '1px solid #444',
                                        borderRadius: '6px',
                                        padding: '16px'
                                    }}
                                >
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                                        {/* Checkbox */}
                                        <div
                                            onClick={() => handleToggleExerciseComplete(sectionIndex, exerciseIndex)}
                                            style={{
                                                width: '24px',
                                                height: '24px',
                                                borderRadius: '4px',
                                                border: `2px solid ${exercise.completed ? '#4caf50' : '#666'}`,
                                                background: exercise.completed ? '#4caf50' : 'transparent',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                flexShrink: 0,
                                                marginTop: '2px'
                                            }}
                                        >
                                            {exercise.completed && (
                                                <span style={{ color: 'white', fontWeight: 'bold', fontSize: '16px' }}>✓</span>
                                            )}
                                        </div>

                                        {/* Exercise Content */}
                                        <div style={{ flex: 1 }}>
                                            <div style={{
                                                fontWeight: 'bold',
                                                fontSize: '16px',
                                                marginBottom: '8px',
                                                textDecoration: exercise.completed ? 'line-through' : 'none',
                                                opacity: exercise.completed ? 0.6 : 1
                                            }}>
                                                {exercise.name}
                                            </div>

                                            {exercise.description && (
                                                <div style={{
                                                    fontSize: '13px',
                                                    color: '#aaa',
                                                    marginBottom: '12px'
                                                }}>
                                                    {exercise.description}
                                                </div>
                                            )}

                                            {/* Notes Field */}
                                            <div>
                                                <label style={{
                                                    display: 'block',
                                                    fontSize: '12px',
                                                    color: '#888',
                                                    marginBottom: '4px'
                                                }}>
                                                    Notes:
                                                </label>
                                                <textarea
                                                    value={exercise.notes || ''}
                                                    onChange={(e) => handleExerciseChange(sectionIndex, exerciseIndex, 'notes', e.target.value)}
                                                    placeholder="Add notes about this exercise..."
                                                    style={{
                                                        width: '100%',
                                                        minHeight: '60px',
                                                        padding: '8px',
                                                        background: '#1e1e1e',
                                                        border: '1px solid #444',
                                                        borderRadius: '4px',
                                                        color: 'white',
                                                        fontSize: '13px',
                                                        fontFamily: 'inherit',
                                                        resize: 'vertical'
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                {/* Save Button */}
                <div style={{
                    position: 'sticky',
                    bottom: 0,
                    background: '#121212',
                    padding: '20px 0',
                    borderTop: '1px solid #444',
                    display: 'flex',
                    gap: '12px',
                    justifyContent: 'center'
                }}>
                    <button
                        onClick={handleDeleteSession}
                        style={{
                            padding: '12px 32px',
                            background: '#d32f2f',
                            border: 'none',
                            borderRadius: '6px',
                            color: 'white',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                        }}
                    >
                        Delete Session
                    </button>
                    <button
                        onClick={() => navigate(`/${rootId}/sessions`)}
                        style={{
                            padding: '12px 32px',
                            background: '#666',
                            border: 'none',
                            borderRadius: '6px',
                            color: 'white',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSaveSession}
                        disabled={saving}
                        style={{
                            padding: '12px 32px',
                            background: saving ? '#666' : '#4caf50',
                            border: 'none',
                            borderRadius: '6px',
                            color: 'white',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            cursor: saving ? 'not-allowed' : 'pointer',
                            opacity: saving ? 0.5 : 1
                        }}
                    >
                        {saving ? 'Saving...' : '✓ Save Session'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default SessionDetail;
