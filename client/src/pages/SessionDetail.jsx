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
function calculateSectionDuration(section, activityInstances) {
    if (!section || !section.activity_ids || !activityInstances) return 0;

    let totalSeconds = 0;
    for (const instanceId of section.activity_ids) {
        const instance = activityInstances.find(inst => inst.id === instanceId);
        if (instance && instance.duration_seconds != null) {
            totalSeconds += instance.duration_seconds;
        }
    }
    return totalSeconds;
}

/**
 * Calculate total completed duration across all sections
 * Falls back to session_end - session_start if no activity durations exist
 */
function calculateTotalCompletedDuration(sessionData, activityInstances) {
    if (!sessionData || !sessionData.sections) return 0;

    // Try to calculate from activity durations first
    let totalSeconds = 0;
    for (const section of sessionData.sections) {
        totalSeconds += calculateSectionDuration(section, activityInstances);
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
    const [sessionData, setSessionData] = useState(null); // UI metadata only (section names, notes, ordering)
    const [activityInstances, setActivityInstances] = useState([]); // Activity data from database
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

    // Auto-save sessionData (UI metadata only) to database whenever it changes
    useEffect(() => {
        if (!sessionData || loading) return;

        setAutoSaveStatus('saving');
        const timeoutId = setTimeout(async () => {
            try {
                // Only save UI metadata - activity data is managed separately
                const metadataOnly = {
                    sections: sessionData.sections?.map(section => ({
                        name: section.name,
                        notes: section.notes,
                        estimated_duration_minutes: section.estimated_duration_minutes,
                        activity_ids: section.activity_ids || [] // Just IDs for ordering
                    })),
                    template_name: sessionData.template_name,
                    total_duration_minutes: sessionData.total_duration_minutes,
                    session_start: sessionData.session_start,
                    session_end: sessionData.session_end
                };

                // Send session_start and session_end as top-level fields to save to DB columns
                // Only include timing fields if they have values to avoid backend errors
                const updatePayload = {
                    session_data: JSON.stringify(metadataOnly)
                };

                // Normalize datetime formats to standard ISO (backend expects consistent format)
                if (sessionData.session_start) {
                    const startDate = new Date(sessionData.session_start);
                    updatePayload.session_start = startDate.toISOString();
                }
                if (sessionData.session_end) {
                    const endDate = new Date(sessionData.session_end);
                    updatePayload.session_end = endDate.toISOString();
                }
                if (sessionData.total_duration_seconds != null) {
                    updatePayload.total_duration_seconds = sessionData.total_duration_seconds;
                }

                const response = await fractalApi.updateSession(rootId, sessionId, updatePayload);

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
        fetchActivityInstances();
    }, [rootId, sessionId, navigate]);

    const fetchActivityInstances = async () => {
        try {
            const response = await fractalApi.getSessionActivities(rootId, sessionId);
            setActivityInstances(response.data);
        } catch (err) {
            console.error("Failed to fetch activity instances", err);
        }
    };

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
                // Backwards compatibility: Populate activity_ids from exercises if missing
                // This ensures sessions created before the migration still display their activities
                if (parsedData.sections) {
                    parsedData.sections.forEach(section => {
                        if ((!section.activity_ids || section.activity_ids.length === 0) && section.exercises) {
                            section.activity_ids = section.exercises
                                .filter(e => e.type === 'activity' && e.instance_id)
                                .map(e => e.instance_id);
                        }
                    });
                }
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

    // Create activity instances for any activities that don't have them yet (e.g. from templates or old sessions)
    const instancesCreatedRef = React.useRef(false);
    useEffect(() => {
        if (!sessionData || !sessionId || loading || instancesCreatedRef.current) return;

        const createMissingInstances = async () => {
            console.log('Verifying/Creating activity instances from session data...');
            let createdCount = 0;

            for (const section of sessionData.sections || []) {
                for (const exercise of section.exercises || []) {
                    // Only process activities (not rest periods, etc.)
                    if (exercise.type === 'activity' && exercise.instance_id && exercise.activity_id) {
                        // Check if instance already exists in our state
                        const instanceExists = activityInstances.some(inst => inst.id === exercise.instance_id);

                        if (!instanceExists) {
                            try {
                                // Try to create the instance
                                await fractalApi.addActivityToSession(rootId, sessionId, {
                                    instance_id: exercise.instance_id,
                                    activity_definition_id: exercise.activity_id
                                });
                                createdCount++;
                                console.log(`Created instance ${exercise.instance_id.substring(0, 8)}... for activity ${exercise.name}`);
                            } catch (err) {
                                // Silently fail - instance might already exist in DB
                                console.debug(`Instance ${exercise.instance_id} already exists or error:`, err.message);
                            }
                        }
                    }
                }
            }
            console.log(`Finished creating instances. Total processed: ${createdCount}`);
            instancesCreatedRef.current = true;
        };

        createMissingInstances();
    }, [sessionData, sessionId, rootId, loading, activityInstances]);

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
            const totalSeconds = calculateTotalCompletedDuration(sessionData, activityInstances);
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
        // Get the instance ID from the section's activity_ids array
        const section = sessionData.sections[sectionIndex];
        const instanceId = section.activity_ids?.[exerciseIndex];

        if (!instanceId) {
            console.error('No instance ID found');
            return;
        }

        // Handle timer actions specially
        if (field === 'timer_action') {
            try {
                let response;
                if (value === 'start') {
                    const instance = activityInstances.find(inst => inst.id === instanceId);
                    response = await fractalApi.startActivityTimer(rootId, instanceId, {
                        practice_session_id: sessionId,
                        activity_definition_id: instance.activity_definition_id
                    });
                } else if (value === 'stop') {
                    const instance = activityInstances.find(inst => inst.id === instanceId);
                    response = await fractalApi.stopActivityTimer(rootId, instanceId, {
                        practice_session_id: sessionId,
                        activity_definition_id: instance.activity_definition_id
                    });
                } else if (value === 'reset') {
                    // Reset: update instance in database to clear times
                    const instance = activityInstances.find(inst => inst.id === instanceId);
                    response = await fractalApi.updateActivityInstance(rootId, instanceId, {
                        practice_session_id: sessionId,
                        activity_definition_id: instance.activity_definition_id,
                        time_start: null,
                        time_stop: null,
                        duration_seconds: null
                    });
                }

                // Update local activityInstances state
                if (response && response.data) {
                    setActivityInstances(prev => prev.map(inst =>
                        inst.id === instanceId ? response.data : inst
                    ));
                }
            } catch (err) {
                console.error('Error with timer action:', err);
                const errorMsg = err.response?.data?.error || err.message;

                // Special handling for "Timer was never started" error
                if (errorMsg.includes('Timer was never started')) {
                    alert(
                        `Timer Error: Timer was never started\n\n` +
                        `You clicked "Stop" without first clicking "Start".\n\n` +
                        `Solution:\n` +
                        `1. Click the "Start" button first, then "Stop"\n` +
                        `   OR\n` +
                        `2. Manually enter the start and stop times in the fields below the timer buttons.`
                    );
                } else if (errorMsg.includes('Activity instance not found')) {
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
            const instance = activityInstances.find(inst => inst.id === instanceId);
            if (!instance) return;

            // Update locally first
            const updatedInstance = { ...instance, [field]: value };

            // Recalculate duration if both times are set
            if (updatedInstance.time_start && updatedInstance.time_stop) {
                const start = new Date(updatedInstance.time_start);
                const stop = new Date(updatedInstance.time_stop);
                updatedInstance.duration_seconds = Math.floor((stop - start) / 1000);
            } else {
                updatedInstance.duration_seconds = null;
            }

            // Update local state
            setActivityInstances(prev => prev.map(inst =>
                inst.id === instanceId ? updatedInstance : inst
            ));

            // Persist to backend
            try {
                await fractalApi.updateActivityInstance(rootId, instanceId, {
                    practice_session_id: sessionId,
                    activity_definition_id: instance.activity_definition_id,
                    time_start: updatedInstance.time_start,
                    time_stop: updatedInstance.time_stop,
                    duration_seconds: updatedInstance.duration_seconds
                });
            } catch (err) {
                console.error('Error syncing manual time update:', err);
            }
            return;
        }

        // Handle metric updates
        if (field === 'metrics') {
            try {
                await fractalApi.updateActivityMetrics(rootId, sessionId, instanceId, {
                    metrics: value
                });

                // Update local state
                setActivityInstances(prev => prev.map(inst =>
                    inst.id === instanceId ? { ...inst, metric_values: value } : inst
                ));
            } catch (err) {
                console.error('Error updating metrics:', err);
                alert(`Failed to update metrics: ${err.response?.data?.error || err.message}`);
            }
            return;
        }

        // For other fields (notes, completed, etc.), update the instance
        const instance = activityInstances.find(inst => inst.id === instanceId);
        if (!instance) return;

        const updatedInstance = { ...instance, [field]: value };
        setActivityInstances(prev => prev.map(inst =>
            inst.id === instanceId ? updatedInstance : inst
        ));

        // Persist to backend (for fields like notes, completed)
        try {
            await fractalApi.updateActivityInstance(rootId, instanceId, {
                practice_session_id: sessionId,
                activity_definition_id: instance.activity_definition_id,
                [field]: value
            });
        } catch (err) {
            console.error(`Error updating ${field}:`, err);
        }
    };

    const handleToggleExerciseComplete = async (sectionIndex, exerciseIndex) => {
        const section = sessionData.sections[sectionIndex];
        const instanceId = section.activity_ids?.[exerciseIndex];
        if (!instanceId) return;

        const instance = activityInstances.find(inst => inst.id === instanceId);
        if (!instance) return;

        const newCompleted = !instance.completed;

        // Update local state
        setActivityInstances(prev => prev.map(inst =>
            inst.id === instanceId ? { ...inst, completed: newCompleted } : inst
        ));

        // Persist to backend
        try {
            await fractalApi.updateActivityInstance(rootId, instanceId, {
                practice_session_id: sessionId,
                activity_definition_id: instance.activity_definition_id,
                completed: newCompleted
            });
        } catch (err) {
            console.error('Error updating completed status:', err);
        }
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
            let updatedInstances = [...activityInstances];
            let activityUpdatesOccurred = false;

            // If marking as complete, stop all running timers first
            if (newCompleted) {
                // Find running timers in activityInstances
                for (let i = 0; i < updatedInstances.length; i++) {
                    const instance = updatedInstances[i];
                    if (instance.time_start && !instance.time_stop) {
                        try {
                            const response = await fractalApi.stopActivityTimer(rootId, instance.id, {
                                practice_session_id: sessionId,
                                activity_definition_id: instance.activity_definition_id
                            });

                            if (response && response.data) {
                                updatedInstances[i] = response.data;
                                activityUpdatesOccurred = true;
                            }
                        } catch (err) {
                            console.error(`Error stopping timer for instance ${instance.id}:`, err);
                        }
                    }
                }

                if (activityUpdatesOccurred) {
                    setActivityInstances(updatedInstances);
                }

                // Update session_end and calculate total duration when completing
                if (sessionData) {
                    const sessionEndTime = new Date().toISOString();
                    const updatedData = { ...sessionData, session_end: sessionEndTime };

                    // Calculate total duration if we have session_start
                    if (sessionData.session_start) {
                        const startTime = new Date(sessionData.session_start);
                        const endTime = new Date(sessionEndTime);
                        const durationSeconds = Math.floor((endTime - startTime) / 1000);
                        updatedData.total_duration_seconds = durationSeconds;
                    }

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

        // Create the activity instance in the database via new endpoint
        try {
            const response = await fractalApi.addActivityToSession(rootId, sessionId, {
                activity_definition_id: activityDef.id
            });

            const newInstance = response.data;

            // Add to local activityInstances state
            setActivityInstances(prev => [...prev, newInstance]);

            // Update sessionData to include instance ID in the section's activity_ids array
            const updatedData = { ...sessionData };
            if (!updatedData.sections[sectionIndex].activity_ids) {
                updatedData.sections[sectionIndex].activity_ids = [];
            }
            updatedData.sections[sectionIndex].activity_ids.push(newInstance.id);
            setSessionData(updatedData);
            setShowActivitySelector(prev => ({ ...prev, [sectionIndex]: false }));
        } catch (err) {
            console.error('Error adding activity to session:', err);
            alert(`Failed to add activity: ${err.response?.data?.error || err.message}`);
        }
    };

    const handleDeleteExercise = async (sectionIndex, exerciseIndex) => {
        const section = sessionData.sections[sectionIndex];
        const instanceId = section.activity_ids?.[exerciseIndex];

        if (!instanceId) {
            console.error('No instance ID found for exercise');
            return;
        }

        try {
            // Delete from database
            await fractalApi.removeActivityFromSession(rootId, sessionId, instanceId);

            // Remove from local activityInstances state
            setActivityInstances(prev => prev.filter(inst => inst.id !== instanceId));

            // Remove from sessionData activity_ids array
            const updatedData = { ...sessionData };
            updatedData.sections[sectionIndex].activity_ids.splice(exerciseIndex, 1);
            setSessionData(updatedData);
        } catch (err) {
            console.error('Error deleting activity:', err);
            alert(`Failed to delete activity: ${err.response?.data?.error || err.message}`);
        }
    };

    const handleReorderActivity = (sectionIndex, exerciseIndex, direction) => {
        const updatedData = { ...sessionData };
        const activityIds = updatedData.sections[sectionIndex].activity_ids || [];

        // Calculate new index based on direction
        const newIndex = direction === 'up' ? exerciseIndex - 1 : exerciseIndex + 1;

        // Validate bounds
        if (newIndex < 0 || newIndex >= activityIds.length) return;

        // Swap the activity IDs
        const temp = activityIds[exerciseIndex];
        activityIds[exerciseIndex] = activityIds[newIndex];
        activityIds[newIndex] = temp;

        updatedData.sections[sectionIndex].activity_ids = activityIds;
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

                        {/* Activities */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {section.activity_ids?.map((instanceId, exerciseIndex) => {
                                // Look up the instance data from activityInstances state
                                const instance = activityInstances.find(inst => inst.id === instanceId);
                                if (!instance) return null; // Instance not loaded yet

                                // Look up the activity definition
                                const activityDef = activities.find(a => a.id === instance.activity_definition_id);
                                if (!activityDef) return null;

                                // Build exercise object for SessionActivityItem
                                const exercise = {
                                    type: 'activity',
                                    name: activityDef.name,
                                    activity_id: instance.activity_definition_id,
                                    instance_id: instance.id,
                                    description: activityDef.description,
                                    has_sets: activityDef.has_sets,
                                    has_metrics: activityDef.has_metrics,
                                    has_splits: activityDef.has_splits || false,
                                    time_start: instance.time_start,
                                    time_stop: instance.time_stop,
                                    duration_seconds: instance.duration_seconds,
                                    metric_values: instance.metric_values || [],
                                    metrics: instance.metric_values || [], // Map for compatibility with SessionActivityItem
                                    sets: instance.sets || [], // Map sets from instance data
                                    completed: instance.completed, // Add completed status
                                    notes: instance.notes // Add notes
                                };

                                return (
                                    <SessionActivityItem
                                        key={instance.id}
                                        exercise={exercise}
                                        activityDefinition={activityDef}
                                        onUpdate={(field, value) => handleExerciseChange(sectionIndex, exerciseIndex, field, value)}
                                        onToggleComplete={() => handleToggleExerciseComplete(sectionIndex, exerciseIndex)}
                                        onDelete={() => handleDeleteExercise(sectionIndex, exerciseIndex)}
                                        onReorder={(direction) => handleReorderActivity(sectionIndex, exerciseIndex, direction)}
                                        canMoveUp={exerciseIndex > 0}
                                        canMoveDown={exerciseIndex < section.activity_ids.length - 1}
                                        showReorderButtons={section.activity_ids.length > 1}
                                    />
                                );
                            })}
                        </div>
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
        </div >
    );
}

export default SessionDetail;
