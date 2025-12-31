import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import SessionActivityItem from '../components/SessionActivityItem';
import { getAchievedTargetsForSession } from '../utils/targetUtils';
import ConfirmationModal from '../components/ConfirmationModal';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatForInput, localToISO } from '../utils/dateUtils';
import ActivityBuilder from '../components/ActivityBuilder';
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
 * Calculate total completed duration across all sections
 * Falls back to session_end - session_start if no activity durations exist
 */
function calculateTotalCompletedDuration(sessionData) {
    if (!sessionData || !sessionData.sections) return 0;

    // Try to calculate from activity durations first
    let totalSeconds = 0;
    for (const section of sessionData.sections) {
        totalSeconds += calculateSectionDuration(section);
    }

    // If we have activity durations, return them
    if (totalSeconds > 0) {
        return totalSeconds;
    }

    // Fallback: Calculate from session_start and session_end
    if (sessionData.session_start && sessionData.session_end) {
        const start = new Date(sessionData.session_start);
        const end = new Date(sessionData.session_end);
        const diffSeconds = Math.floor((end - start) / 1000);
        return diffSeconds > 0 ? diffSeconds : 0;
    }

    return 0;
}

/**
 * Format duration in seconds to HH:MM:SS or MM:SS format
 */
function formatDuration(seconds) {
    if (seconds == null || seconds === 0) return '--:--';

    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Format datetime to readable format
 */
function formatDateTime(isoString) {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Session Detail Page
 * Fill in practice session details based on template sections
 */
function SessionDetail() {
    const { rootId, sessionId } = useParams();
    const navigate = useNavigate();
    const timezone = useTimezone();

    const [session, setSession] = useState(null);
    const [sessionData, setSessionData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activities, setActivities] = useState([]);
    const [activityGroups, setActivityGroups] = useState([]);
    const [parentGoals, setParentGoals] = useState([]);
    const [showActivitySelector, setShowActivitySelector] = useState({}); // { sectionIndex: boolean }
    const [selectorState, setSelectorState] = useState({}); // { sectionIndex: groupId | null }
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showBuilder, setShowBuilder] = useState(false); // For creating new activity
    const [sectionForNewActivity, setSectionForNewActivity] = useState(null); // Track which section to add new activity to
    const [autoSaveStatus, setAutoSaveStatus] = useState(''); // 'saving', 'saved', 'error', or ''

    // Local state for editing session datetime fields
    const [localSessionStart, setLocalSessionStart] = useState('');
    const [localSessionEnd, setLocalSessionEnd] = useState('');

    // Auto-save sessionData to database whenever it changes
    useEffect(() => {
        if (!sessionData || loading) return;

        setAutoSaveStatus('saving');
        const timeoutId = setTimeout(async () => {
            try {
                const response = await fractalApi.updateSession(rootId, sessionId, {
                    session_data: JSON.stringify(sessionData)
                });

                // Update the session's updated_at timestamp from the response
                if (response.data && response.data.attributes) {
                    setSession(prevSession => ({
                        ...prevSession,
                        attributes: {
                            ...prevSession.attributes,
                            updated_at: response.data.attributes.updated_at
                        }
                    }));
                }

                setAutoSaveStatus('saved');
                // Clear the "saved" indicator after 2 seconds
                setTimeout(() => setAutoSaveStatus(''), 2000);
            } catch (err) {
                console.error('Error auto-saving session:', err);
                setAutoSaveStatus('error');
                // Clear error indicator after 3 seconds
                setTimeout(() => setAutoSaveStatus(''), 3000);
            }
        }, 1000); // Debounce by 1 second to avoid excessive API calls

        return () => clearTimeout(timeoutId);
    }, [sessionData, loading, rootId, sessionId]);

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
            const [actRes, groupRes] = await Promise.all([
                fractalApi.getActivities(rootId),
                fractalApi.getActivityGroups(rootId)
            ]);
            setActivities(actRes.data);
            setActivityGroups(groupRes.data);
        } catch (err) {
            console.error("Failed to fetch activities or groups", err);
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

            // Fetch parent goals for target achievement checking
            const parentIds = foundSession.attributes?.parent_ids || [];
            const goals = [];
            for (const goalId of parentIds) {
                try {
                    const goalRes = await fractalApi.getGoal(rootId, goalId);
                    goals.push(goalRes.data);
                } catch (err) {
                    console.error(`Failed to fetch goal ${goalId}`, err);
                }
            }
            setParentGoals(goals);

            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch session", err);
            setLoading(false);
        }
    };

    // Initialize session_start and session_end if they don't exist
    useEffect(() => {
        if (!sessionData || !session || loading) return;

        let needsUpdate = false;
        const updatedData = { ...sessionData };

        // Initialize session_start with created_at if not set
        if (!updatedData.session_start && session.attributes?.created_at) {
            updatedData.session_start = session.attributes.created_at;
            needsUpdate = true;
        }

        // Initialize session_end as session_start + total duration if not set
        if (!updatedData.session_end && updatedData.session_start) {
            const totalSeconds = calculateTotalCompletedDuration(sessionData);
            const startDate = new Date(updatedData.session_start);
            const endDate = new Date(startDate.getTime() + totalSeconds * 1000);
            updatedData.session_end = endDate.toISOString();
            needsUpdate = true;
        }

        if (needsUpdate) {
            setSessionData(updatedData);
        }
    }, [session, sessionData, loading]);

    // Sync local datetime fields with sessionData
    useEffect(() => {
        if (!sessionData) return;
        setLocalSessionStart(sessionData.session_start ? formatForInput(sessionData.session_start, timezone) : '');
        setLocalSessionEnd(sessionData.session_end ? formatForInput(sessionData.session_end, timezone) : '');
    }, [sessionData?.session_start, sessionData?.session_end, timezone]);

    // Create activity instances for any activities that don't have them yet
    const instancesCreatedRef = React.useRef(false);
    useEffect(() => {
        if (!sessionData || !sessionId || loading || instancesCreatedRef.current) return;

        const createMissingInstances = async () => {
            console.log('Creating missing activity instances...');
            let createdCount = 0;

            for (const section of sessionData.sections || []) {
                for (const exercise of section.exercises || []) {
                    // Only process activities (not rest periods, etc.)
                    if (exercise.type === 'activity' && exercise.instance_id && exercise.activity_id) {
                        try {
                            // Try to create the instance - backend will return existing if already created
                            await fractalApi.createActivityInstance(rootId, {
                                instance_id: exercise.instance_id,
                                practice_session_id: sessionId,
                                activity_definition_id: exercise.activity_id
                            });
                            createdCount++;
                            console.log(`Created/verified instance ${exercise.instance_id.substring(0, 8)}... for activity ${exercise.name}`);
                        } catch (err) {
                            // Silently fail - instance might already exist or will be created on timer start
                            console.debug(`Instance ${exercise.instance_id} already exists or error:`, err.message);
                        }
                    }
                }
            }
            console.log(`Finished creating instances. Total processed: ${createdCount}`);
            instancesCreatedRef.current = true;
        };

        createMissingInstances();
    }, [sessionData, sessionId, rootId, loading]);

    const handleSectionDurationChange = (sectionIndex, value) => {
        const updatedData = { ...sessionData };
        updatedData.sections[sectionIndex].actual_duration_minutes = parseInt(value) || 0;
        setSessionData(updatedData);
    };

    const handleSessionStartChange = (value) => {
        const updatedData = { ...sessionData };
        updatedData.session_start = value;

        // Recalculate session_end based on new start time + duration
        if (value) {
            const totalSeconds = calculateTotalCompletedDuration(sessionData);
            const startDate = new Date(value);
            const endDate = new Date(startDate.getTime() + totalSeconds * 1000);
            updatedData.session_end = endDate.toISOString();
        }

        setSessionData(updatedData);
    };

    const handleSessionEndChange = (value) => {
        const updatedData = { ...sessionData };
        updatedData.session_end = value;
        setSessionData(updatedData);
    };

    const handleExerciseChange = async (sectionIndex, exerciseIndex, field, value) => {
        // Handle timer actions specially
        if (field === 'timer_action') {
            const exercise = sessionData.sections[sectionIndex].exercises[exerciseIndex];
            const instanceId = exercise.instance_id;

            if (!instanceId) {
                console.error('No instance_id for timer action');
                alert('Error: Activity instance ID is missing. Please refresh the page.');
                return;
            }



            try {
                let response;
                if (value === 'start') {

                    response = await fractalApi.startActivityTimer(rootId, instanceId, {
                        practice_session_id: sessionId,
                        activity_definition_id: exercise.activity_id
                    });

                } else if (value === 'stop') {

                    response = await fractalApi.stopActivityTimer(rootId, instanceId, {
                        practice_session_id: sessionId,
                        activity_definition_id: exercise.activity_id
                    });

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
                        instance_id: response.data.id, // CRITICAL: Update with backend's actual instance ID
                        time_start: response.data.time_start,
                        time_stop: response.data.time_stop,
                        duration_seconds: response.data.duration_seconds
                    };
                    setSessionData(updatedData);

                }
            } catch (err) {
                console.error('Error with timer action:', err);
                console.error('Error details:', {
                    action: value,
                    instanceId,
                    activityId: exercise.activity_id,
                    sessionId,
                    errorResponse: err.response?.data
                });

                const errorMsg = err.response?.data?.error || err.message;

                // Special handling for "Activity instance not found" error
                if (errorMsg.includes('Activity instance not found')) {
                    alert(
                        `Timer Error: Activity instance not found\n\n` +
                        `This usually happens when:\n` +
                        `• The page was refreshed before starting the timer\n` +
                        `• The "Start" button was never clicked\n\n` +
                        `Solution: Click the "Start" button first, then "Stop".\n\n` +
                        `Alternatively, you can manually enter the start and stop times below the timer buttons.`
                    );
                } else {
                    alert(`Error updating timer: ${errorMsg}\n\nInstance ID: ${instanceId}\nAction: ${value}`);
                }
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

            // Persist to backend immediately (creates instance if missing)
            if (exercise.instance_id) {
                try {
                    await fractalApi.updateActivityInstance(rootId, exercise.instance_id, {
                        practice_session_id: sessionId,
                        activity_definition_id: exercise.activity_id,
                        time_start: exercise.time_start,
                        time_stop: exercise.time_stop,
                        duration_seconds: exercise.duration_seconds
                    });
                } catch (err) {
                    console.error('Error syncing manual time update:', err);
                    // Ideally show a toast or error indicator
                }
            }
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
        // Auto-save is already handling persistence, so just navigate away
        navigate(`/${rootId}/sessions`);
    };

    const handleDeleteSessionClick = () => {
        setShowDeleteConfirm(true);
    };

    const handleConfirmDeleteSession = async () => {

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
                                const response = await fractalApi.stopActivityTimer(rootId, exercise.instance_id, {
                                    practice_session_id: sessionId,
                                    activity_definition_id: exercise.activity_id
                                });
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

                // Set session_end to current timestamp when marking as complete
                updatedData.session_end = new Date().toISOString();
                hasUpdates = true;

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

    const handleOpenActivityBuilder = (sectionIndex) => {
        setSectionForNewActivity(sectionIndex);
        setShowBuilder(true);
    };

    const handleActivityCreated = (newActivity) => {
        if (!newActivity) return;

        // Add to local list of activities
        setActivities(prev => [...prev, newActivity]);

        // If we were trying to add it to a section, do that now
        if (sectionForNewActivity !== null) {
            // Need to wait for state update or pass the new activity object directly
            // Since handleAddActivity looks up by ID from 'activities' state which might not be updated yet
            // We'll modify handleAddActivity to accept an object OR wait for re-render
            // Actually, handleAddActivity looks up using: const activity = activities.find(a => a.id === activityId);
            // Since setState is async, 'activities' won't have the new one yet in this closure.

            // So we'll manually call the logic inside handleAddActivity but with the new object
            // Or better, update handleAddActivity to accept optional activity object

            handleAddActivity(sectionForNewActivity, newActivity.id, newActivity);
            setSectionForNewActivity(null);
        }
    };

    const handleAddActivity = async (sectionIndex, activityId, activityObject = null) => {
        const activityDef = activityObject || activities.find(a => a.id === activityId);
        if (!activityDef) return;

        const instanceId = crypto.randomUUID();
        const newActivity = {
            type: 'activity',
            name: activityDef.name,
            activity_id: activityDef.id,
            instance_id: instanceId,
            description: activityDef.description,
            has_sets: activityDef.has_sets,
            has_metrics: activityDef.has_metrics,
            has_splits: activityDef.has_splits || false,
            completed: false,
            sets: activityDef.has_sets ? [] : undefined,
            metrics: (!activityDef.has_sets && activityDef.has_metrics) ?
                activityDef.metric_definitions.map(m => ({ metric_id: m.id, value: '' })) : undefined
        };

        // Create the activity instance in the database immediately
        try {
            await fractalApi.createActivityInstance(rootId, {
                instance_id: instanceId,
                practice_session_id: sessionId,
                activity_definition_id: activityDef.id
            });
        } catch (err) {
            console.error('Error creating activity instance:', err);
            // Continue anyway - the instance will be created when timer starts if needed
        }

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

    const handleReorderActivity = (sectionIndex, exerciseIndex, direction) => {
        const updatedData = { ...sessionData };
        const exercises = updatedData.sections[sectionIndex].exercises;

        // Calculate new index based on direction
        const newIndex = direction === 'up' ? exerciseIndex - 1 : exerciseIndex + 1;

        // Validate bounds
        if (newIndex < 0 || newIndex >= exercises.length) return;

        // Swap the activities
        const temp = exercises[exerciseIndex];
        exercises[exerciseIndex] = exercises[newIndex];
        exercises[newIndex] = temp;

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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '20px' }}>
                    {/* Left side: Metadata grid - 4 columns x 2 rows */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'auto auto auto auto',
                        gap: '12px 24px',
                        fontSize: '14px',
                        color: '#aaa'
                    }}>
                        {/* Row 1 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ color: '#666', fontSize: '14px' }}>Template:</span>
                            <span style={{ color: '#ccc' }}>{sessionData.template_name}</span>
                        </div>

                        {/* Session Start DateTime - Editable */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ color: '#666', fontSize: '14px' }}>Session Start:</label>
                            <input
                                type="text"
                                placeholder="YYYY-MM-DD HH:MM:SS"
                                value={localSessionStart}
                                onChange={(e) => setLocalSessionStart(e.target.value)}
                                onBlur={(e) => {
                                    if (e.target.value) {
                                        try {
                                            const isoValue = localToISO(e.target.value, timezone);
                                            handleSessionStartChange(isoValue);
                                        } catch (err) {
                                            console.error('Invalid date format:', err);
                                            // Reset to previous value
                                            setLocalSessionStart(sessionData.session_start ? formatForInput(sessionData.session_start, timezone) : '');
                                        }
                                    } else {
                                        handleSessionStartChange(null);
                                    }
                                }}
                                style={{
                                    padding: '4px 8px',
                                    background: '#333',
                                    border: '1px solid #555',
                                    borderRadius: '4px',
                                    color: '#ccc',
                                    fontSize: '13px',
                                    width: '180px',
                                    fontFamily: 'monospace'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ color: '#666', fontSize: '14px' }}>Total Duration (Planned):</span>
                            <span style={{ color: '#ccc' }}>{sessionData.total_duration_minutes} min</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ color: '#666', fontSize: '14px' }}>Date Created:</span>
                            <span style={{ color: '#ccc' }}>{formatDateTime(session.attributes?.created_at)}</span>
                        </div>

                        {/* Row 2 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ color: '#666', fontSize: '14px' }}>Sections:</span>
                            <span style={{ color: '#ccc' }}>{sessionData.sections?.length || 0}</span>
                        </div>

                        {/* Session End DateTime - Editable */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ color: '#666', fontSize: '14px' }}>Session End:</label>
                            <input
                                type="text"
                                placeholder="YYYY-MM-DD HH:MM:SS"
                                value={localSessionEnd}
                                onChange={(e) => setLocalSessionEnd(e.target.value)}
                                onBlur={(e) => {
                                    if (e.target.value) {
                                        try {
                                            const isoValue = localToISO(e.target.value, timezone);
                                            handleSessionEndChange(isoValue);
                                        } catch (err) {
                                            console.error('Invalid date format:', err);
                                            // Reset to previous value
                                            setLocalSessionEnd(sessionData.session_end ? formatForInput(sessionData.session_end, timezone) : '');
                                        }
                                    } else {
                                        handleSessionEndChange(null);
                                    }
                                }}
                                style={{
                                    padding: '4px 8px',
                                    background: '#333',
                                    border: '1px solid #555',
                                    borderRadius: '4px',
                                    color: '#ccc',
                                    fontSize: '13px',
                                    width: '180px',
                                    fontFamily: 'monospace'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ color: '#666', fontSize: '14px' }}>Total Duration (Completed):</span>
                            <span style={{
                                color: '#4caf50',
                                fontWeight: 'bold',
                                fontFamily: 'monospace'
                            }}>
                                {formatDuration(calculateTotalCompletedDuration(sessionData))}
                            </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ color: '#666', fontSize: '14px' }}>Last Modified:</span>
                            <span style={{ color: '#ccc' }}>{formatDateTime(session.attributes?.updated_at)}</span>
                        </div>
                    </div>

                    {/* Auto-save status indicator */}
                    {autoSaveStatus && (
                        <span style={{
                            fontSize: '13px',
                            color: autoSaveStatus === 'saved' ? '#4caf50' :
                                autoSaveStatus === 'error' ? '#f44336' : '#888',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            whiteSpace: 'nowrap'
                        }}>
                            {autoSaveStatus === 'saving' && '💾 Saving...'}
                            {autoSaveStatus === 'saved' && '✓ All changes saved'}
                            {autoSaveStatus === 'error' && '⚠ Error saving'}
                        </span>
                    )}
                </div>

                {/* Achieved Targets Indicator */}
                {(() => {
                    const achievedTargets = getAchievedTargetsForSession(session, parentGoals);
                    if (achievedTargets.length === 0) return null;

                    return (
                        <div style={{
                            marginTop: '16px',
                            padding: '12px',
                            background: '#1a2e1a',
                            borderRadius: '6px',
                            borderLeft: '3px solid #4caf50'
                        }}>
                            <div style={{ fontSize: '12px', color: '#81c784', marginBottom: '8px', fontWeight: 600 }}>
                                🎯 Targets Achieved ({achievedTargets.length}):
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {achievedTargets.map((achieved, idx) => (
                                    <div
                                        key={idx}
                                        style={{
                                            padding: '6px 12px',
                                            background: '#2e7d32',
                                            borderRadius: '4px',
                                            fontSize: '12px',
                                            color: 'white',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        <span>✓</span>
                                        <span>{achieved.target.name || 'Target'}</span>
                                        <span style={{ fontSize: '10px', opacity: 0.8 }}>({achieved.goalName})</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })()}
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
                                        onReorder={(direction) => handleReorderActivity(sectionIndex, exerciseIndex, direction)}
                                        canMoveUp={exerciseIndex > 0}
                                        canMoveDown={exerciseIndex < section.exercises.length - 1}
                                        showReorderButtons={section.exercises.length > 1}
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

                                    {selectorState[sectionIndex] ? (
                                        // Specific Group View
                                        <>
                                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                                                <button
                                                    onClick={() => setSelectorState(prev => ({ ...prev, [sectionIndex]: null }))}
                                                    style={{ marginRight: '10px', background: 'transparent', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: '13px' }}
                                                >
                                                    ← Back to Groups
                                                </button>
                                                <div style={{ fontSize: '12px', color: '#888', fontWeight: 'bold' }}>
                                                    {activityGroups.find(g => g.id === selectorState[sectionIndex])?.name || 'Group'}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                {/* Activities in Group */}
                                                {activities.filter(a => a.group_id === selectorState[sectionIndex]).map(act => (
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
                                                {activities.filter(a => a.group_id === selectorState[sectionIndex]).length === 0 && (
                                                    <div style={{ color: '#666', fontSize: '12px', width: '100%', fontStyle: 'italic' }}>No activities in this group</div>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        // Top Level View
                                        <>
                                            <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>Select an activity group or ungrouped activity:</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                {/* Groups */}
                                                {activityGroups.map(group => (
                                                    <button
                                                        key={group.id}
                                                        onClick={() => setSelectorState(prev => ({ ...prev, [sectionIndex]: group.id }))}
                                                        style={{
                                                            padding: '6px 12px',
                                                            background: '#1a1a1a',
                                                            border: '1px solid #666',
                                                            borderRadius: '4px',
                                                            color: '#fff',
                                                            cursor: 'pointer',
                                                            fontSize: '13px',
                                                            fontWeight: 'bold',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '6px'
                                                        }}
                                                    >
                                                        {group.name} ›
                                                    </button>
                                                ))}

                                                {/* Ungrouped */}
                                                {activities.filter(a => !a.group_id).map(act => (
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

                                                <div style={{ width: '100%', height: '1px', background: '#333', margin: '4px 0' }}></div>

                                                <button
                                                    onClick={() => handleOpenActivityBuilder(sectionIndex)}
                                                    style={{
                                                        padding: '6px 12px',
                                                        background: '#1a1a1a',
                                                        border: '1px dashed #666',
                                                        borderRadius: '4px',
                                                        color: '#aaa',
                                                        cursor: 'pointer',
                                                        fontSize: '13px',
                                                        fontWeight: 500
                                                    }}
                                                >
                                                    + Create New Activity
                                                </button>
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
                                        </>
                                    )}
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
                        type="button"
                        onClick={handleDeleteSessionClick}
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
                        style={{
                            padding: '12px 32px',
                            background: '#2196f3',
                            border: 'none',
                            borderRadius: '6px',
                            color: 'white',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                        }}
                    >
                        Done
                    </button>
                </div>
            </div>
            {/* Confirmation Modal */}
            <ConfirmationModal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={handleConfirmDeleteSession}
                title="Delete Session"
                message="Are you sure you want to delete this session? This action cannot be undone."
                confirmText="Delete"
            />

            {/* Activity Builder Modal */}
            <ActivityBuilder
                isOpen={showBuilder}
                onClose={() => setShowBuilder(false)}
                rootId={rootId}
                onSave={handleActivityCreated}
            />
        </div>
    );
}

export default SessionDetail;
