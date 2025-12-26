import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import SessionActivityItem from '../components/SessionActivityItem';
import '../App.css';

/**
 * Calculate total duration in seconds for a section based on activity instances
 */
function calculateSectionDuration(section) {
    if (!section || !section.exercises) return 0;

    let totalSeconds = 0;
    for (const exercise of section.exercises) {
        if (exercise.instance_id && exercise.duration_seconds != null) {
            totalSeconds += exercise.duration_seconds;
        }
    }
    return totalSeconds;
}

/**
 * Format duration in seconds to MM:SS format
 */
function formatDuration(seconds) {
    if (seconds == null || seconds === 0) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

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
    const [activities, setActivities] = useState([]);
    const [showActivitySelector, setShowActivitySelector] = useState({}); // { sectionIndex: boolean }

    useEffect(() => {
        if (!rootId || !sessionId) {
            navigate('/');
            return;
        }
        fetchSession();
        fetchActivities();
    }, [rootId, sessionId, navigate]);

    const fetchActivities = async () => {
        try {
            const res = await fractalApi.getActivities(rootId);
            setActivities(res.data);
        } catch (err) {
            console.error("Failed to fetch activities", err);
        }
    };

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

    const handleExerciseChange = async (sectionIndex, exerciseIndex, field, value) => {
        // Handle timer actions specially
        if (field === 'timer_action') {
            const exercise = sessionData.sections[sectionIndex].exercises[exerciseIndex];
            const instanceId = exercise.instance_id;

            if (!instanceId) {
                console.error('No instance_id for timer action');
                return;
            }

            try {
                let response;
                if (value === 'start') {
                    response = await fractalApi.startActivityTimer(rootId, instanceId);
                } else if (value === 'stop') {
                    response = await fractalApi.stopActivityTimer(rootId, instanceId);
                } else if (value === 'reset') {
                    // Reset: clear time_start and time_stop locally
                    const updatedData = { ...sessionData };
                    updatedData.sections[sectionIndex].exercises[exerciseIndex] = {
                        ...exercise,
                        time_start: null,
                        time_stop: null,
                        duration_seconds: null
                    };
                    setSessionData(updatedData);
                    return;
                }

                // Update the exercise with the new time data
                if (response && response.data) {
                    const updatedData = { ...sessionData };
                    updatedData.sections[sectionIndex].exercises[exerciseIndex] = {
                        ...exercise,
                        time_start: response.data.time_start,
                        time_stop: response.data.time_stop,
                        duration_seconds: response.data.duration_seconds
                    };
                    setSessionData(updatedData);
                }
            } catch (err) {
                console.error('Error with timer action:', err);
                alert('Error updating timer: ' + err.message);
            }
            return;
        }

        // Handle manual datetime field updates (time_start, time_stop)
        if (field === 'time_start' || field === 'time_stop') {
            const updatedData = { ...sessionData };
            const exercise = updatedData.sections[sectionIndex].exercises[exerciseIndex];

            // Update the field
            exercise[field] = value;

            // Recalculate duration if both times are set
            if (exercise.time_start && exercise.time_stop) {
                const start = new Date(exercise.time_start);
                const stop = new Date(exercise.time_stop);
                exercise.duration_seconds = Math.floor((stop - start) / 1000);
            } else {
                exercise.duration_seconds = null;
            }

            setSessionData(updatedData);
            return;
        }

        // Normal field update
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

    const handleToggleSessionComplete = async () => {
        if (!session) return;

        try {
            const newCompleted = !session.attributes.completed;

            // If marking as complete, stop all running timers first
            if (newCompleted && sessionData) {
                const updatedData = { ...sessionData };
                let hasUpdates = false;

                for (let sectionIndex = 0; sectionIndex < updatedData.sections.length; sectionIndex++) {
                    const section = updatedData.sections[sectionIndex];
                    if (!section.exercises) continue;

                    for (let exerciseIndex = 0; exerciseIndex < section.exercises.length; exerciseIndex++) {
                        const exercise = section.exercises[exerciseIndex];

                        // Check if this is an activity with a running timer
                        if (exercise.instance_id && exercise.time_start && !exercise.time_stop) {
                            try {
                                const response = await fractalApi.stopActivityTimer(rootId, exercise.instance_id);
                                if (response && response.data) {
                                    updatedData.sections[sectionIndex].exercises[exerciseIndex] = {
                                        ...exercise,
                                        time_start: response.data.time_start,
                                        time_stop: response.data.time_stop,
                                        duration_seconds: response.data.duration_seconds
                                    };
                                    hasUpdates = true;
                                }
                            } catch (err) {
                                console.error(`Error stopping timer for activity ${exercise.instance_id}:`, err);
                            }
                        }
                    }
                }

                if (hasUpdates) {
                    setSessionData(updatedData);
                }
            }

            const res = await fractalApi.toggleGoalCompletion(rootId, sessionId, newCompleted);
            setSession(res.data.goal); // Endpoint returns { status: 'success', goal: ... }
        } catch (err) {
            console.error('Error toggling completion:', err);
            alert('Error updating completion status');
        }
    };

    const handleAddActivity = (sectionIndex, activityId) => {
        const activityDef = activities.find(a => a.id === activityId);
        if (!activityDef) return;

        const newActivity = {
            type: 'activity',
            name: activityDef.name,
            activity_id: activityDef.id,
            instance_id: crypto.randomUUID(),
            description: activityDef.description,
            has_sets: activityDef.has_sets,
            has_metrics: activityDef.has_metrics,
            completed: false,
            sets: activityDef.has_sets ? [] : undefined,
            metrics: (!activityDef.has_sets && activityDef.has_metrics) ?
                activityDef.metric_definitions.map(m => ({ metric_id: m.id, value: '' })) : undefined
        };

        const updatedData = { ...sessionData };
        if (!updatedData.sections[sectionIndex].exercises) {
            updatedData.sections[sectionIndex].exercises = [];
        }
        updatedData.sections[sectionIndex].exercises.push(newActivity);
        setSessionData(updatedData);
        setShowActivitySelector(prev => ({ ...prev, [sectionIndex]: false }));
    };

    const handleDeleteExercise = (sectionIndex, exerciseIndex) => {
        // Same as removing from array
        const updatedData = { ...sessionData };
        updatedData.sections[sectionIndex].exercises.splice(exerciseIndex, 1);
        setSessionData(updatedData);
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
                                <span style={{ color: '#aaa', fontSize: '14px' }}>
                                    Duration:
                                </span>
                                <span style={{
                                    color: '#4caf50',
                                    fontSize: '16px',
                                    fontWeight: 'bold',
                                    fontFamily: 'monospace'
                                }}>
                                    {formatDuration(calculateSectionDuration(section))}
                                </span>
                                <span style={{ color: '#666', fontSize: '14px' }}>
                                    (planned: {section.duration_minutes} min)
                                </span>
                            </div>
                        </div>

                        {/* Exercises */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {section.exercises?.map((exercise, exerciseIndex) => (
                                exercise.type === 'activity' ? (
                                    <SessionActivityItem
                                        key={exercise.instance_id || exerciseIndex}
                                        exercise={exercise}
                                        activityDefinition={activities.find(a => a.id === exercise.activity_id)}
                                        onUpdate={(field, value) => handleExerciseChange(sectionIndex, exerciseIndex, field, value)}
                                        onToggleComplete={() => handleToggleExerciseComplete(sectionIndex, exerciseIndex)}
                                        onDelete={() => handleDeleteExercise(sectionIndex, exerciseIndex)}
                                    />
                                ) : (
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
                                )
                            ))}
                        </div>

                        {/* Add Activity Button */}
                        <div style={{ marginTop: '15px' }}>
                            {showActivitySelector[sectionIndex] ? (
                                <div style={{ background: '#222', padding: '10px', borderRadius: '4px', border: '1px solid #444' }}>
                                    <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>Select an activity to add:</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {activities.map(act => (
                                            <button
                                                key={act.id}
                                                onClick={() => handleAddActivity(sectionIndex, act.id)}
                                                style={{
                                                    padding: '6px 12px',
                                                    background: '#333',
                                                    border: '1px solid #555',
                                                    borderRadius: '4px',
                                                    color: 'white',
                                                    cursor: 'pointer',
                                                    fontSize: '13px'
                                                }}
                                            >
                                                {act.name}
                                            </button>
                                        ))}
                                        <button
                                            onClick={() => setShowActivitySelector(prev => ({ ...prev, [sectionIndex]: false }))}
                                            style={{
                                                padding: '6px 12px',
                                                background: 'transparent',
                                                border: 'none',
                                                color: '#888',
                                                cursor: 'pointer',
                                                fontSize: '13px'
                                            }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setShowActivitySelector(prev => ({ ...prev, [sectionIndex]: true }))}
                                    style={{
                                        background: 'transparent',
                                        border: '1px dashed #444',
                                        color: '#888',
                                        padding: '8px 16px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '13px',
                                        width: '100%',
                                        textAlign: 'center'
                                    }}
                                >
                                    + Add Activity
                                </button>
                            )}
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
                        onClick={handleToggleSessionComplete}
                        style={{
                            padding: '12px 32px',
                            background: session.attributes?.completed ? '#4caf50' : 'transparent',
                            border: session.attributes?.completed ? 'none' : '2px solid #666',
                            borderRadius: '6px',
                            color: session.attributes?.completed ? 'white' : '#ccc',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                        }}
                    >
                        {session.attributes?.completed ? '✓ Completed' : 'Mark Complete'}
                    </button>
                    <button
                        onClick={handleSaveSession}
                        disabled={saving}
                        style={{
                            padding: '12px 32px',
                            background: saving ? '#666' : '#2196f3',
                            border: 'none',
                            borderRadius: '6px',
                            color: 'white',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            cursor: saving ? 'not-allowed' : 'pointer',
                            opacity: saving ? 0.5 : 1
                        }}
                    >
                        {saving ? 'Saving...' : 'Save Session'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default SessionDetail;
