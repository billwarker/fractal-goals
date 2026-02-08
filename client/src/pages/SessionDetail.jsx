import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import SessionSection from '../components/sessionDetail/SessionSection';
import { getAchievedTargetsForSession } from '../utils/targetUtils';
import ConfirmationModal from '../components/ConfirmationModal';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatForInput, localToISO, formatDateInTimezone } from '../utils/dateUtils';
import ActivityBuilder from '../components/ActivityBuilder';
import GoalDetailModal from '../components/GoalDetailModal';
import SessionInfoPanel from '../components/sessionDetail/SessionInfoPanel';
import { SessionSidePane } from '../components/sessionDetail'; // Keep this for now, as it's used in the side pane
import useSessionNotes from '../hooks/useSessionNotes';
import useTargetAchievements from '../hooks/useTargetAchievements';
import styles from './SessionDetail.module.css'; // New CSS module import
import notify from '../utils/notify';
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
 * Calculate total completed duration
 * - If session_end is set: use session_end - session_start
 * - If session_end is NULL: sum all section durations
 */
function calculateTotalCompletedDuration(sessionData, activityInstances) {
    if (!sessionData) return 0;

    // Priority 1: If session_end is set, use session_end - session_start
    if (sessionData.session_end && sessionData.session_start) {
        const start = new Date(sessionData.session_start);
        const end = new Date(sessionData.session_end);
        const diffSeconds = Math.floor((end - start) / 1000);
        return diffSeconds > 0 ? diffSeconds : 0;
    }

    // Priority 2: Sum all section durations from activity instances
    if (!sessionData.sections) return 0;

    let totalSeconds = 0;
    for (const section of sessionData.sections) {
        totalSeconds += calculateSectionDuration(section, activityInstances);
    }

    return totalSeconds;
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

// function formatDateTime(isoString) removed - using formatDateInTimezone instead

/**
 * Session Detail Page
 * Fill in session details based on template sections
 */
function SessionDetail() {
    const { rootId, sessionId } = useParams();
    const navigate = useNavigate();
    const { timezone } = useTimezone();

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
    const [selectedGoal, setSelectedGoal] = useState(null); // For goal detail modal
    const [selectedActivity, setSelectedActivity] = useState(null); // For side pane context
    const [selectedSetIndex, setSelectedSetIndex] = useState(null); // For set-level note context
    const [draggedItem, setDraggedItem] = useState(null); // For drag-and-drop between sections
    const isFirstLoad = React.useRef(true); // Track initial load to prevent auto-save on mount

    // Handler for activity/set focus changes
    const handleActivityFocus = (instance, setIndex = null) => {
        setSelectedActivity(instance);
        setSelectedSetIndex(setIndex);
    };

    // Handler for moving activity between sections via drag-and-drop
    const handleMoveActivity = (sourceSectionIndex, targetSectionIndex, instanceId) => {
        if (sourceSectionIndex === targetSectionIndex) return;

        const updatedData = { ...sessionData };
        const sourceSection = { ...updatedData.sections[sourceSectionIndex] };
        const targetSection = { ...updatedData.sections[targetSectionIndex] };

        // Remove from source section
        const sourceActivityIds = [...(sourceSection.activity_ids || [])];
        const activityIndex = sourceActivityIds.indexOf(instanceId);
        if (activityIndex === -1) return;

        sourceActivityIds.splice(activityIndex, 1);
        sourceSection.activity_ids = sourceActivityIds;

        // Add to target section
        const targetActivityIds = [...(targetSection.activity_ids || [])];
        targetActivityIds.push(instanceId);
        targetSection.activity_ids = targetActivityIds;

        // Update the sections
        updatedData.sections[sourceSectionIndex] = sourceSection;
        updatedData.sections[targetSectionIndex] = targetSection;

        setSessionData(updatedData);
    };

    // Centralized Notes Management
    const {
        notes: sessionNotes,
        previousNotes,
        previousSessionNotes,
        addNote,
        updateNote,
        deleteNote,
        refreshNotes
    } = useSessionNotes(rootId, sessionId, selectedActivity?.activity_definition_id);

    // Real-time target achievement tracking
    // This provides immediate feedback when targets are hit during a session
    const allGoalsForTargets = [...parentGoals, ...(session?.immediate_goals || [])];
    const {
        targetAchievements,
        achievedTargetIds,
    } = useTargetAchievements(activityInstances, allGoalsForTargets);

    // Track which targets we've already shown notifications for
    const [notifiedTargetIds, setNotifiedTargetIds] = useState(new Set());
    // Toast notification state
    const [toastMessage, setToastMessage] = useState(null);

    // Local state for editing session datetime fields
    const [localSessionStart, setLocalSessionStart] = useState('');
    const [localSessionEnd, setLocalSessionEnd] = useState('');

    // Group activities by group_id for the selector
    const groupedActivities = activities.reduce((acc, activity) => {
        const groupId = activity.group_id || 'ungrouped';
        if (!acc[groupId]) {
            acc[groupId] = [];
        }
        acc[groupId].push(activity);
        return acc;
    }, {});

    const groupMap = activityGroups.reduce((acc, group) => {
        acc[group.id] = group;
        return acc;
    }, { ungrouped: { id: 'ungrouped', name: 'Ungrouped' } });


    // Auto-save sessionData (UI metadata only) to database whenever it changes
    useEffect(() => {
        if (!sessionData || loading) return;

        // Skip the first update (initial load) to prevent auto-save on mount
        if (isFirstLoad.current) {
            isFirstLoad.current = false;
            return;
        }

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
                    session_data: metadataOnly
                };

                // Normalize datetime formats - but preserve date-only strings!
                // If session_start is just a date (YYYY-MM-DD), keep as-is to avoid timezone issues
                if (sessionData.session_start) {
                    const startVal = sessionData.session_start;
                    // If it's a 10-char date string (YYYY-MM-DD), keep as-is
                    if (typeof startVal === 'string' && startVal.length === 10) {
                        updatePayload.session_start = startVal;
                    } else {
                        // It's a full datetime, convert to ISO
                        const startDate = new Date(startVal);
                        updatePayload.session_start = startDate.toISOString();
                    }
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

    // Detect new target achievements and show toast notification
    useEffect(() => {
        if (!achievedTargetIds || achievedTargetIds.size === 0) return;

        // Find newly achieved targets (achieved but not yet notified)
        const newlyAchieved = [];
        for (const targetId of achievedTargetIds) {
            if (!notifiedTargetIds.has(targetId)) {
                const status = targetAchievements.get(targetId);
                // Only notify for targets achieved THIS session (not previously completed)
                if (status && !status.wasAlreadyCompleted) {
                    newlyAchieved.push(status);
                }
            }
        }

        if (newlyAchieved.length > 0) {
            // Show toast for the new achievement(s)
            const names = newlyAchieved.map(s => s.target.name || 'Target').join(', ');
            setToastMessage(`🎯 Target achieved: ${names}`);

            // Add to notified set
            setNotifiedTargetIds(prev => {
                const newSet = new Set(prev);
                newlyAchieved.forEach(s => newSet.add(s.target.id));
                return newSet;
            });

            // Auto-dismiss toast after 4 seconds
            setTimeout(() => setToastMessage(null), 4000);
        }
    }, [achievedTargetIds, notifiedTargetIds, targetAchievements]);

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
            const res = await fractalApi.getSessions(rootId, { limit: 50 });
            // Handle paginated response format
            const sessionsData = res.data.sessions || res.data;
            const foundSession = sessionsData.find(s => s.id === sessionId);

            if (!foundSession) {
                notify.error('Session not found');
                navigate(`/${rootId}/sessions`);
                return;
            }

            setSession(foundSession);

            // Parse session_data
            const parsedData = foundSession.attributes?.session_data || {};

            // Sync canonical columns to sessionData to ensure consistency
            // This ensures duration calculation (End - Start) uses the correct timestamps
            if (foundSession.session_start) parsedData.session_start = foundSession.session_start;
            if (foundSession.session_end) parsedData.session_end = foundSession.session_end;

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

                // Initialize session_start if it doesn't exist (moved from separate useEffect)
                // Use the full datetime from created_at to preserve the time component
                if (!parsedData.session_start && foundSession.attributes?.created_at) {
                    parsedData.session_start = foundSession.attributes.created_at;
                }

                setSessionData(parsedData);
            }

            // Use the goal data directly from the session response
            // New structure: short_term_goals and immediate_goals arrays
            const shortTermGoals = foundSession.short_term_goals || [];
            const immediateGoals = foundSession.immediate_goals || [];

            // For backward compatibility, also check attributes.parent_ids if new data is empty
            if (shortTermGoals.length === 0 && foundSession.attributes?.parent_ids?.length > 0) {
                const parentIds = foundSession.attributes.parent_ids;
                for (const goalId of parentIds) {
                    try {
                        const goalRes = await fractalApi.getGoal(rootId, goalId);
                        shortTermGoals.push(goalRes.data);
                    } catch (err) {
                        console.error(`Failed to fetch goal ${goalId}`, err);
                    }
                }
            }

            // Store both goal types
            setParentGoals(shortTermGoals);
            // Store immediate goals in session object (already available via foundSession.immediate_goals)

            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch session", err);
            setLoading(false);
        }
    };



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
            console.log('Session sections:', sessionData.sections?.length || 0);

            let createdCount = 0;
            const createdInstances = [];

            for (const section of sessionData.sections || []) {
                console.log(`Section "${section.name}": ${section.exercises?.length || 0} exercises`);
                for (const exercise of section.exercises || []) {
                    // Only process activities (not rest periods, etc.)
                    if (exercise.type === 'activity' && exercise.instance_id && exercise.activity_id) {
                        // Check if instance already exists in our state
                        const instanceExists = activityInstances.some(inst => inst.id === exercise.instance_id);

                        if (!instanceExists) {
                            try {
                                // Try to create the instance
                                const response = await fractalApi.addActivityToSession(rootId, sessionId, {
                                    instance_id: exercise.instance_id,
                                    activity_definition_id: exercise.activity_id
                                });
                                createdCount++;
                                createdInstances.push(response.data);
                                console.log(`Created instance ${exercise.instance_id.substring(0, 8)}... for activity ${exercise.name}`);
                            } catch (err) {
                                // Silently fail - instance might already exist in DB
                                console.debug(`Instance ${exercise.instance_id} already exists or error:`, err.message);
                            }
                        }
                    }
                }
            }

            console.log(`Finished creating instances. Total created: ${createdCount}`);
            instancesCreatedRef.current = true;

            // If we created any instances, refresh the activityInstances state
            if (createdCount > 0) {
                // Fetch fresh data from database to ensure consistency
                await fetchActivityInstances();
            }
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

    const handleUpdateActivity = async (instanceId, updatedFields) => {
        const instance = activityInstances.find(inst => inst.id === instanceId);
        if (!instance) return;

        // Handle timer actions specially
        if (updatedFields.timer_action) {
            const value = updatedFields.timer_action;
            try {
                let response;
                if (value === 'start') {
                    response = await fractalApi.startActivityTimer(rootId, instanceId, {
                        session_id: sessionId,
                        activity_definition_id: instance.activity_definition_id
                    });
                } else if (value === 'complete') {
                    response = await fractalApi.completeActivityInstance(rootId, instanceId, {
                        session_id: sessionId,
                        activity_definition_id: instance.activity_definition_id
                    });
                } else if (value === 'reset') {
                    // Reset: update instance in database to clear times
                    response = await fractalApi.updateActivityInstance(rootId, instanceId, {
                        session_id: sessionId,
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

                    // Check for newly achieved targets (from backend target evaluation)
                    if (response.data.achieved_targets?.length > 0) {
                        const names = response.data.achieved_targets.map(t => t.name || 'Target').join(', ');
                        notify.success(`🎯 Target achieved: ${names}`, { duration: 5000 });
                    }

                    // Check for completed goals (from backend goal auto-completion)
                    if (response.data.completed_goals?.length > 0) {
                        const names = response.data.completed_goals.map(g => g.name || 'Goal').join(', ');
                        notify.success(`🏆 Goal completed: ${names}`, { duration: 6000 });
                    }

                    // Refresh from server to ensure full consistency
                    await fetchActivityInstances();
                }
            } catch (err) {
                console.error('Error with timer action:', err);
                const errorMsg = err.response?.data?.error || err.message;

                // Special handling for "Timer was never started" error
                if (errorMsg.includes('Timer was never started')) {
                    const message = `Timer Error: Timer was never started\n\n` +
                        `You clicked "Stop" without first clicking "Start".\n\n` +
                        `Solution:\n` +
                        `1. Click the "Start" button first, then "Stop"\n` +
                        `   OR\n` +
                        `2. Manually enter the start and stop times in the fields below the timer buttons.`;
                    notify.error(message, { duration: 6000 });
                } else if (errorMsg.includes('Activity instance not found')) {
                    const message = `Timer Error: Activity instance not found\n\n` +
                        `This usually happens when:\n` +
                        `• The page was refreshed before starting the timer\n` +
                        `• The "Start" button was never clicked\n\n` +
                        `Solution: Click the "Start" button first, then "Complete".\n\n` +
                        `Alternatively, you can manually enter the start and stop times below the timer buttons.`;
                    notify.error(message, { duration: 6000 });
                } else {
                    notify.error(`Error updating timer: ${errorMsg}\n\nInstance ID: ${instanceId}\nAction: ${value}`);
                }
            }
            return;
        }

        // Handle metrics updates specially - call the dedicated metrics API
        if (updatedFields.metrics !== undefined) {
            const metricsPayload = updatedFields.metrics.map(m => ({
                metric_id: m.metric_id,
                split_id: m.split_id || null,
                value: m.value
            }));

            // Update local state first
            setActivityInstances(prev => prev.map(inst =>
                inst.id === instanceId ? { ...inst, metrics: updatedFields.metrics } : inst
            ));

            // Persist to backend via dedicated metrics endpoint
            try {
                await fractalApi.updateActivityMetrics(rootId, sessionId, instanceId, {
                    metrics: metricsPayload
                });
            } catch (err) {
                console.error('Error syncing activity metrics update:', err);
                notify.error(`Failed to update metrics: ${err.response?.data?.error || err.message}`);
            }
            return;
        }

        // Handle sets updates specially - extract metrics and call the metrics API for each set
        if (updatedFields.sets !== undefined) {
            // Update local state first
            setActivityInstances(prev => prev.map(inst =>
                inst.id === instanceId ? { ...inst, sets: updatedFields.sets } : inst
            ));

            // For set-based activities, we need to store sets in the instance's data field
            // and also sync individual set metrics to the metric_values table
            // For now, persist the sets structure via the regular update endpoint
            try {
                await fractalApi.updateActivityInstance(rootId, instanceId, {
                    session_id: sessionId,
                    activity_definition_id: instance.activity_definition_id,
                    sets: updatedFields.sets
                });
            } catch (err) {
                console.error('Error syncing activity sets update:', err);
                notify.error(`Failed to update sets: ${err.response?.data?.error || err.message}`);
            }
            return;
        }

        // Prepare payload for other API updates
        const payload = { ...updatedFields };

        // Recalculate duration if time_start or time_stop are updated
        if (payload.time_start !== undefined || payload.time_stop !== undefined) {
            const newStart = payload.time_start !== undefined ? payload.time_start : instance.time_start;
            const newStop = payload.time_stop !== undefined ? payload.time_stop : instance.time_stop;

            if (newStart && newStop) {
                const start = new Date(newStart);
                const stop = new Date(newStop);
                payload.duration_seconds = Math.floor((stop - start) / 1000);
            } else {
                payload.duration_seconds = null;
            }
        }

        // Update local state first
        setActivityInstances(prev => prev.map(inst =>
            inst.id === instanceId ? { ...inst, ...payload } : inst
        ));

        // Persist to backend
        try {
            await fractalApi.updateActivityInstance(rootId, instanceId, {
                session_id: sessionId,
                activity_definition_id: instance.activity_definition_id,
                ...payload
            });
        } catch (err) {
            console.error('Error syncing activity instance update:', err);
            notify.error(`Failed to update activity: ${err.response?.data?.error || err.message}`);
        }
    };

    const handleSaveSession = async () => {
        // Auto-save is already handling persistence, so just navigate away
        notify.success('Session saved successfully');
        navigate(`/${rootId}/sessions`);
    };

    const handleDeleteSessionClick = () => {
        setShowDeleteConfirm(true);
    };

    const handleConfirmDeleteSession = async () => {

        try {
            await fractalApi.deleteSession(rootId, sessionId);
            notify.success('Session deleted successfully');
            navigate(`/${rootId}/sessions`);
        } catch (err) {
            console.error('Error deleting session:', err);
            notify.error('Error deleting session: ' + err.message);
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
                            const response = await fractalApi.completeActivityInstance(rootId, instance.id, {
                                session_id: sessionId,
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
            }

            // Prepare update payload
            const updatePayload = { completed: newCompleted };

            // If marking as complete, update timing fields in the SAME request
            if (newCompleted && sessionData) {
                const sessionEndTime = new Date().toISOString();
                updatePayload.session_end = sessionEndTime;

                // Calculate total duration if we have session_start
                let durationSeconds = null;
                if (sessionData.session_start) {
                    const startTime = new Date(sessionData.session_start);
                    const endTime = new Date(sessionEndTime);
                    durationSeconds = Math.floor((endTime - startTime) / 1000);
                    updatePayload.total_duration_seconds = durationSeconds;
                }

                // Sync the session_data JSON blob as well
                const updatedData = {
                    ...sessionData,
                    session_end: sessionEndTime,
                    total_duration_seconds: durationSeconds
                };
                updatePayload.session_data = updatedData;

                // Update local sessionData immediately to prevent stale overwrites from fetchSession
                setSessionData(updatedData);
            }

            // Mark session complete - this triggers backend EVENT SYSTEM:
            // SESSION_COMPLETED → evaluate targets → auto-complete goals if all targets met
            const res = await fractalApi.updateSession(rootId, sessionId, updatePayload);
            setSession(res.data);

            // If we just completed the session, fetch updated goals to show completion results
            if (newCompleted) {
                // Give the backend a moment to process the event cascade
                await new Promise(resolve => setTimeout(resolve, 100));

                // Refetch goals to see any auto-completion updates
                const allGoals = [...parentGoals, ...(session.immediate_goals || [])];
                let totalNewlyCompleted = 0;
                const goalsAutoCompleted = [];

                for (const goal of allGoals) {
                    const goalId = goal.id || goal.attributes?.id;
                    try {
                        // Fetch the updated goal to see if it was auto-completed
                        const updatedGoalRes = await fractalApi.getGoal(rootId, goalId);
                        const updatedGoal = updatedGoalRes.data;

                        // Check if goal was newly completed (wasn't before, is now)
                        const wasCompleted = goal.completed || goal.attributes?.completed;
                        const isNowCompleted = updatedGoal.completed || updatedGoal.attributes?.completed;

                        if (!wasCompleted && isNowCompleted) {
                            goalsAutoCompleted.push({ goalId, goalName: updatedGoal.name });
                        }

                        // Count newly completed targets by comparing
                        const oldTargets = parseGoalTargets(goal);
                        const newTargets = parseGoalTargets(updatedGoal);

                        for (const newT of newTargets) {
                            const oldT = oldTargets.find(t => t.id === newT.id);
                            if (newT.completed && (!oldT || !oldT.completed)) {
                                totalNewlyCompleted++;
                            }
                        }
                    } catch (err) {
                        console.error(`Error fetching updated goal ${goalId}:`, err);
                    }
                }

                // Show summary if any targets were completed
                if (totalNewlyCompleted > 0 || goalsAutoCompleted.length > 0) {
                    let message = '🎯 Session Completed!\n\n';

                    if (totalNewlyCompleted > 0) {
                        message += `✓ ${totalNewlyCompleted} target${totalNewlyCompleted > 1 ? 's' : ''} achieved!\n`;
                    }

                    if (goalsAutoCompleted.length > 0) {
                        message += `\n🏆 Auto-completed goal${goalsAutoCompleted.length > 1 ? 's' : ''}:\n`;
                        message += goalsAutoCompleted.map(r => `  • ${r.goalName}`).join('\n');
                    }

                    console.log(message);
                    setTimeout(() => notify.success(message, { duration: 6000 }), 100);
                } else if (!newCompleted) {
                    notify.success('Session marked as incomplete');
                } else {
                    notify.success('Session completed!');
                }

                // Refresh session to get updated goal data
                fetchSession();
            }
        } catch (err) {
            console.error('Error toggling completion:', err);
            notify.error('Error updating completion status: ' + (err.response?.data?.error || err.message));
        }
    };

    // Helper to parse targets from a goal
    const parseGoalTargets = (goal) => {
        let targets = [];
        const raw = goal.attributes?.targets || goal.targets;
        if (raw) {
            try {
                targets = typeof raw === 'string' ? JSON.parse(raw) : raw;
            } catch (e) {
                targets = [];
            }
        }
        return Array.isArray(targets) ? targets : [];
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
            // Since handleAddActivity looks up by ID from 'activities' state which might not be updated yet
            // We'll manually call the logic inside handleAddActivity but with the new object
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
            notify.error(`Failed to add activity: ${err.response?.data?.error || err.message}`);
        }
    };

    const handleDeleteActivity = async (sectionIndex, instanceId) => {
        const section = sessionData.sections[sectionIndex];
        const exerciseIndex = section.activity_ids?.indexOf(instanceId);

        if (exerciseIndex === -1 || !instanceId) {
            console.error('Instance ID not found in section for deletion');
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
            notify.error(`Failed to delete activity: ${err.response?.data?.error || err.message}`);
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

    const handleUpdateGoal = async (goalId, updates) => {
        try {
            await fractalApi.updateGoal(rootId, goalId, updates);

            // Update local state
            if (selectedGoal && selectedGoal.id === goalId) {
                setSelectedGoal({ ...selectedGoal, ...updates, attributes: { ...selectedGoal.attributes, ...updates } });
            }

            // Update parent goals if it's one of them
            setParentGoals(prev => prev.map(g =>
                g.id === goalId ? { ...g, ...updates, attributes: { ...g.attributes, ...updates } } : g
            ));

            // Refresh session to get updated immediate goals
            fetchSession();

            setSelectedGoal(null);
        } catch (err) {
            console.error('Error updating goal:', err);
            notify.error(`Failed to update goal: ${err.response?.data?.error || err.message}`);
        }
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className={styles.statusMessage}>
                    <p>Loading session...</p>
                </div>
            </div>
        );
    }

    if (!session || !sessionData) {
        return (
            <div className="page-container">
                <div className={styles.statusMessage}>
                    <p>Session not found</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.sessionDetailContainer}>
            {/* Main Content Column */}
            <div className={styles.sessionMainContent}>

                {/* Minimal Header */}

                {/* Toast Notification for Target Achievements */}
                {toastMessage && (
                    <div className={styles.toastNotification}>
                        <span className={styles.toastIcon}>🎯</span>
                        <div className={styles.toastContent}>
                            <div className={styles.toastTitle}>
                                Target Achieved!
                            </div>
                            <div className={styles.toastText}>
                                {toastMessage.replace('🎯 Target achieved: ', '')}
                            </div>
                        </div>
                        <button
                            onClick={() => setToastMessage(null)}
                            className={styles.toastCloseBtn}
                        >
                            ×
                        </button>
                    </div>
                )}

                {/* Sections List */}
                <div className={styles.sessionSectionsList}>
                    {sessionData.sections?.map((section, sectionIndex) => (
                        <SessionSection
                            key={sectionIndex}
                            section={section}
                            sectionIndex={sectionIndex}
                            activityInstances={activityInstances}
                            onDeleteActivity={handleDeleteActivity}
                            onUpdateActivity={handleUpdateActivity}
                            onFocusActivity={handleActivityFocus}
                            selectedActivityId={selectedActivity?.id}
                            rootId={rootId}
                            showActivitySelector={showActivitySelector[sectionIndex]}
                            onToggleActivitySelector={(val) => setShowActivitySelector(prev => ({ ...prev, [sectionIndex]: typeof val === 'boolean' ? val : !prev[sectionIndex] }))}
                            onAddActivity={handleAddActivity}
                            onOpenActivityBuilder={handleOpenActivityBuilder}
                            groupedActivities={groupedActivities}
                            groupMap={groupMap}
                            activities={activities}
                            onNoteCreated={refreshNotes}
                            sessionId={sessionId}
                            allNotes={sessionNotes}
                            onAddNote={addNote}
                            onUpdateNote={updateNote}
                            onDeleteNote={deleteNote}
                            // Drag and drop props
                            onMoveActivity={handleMoveActivity}
                            onReorderActivity={handleReorderActivity}
                            draggedItem={draggedItem}
                            setDraggedItem={setDraggedItem}
                        />
                    ))}
                </div>

            </div>

            {/* Sidebar */}
            <div className={styles.sessionSidebarWrapper}>
                <div className={styles.sessionSidebarSticky}>
                    <SessionSidePane
                        rootId={rootId}
                        sessionId={sessionId}
                        session={session}
                        sessionData={sessionData}
                        parentGoals={parentGoals}
                        totalDuration={calculateTotalCompletedDuration(sessionData, activityInstances)}
                        selectedActivity={selectedActivity}
                        selectedSetIndex={selectedSetIndex}
                        activityInstances={activityInstances}
                        activityDefinitions={activities}
                        onNoteAdded={refreshNotes}
                        onGoalClick={(goal) => setSelectedGoal(goal)}
                        refreshTrigger={0} // Deprecated
                        notes={sessionNotes}
                        previousNotes={previousNotes}
                        previousSessionNotes={previousSessionNotes}
                        addNote={addNote}
                        updateNote={updateNote}
                        deleteNote={deleteNote}
                        isCompleted={session.attributes?.completed}
                        onDelete={handleDeleteSessionClick}
                        onCancel={() => navigate(`/${rootId}/sessions`)}
                        onToggleComplete={handleToggleSessionComplete}

                        onSave={handleSaveSession}
                        onSessionChange={(updatedSession) => {
                            setSession(updatedSession);
                            // Update sessionData if datetime fields changed
                            if (updatedSession.session_start || updatedSession.session_end) {
                                setSessionData(prev => ({
                                    ...prev,
                                    session_start: updatedSession.session_start,
                                    session_end: updatedSession.session_end
                                }));
                            }
                        }}
                    />
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

            {/* Goal Detail Modal */}
            <GoalDetailModal
                isOpen={!!selectedGoal}
                onClose={() => setSelectedGoal(null)}
                goal={selectedGoal}
                onUpdate={handleUpdateGoal}
                activityDefinitions={activities}
                activityGroups={activityGroups}
                rootId={rootId}
            />

            {/* Auto-save status indicator */}
            {
                autoSaveStatus && (
                    <div className={`${styles.autoSaveIndicator} ${autoSaveStatus === 'saved' ? styles.autoSaveSaved : autoSaveStatus === 'error' ? styles.autoSaveError : styles.autoSaveDefault}`}>
                        {autoSaveStatus === 'saving' && '💾 Saving...'}
                        {autoSaveStatus === 'saved' && '✓ Saved'}
                        {autoSaveStatus === 'error' && '⚠ Error'}
                    </div>
                )
            }
        </div>
    );
}

export default SessionDetail;
