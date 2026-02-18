import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import notify from '../utils/notify';
import { useGoals } from '../contexts/GoalsContext';

export function useSessionLogic(rootId, sessionId) {
    const navigate = useNavigate();
    const { setActiveRootId } = useGoals();

    const [session, setSession] = useState(null);
    const [sessionData, setSessionData] = useState(null);
    const [activityInstances, setActivityInstances] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activities, setActivities] = useState([]);
    const [activityGroups, setActivityGroups] = useState([]);
    const [parentGoals, setParentGoals] = useState([]);
    const [immediateGoals, setImmediateGoals] = useState([]);
    const [microGoals, setMicroGoals] = useState([]);
    const [showActivitySelector, setShowActivitySelector] = useState({});
    const [autoSaveStatus, setAutoSaveStatus] = useState('');

    // Track initial load to prevent auto-save on mount
    const isFirstLoad = useRef(true);
    const instancesCreatedRef = useRef(false);

    // Set Active Root ID
    useEffect(() => {
        if (!rootId) return;
        setActiveRootId(rootId);
        return () => setActiveRootId(null);
    }, [rootId, setActiveRootId]);

    // Fetch Activities and Groups
    const fetchActivities = useCallback(async () => {
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
    }, [rootId]);

    // Fetch Activity Instances
    const fetchActivityInstances = useCallback(async () => {
        try {
            const response = await fractalApi.getSessionActivities(rootId, sessionId);
            setActivityInstances(response.data);
        } catch (err) {
            console.error("Failed to fetch activity instances", err);
        }
    }, [rootId, sessionId]);

    // Fetch Session
    const fetchSession = useCallback(async () => {
        try {
            const res = await fractalApi.getSessions(rootId, { limit: 50 });
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

            // Sync canonical columns
            if (foundSession.session_start) parsedData.session_start = foundSession.session_start;
            if (foundSession.session_end) parsedData.session_end = foundSession.session_end;

            if (parsedData) {
                // Backwards compatibility for activity_ids
                if (parsedData.sections) {
                    parsedData.sections.forEach(section => {
                        if ((!section.activity_ids || section.activity_ids.length === 0) && section.exercises) {
                            section.activity_ids = section.exercises
                                .filter(e => e.type === 'activity' && e.instance_id)
                                .map(e => e.instance_id);
                        }
                    });
                }
                // Initialize session_start if missing
                if (!parsedData.session_start && foundSession.attributes?.created_at) {
                    parsedData.session_start = foundSession.attributes.created_at;
                }
                setSessionData(parsedData);
            }

            // Fetch Goals
            const shortTermGoals = foundSession.short_term_goals || [];
            const immGoals = foundSession.immediate_goals || [];

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

            setParentGoals(shortTermGoals);
            setImmediateGoals(immGoals);

            // Fetch Micro Goals
            try {
                const microRes = await fractalApi.getSessionMicroGoals(rootId, sessionId);
                setMicroGoals(microRes.data || []);
            } catch (err) {
                console.error("Failed to fetch session micro goals", err);
            }

            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch session", err);
            setLoading(false);
        }
    }, [rootId, sessionId, navigate]);

    // Initial Data Load
    useEffect(() => {
        if (!rootId || !sessionId) return;
        fetchSession();
        fetchActivities();
        fetchActivityInstances();
    }, [rootId, sessionId, fetchSession, fetchActivities, fetchActivityInstances]);

    // Create Missing Instances
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
    }, [sessionData, sessionId, rootId, loading, activityInstances, fetchActivityInstances]);

    // Auto-Save
    useEffect(() => {
        if (!sessionData || loading) return;
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

                const updatePayload = {
                    session_data: metadataOnly
                };

                // Normalize datetime formats - but preserve date-only strings!
                if (sessionData.session_start) {
                    const startVal = sessionData.session_start;
                    if (typeof startVal === 'string' && startVal.length === 10) {
                        updatePayload.session_start = startVal;
                    } else {
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
                setTimeout(() => setAutoSaveStatus(''), 2000);
            } catch (err) {
                console.error('Error auto-saving session:', err);
                setAutoSaveStatus('error');
                setTimeout(() => setAutoSaveStatus(''), 3000);
            }
        }, 1000); // Debounce by 1 second to avoid excessive API calls
        return () => clearTimeout(timeoutId);
    }, [sessionData, loading, rootId, sessionId]);

    // Handlers
    const handleAddActivity = async (sectionIndex, activityId, activityObject = null) => {
        const activityDef = activityObject || activities.find(a => a.id === activityId);
        if (!activityDef) return;

        try {
            const response = await fractalApi.addActivityToSession(rootId, sessionId, {
                activity_definition_id: activityDef.id
            });
            const newInstance = response.data;
            setActivityInstances(prev => [...prev, newInstance]);

            const updatedData = { ...sessionData };
            if (!updatedData.sections[sectionIndex].activity_ids) {
                updatedData.sections[sectionIndex].activity_ids = [];
            }
            updatedData.sections[sectionIndex].activity_ids.push(newInstance.id);
            setSessionData(updatedData);
            setShowActivitySelector(prev => ({ ...prev, [sectionIndex]: false }));
        } catch (err) {
            console.error('Error adding activity:', err);
            notify.error(`Failed to add activity: ${err.response?.data?.error || err.message}`);
        }
    };

    const handleDeleteActivity = async (sectionIndex, instanceId) => {
        const section = sessionData.sections[sectionIndex];
        const exerciseIndex = section.activity_ids?.indexOf(instanceId);
        if (exerciseIndex === -1 || !instanceId) return;

        try {
            await fractalApi.removeActivityFromSession(rootId, sessionId, instanceId);
            setActivityInstances(prev => prev.filter(inst => inst.id !== instanceId));
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
        const newIndex = direction === 'up' ? exerciseIndex - 1 : exerciseIndex + 1;
        if (newIndex < 0 || newIndex >= activityIds.length) return;

        const temp = activityIds[exerciseIndex];
        activityIds[exerciseIndex] = activityIds[newIndex];
        activityIds[newIndex] = temp;

        updatedData.sections[sectionIndex].activity_ids = activityIds;
        setSessionData(updatedData);
    };

    const handleUpdateActivity = async (instanceId, updatedFields) => {
        const instance = activityInstances.find(inst => inst.id === instanceId);
        if (!instance) return;

        // Timer actions
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
                    response = await fractalApi.updateActivityInstance(rootId, instanceId, {
                        session_id: sessionId,
                        activity_definition_id: instance.activity_definition_id,
                        time_start: null, time_stop: null, duration_seconds: null, completed: false
                    });
                }

                if (response && response.data) {
                    setActivityInstances(prev => prev.map(inst =>
                        inst.id === instanceId ? response.data : inst
                    ));
                    // Check targets/goals (simplified here, but logic from original)
                    if (response.data.achieved_targets?.length > 0) {
                        const names = response.data.achieved_targets.map(t => t.name || 'Target').join(', ');
                        notify.success(`🎯 Target achieved: ${names}`, { duration: 5000 });
                    }
                    if (response.data.completed_goals?.length > 0) {
                        const names = response.data.completed_goals.map(g => g.name || 'Goal').join(', ');
                        notify.success(`🏆 Goal completed: ${names}`, { duration: 6000 });
                    }
                    await fetchActivityInstances();
                }
            } catch (err) {
                console.error('Error with timer action:', err);
                const errorMsg = err.response?.data?.error || err.message;
                if (errorMsg.includes('Timer was never started')) {
                    notify.error(`Timer Error: Timer was never started. Click "Start" first.`);
                } else if (errorMsg.includes('Activity instance not found')) {
                    notify.error(`Timer Error: Activity instance not found.`);
                } else {
                    notify.error(`Error updating timer: ${errorMsg}`);
                }
            }
            return;
        }

        // Metrics logic
        if (updatedFields.metrics !== undefined) {
            const metricsPayload = updatedFields.metrics.map(m => ({
                metric_id: m.metric_id,
                split_id: m.split_id || null,
                value: m.value
            }));
            setActivityInstances(prev => prev.map(inst =>
                inst.id === instanceId ? { ...inst, metrics: updatedFields.metrics } : inst
            ));
            try {
                await fractalApi.updateActivityMetrics(rootId, sessionId, instanceId, { metrics: metricsPayload });
            } catch (e) { notify.error('Failed to update metrics'); }
            return;
        }

        // Handle sets updates specially
        if (updatedFields.sets !== undefined) {
            setActivityInstances(prev => prev.map(inst =>
                inst.id === instanceId ? { ...inst, sets: updatedFields.sets } : inst
            ));
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

        // General updates
        const payload = { ...updatedFields };
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

        setActivityInstances(prev => prev.map(inst => inst.id === instanceId ? { ...inst, ...payload } : inst));
        try {
            await fractalApi.updateActivityInstance(rootId, instanceId, {
                session_id: sessionId,
                activity_definition_id: instance.activity_definition_id,
                ...payload
            });
        } catch (e) { notify.error('Failed to update activity'); }
    };

    // Move activity handlers
    const handleMoveActivity = (sourceSectionIndex, targetSectionIndex, instanceId) => {
        if (sourceSectionIndex === targetSectionIndex) return;

        const updatedData = { ...sessionData };
        const sourceSection = { ...updatedData.sections[sourceSectionIndex] };
        const targetSection = { ...updatedData.sections[targetSectionIndex] };

        const sourceActivityIds = [...(sourceSection.activity_ids || [])];
        const activityIndex = sourceActivityIds.indexOf(instanceId);
        if (activityIndex === -1) return;

        sourceActivityIds.splice(activityIndex, 1);
        sourceSection.activity_ids = sourceActivityIds;

        const targetActivityIds = [...(targetSection.activity_ids || [])];
        targetActivityIds.push(instanceId);
        targetSection.activity_ids = targetActivityIds;

        updatedData.sections[sourceSectionIndex] = sourceSection;
        updatedData.sections[targetSectionIndex] = targetSection;
        setSessionData(updatedData);
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

    const handleUpdateGoal = async (goalId, updates) => {
        try {
            await fractalApi.updateGoal(rootId, goalId, updates);

            // Optimistic updates could happen here if we passed setters for selectedGoal etc, 
            // but fetching session is safer/easier
            setParentGoals(prev => prev.map(g =>
                g.id === goalId ? { ...g, ...updates, attributes: { ...g.attributes, ...updates } } : g
            ));

            fetchSession();
        } catch (err) {
            console.error('Error updating goal:', err);
            notify.error(`Failed to update goal: ${err.response?.data?.error || err.message}`);
        }
    };

    const handleToggleSessionComplete = async () => {
        if (!session) return;

        try {
            const newCompleted = !session.attributes.completed;
            let updatedInstances = [...activityInstances];
            let activityUpdatesOccurred = false;

            if (newCompleted) {
                // Stop all running timers
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

            const updatePayload = { completed: newCompleted };

            if (newCompleted && sessionData) {
                const sessionEndTime = new Date().toISOString();
                updatePayload.session_end = sessionEndTime;

                let durationSeconds = null;
                if (sessionData.session_start) {
                    const startTime = new Date(sessionData.session_start);
                    const endTime = new Date(sessionEndTime);
                    durationSeconds = Math.floor((endTime - startTime) / 1000);
                    updatePayload.total_duration_seconds = durationSeconds;
                }

                const updatedData = {
                    ...sessionData,
                    session_end: sessionEndTime,
                    total_duration_seconds: durationSeconds
                };
                updatePayload.session_data = updatedData;
                setSessionData(updatedData);
            }

            const res = await fractalApi.updateSession(rootId, sessionId, updatePayload);
            setSession(res.data);

            if (newCompleted) {
                await new Promise(resolve => setTimeout(resolve, 100));

                // Fetch updated goals to check for auto-completion
                /* Note: logic simplified to just usage of notifications from fetch results if we wanted, 
                   but for now just refreshing the session and goals is enough to show state */
                await fetchSession();

                notify.success('Session completed!');
            } else {
                notify.success('Session marked as incomplete');
            }
        } catch (err) {
            console.error('Error toggling completion:', err);
            notify.error('Error updating completion status: ' + (err.response?.data?.error || err.message));
        }
    };


    return {
        session, setSession,
        sessionData, setSessionData,
        activityInstances, setActivityInstances,
        loading,
        activities, setActivities,
        activityGroups,
        parentGoals, setParentGoals,
        immediateGoals, setImmediateGoals,
        microGoals, setMicroGoals,
        showActivitySelector, setShowActivitySelector,
        autoSaveStatus,
        fetchSession, fetchActivities, fetchActivityInstances,
        handleAddActivity,
        handleDeleteActivity,
        handleReorderActivity,
        handleUpdateActivity,
        handleMoveActivity,
        handleConfirmDeleteSession,
        handleUpdateGoal,
        handleToggleSessionComplete
    };
}
