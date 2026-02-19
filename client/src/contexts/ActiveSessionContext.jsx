import React, { createContext, useContext, useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import notify from '../utils/notify';
import { useGoals } from './GoalsContext';
import { useTimezone } from './TimezoneContext';
import { useTargetAchievements } from '../hooks/useTargetAchievements';
import { createAutoSaveQueue } from '../utils/autoSaveQueue';

const ActiveSessionContext = createContext();

export function ActiveSessionProvider({ rootId, sessionId, children }) {
    const queryClient = useQueryClient();
    const { setActiveRootId } = useGoals();
    const { timezone } = useTimezone();

    // UI state
    const [showActivitySelector, setShowActivitySelector] = useState({});
    const [autoSaveStatus, setAutoSaveStatus] = useState('');
    const [sidePaneMode, setSidePaneMode] = useState('details');
    const [notifiedTargetIds, setNotifiedTargetIds] = useState(new Set());
    const [localSessionData, setLocalSessionData] = useState(null);
    const [draggedItem, setDraggedItem] = useState(null);
    const [isDeletingSession, setIsDeletingSession] = useState(false);
    const initializedRef = useRef(false);
    const [justInitialized, setJustInitialized] = useState(false);
    const previousSessionKeyRef = useRef(null);

    // 1. Queries
    const { data: session, isLoading: sessionLoading, isError: sessionError, refetch: refreshSession } = useQuery({
        queryKey: ['session', rootId, sessionId],
        queryFn: async () => {
            try {
                const res = await fractalApi.getSession(rootId, sessionId);
                return res.data;
            } catch (err) {
                // Session can legitimately disappear during delete navigation.
                if (err?.response?.status === 404) return null;
                throw err;
            }
        },
        enabled: !!rootId && !!sessionId && !isDeletingSession
    });

    const { data: activityInstances = [], isLoading: instancesLoading, refetch: refreshInstances } = useQuery({
        queryKey: ['session-activities', rootId, sessionId],
        queryFn: async () => {
            try {
                const res = await fractalApi.getSessionActivities(rootId, sessionId);
                return res.data;
            } catch (err) {
                if (err?.response?.status === 404) return [];
                throw err;
            }
        },
        enabled: !!rootId && !!sessionId && !isDeletingSession
    });

    const { data: activitiesRaw = [], isLoading: activitiesLoading } = useQuery({
        queryKey: ['activities', rootId],
        queryFn: async () => {
            const res = await fractalApi.getActivities(rootId);
            return res.data;
        },
        enabled: !!rootId
    });

    const activities = useMemo(() => {
        if (Array.isArray(activitiesRaw)) return activitiesRaw;
        console.warn('[ActiveSessionContext] activitiesRaw is not an array:', activitiesRaw);
        return [];
    }, [activitiesRaw]);

    const { data: activityGroups = [] } = useQuery({
        queryKey: ['activity-groups', rootId],
        queryFn: async () => {
            const res = await fractalApi.getActivityGroups(rootId);
            return res.data;
        },
        enabled: !!rootId
    });

    const { data: microGoals = [] } = useQuery({
        queryKey: ['session-micro-goals', rootId, sessionId],
        queryFn: async () => {
            const res = await fractalApi.getSessionMicroGoals(rootId, sessionId);
            return res.data || [];
        },
        enabled: !!rootId && !!sessionId
    });

    // 2. Mutations
    const updateSessionMutation = useMutation({
        mutationFn: (updates) => fractalApi.updateSession(rootId, sessionId, updates),
        onMutate: () => setAutoSaveStatus('saving'),
        onSuccess: (res) => {
            queryClient.setQueryData(['session', rootId, sessionId], res.data);
            queryClient.invalidateQueries({ queryKey: ['sessions', rootId] });
            queryClient.invalidateQueries({ queryKey: ['sessions', rootId, 'all'] });
            setAutoSaveStatus('saved');
            setTimeout(() => setAutoSaveStatus(''), 2000);
        },
        onError: () => {
            setAutoSaveStatus('error');
            setTimeout(() => setAutoSaveStatus(''), 3000);
        }
    });

    const addActivityMutation = useMutation({
        mutationFn: (data) => fractalApi.addActivityToSession(rootId, sessionId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['session-activities', rootId, sessionId] });
            queryClient.invalidateQueries({ queryKey: ['session', rootId, sessionId] });
        },
        onError: (err) => {
            const status = err?.response?.status;
            const endpoint = err?.config?.url;
            console.error('[addActivityMutation] failed', {
                status,
                endpoint,
                message: err?.message,
                data: err?.response?.data
            });
        }
    });

    const removeActivityMutation = useMutation({
        mutationFn: (instanceId) => fractalApi.removeActivityFromSession(rootId, sessionId, instanceId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['session-activities', rootId, sessionId] });
            queryClient.invalidateQueries({ queryKey: ['session', rootId, sessionId] });
        }
    });

    const deleteSessionMutation = useMutation({
        mutationFn: () => fractalApi.deleteSession(rootId, sessionId),
        onMutate: async () => {
            setIsDeletingSession(true);
            await queryClient.cancelQueries({ queryKey: ['session', rootId, sessionId] });
            await queryClient.cancelQueries({ queryKey: ['session-activities', rootId, sessionId] });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sessions', rootId] });
            queryClient.invalidateQueries({ queryKey: ['sessions', rootId, 'all'] });
            queryClient.removeQueries({ queryKey: ['session', rootId, sessionId] });
            queryClient.removeQueries({ queryKey: ['session-activities', rootId, sessionId] });
            notify.success('Session deleted successfully');
        },
        onError: () => {
            setIsDeletingSession(false);
        }
    });

    const updateGoalMutation = useMutation({
        mutationFn: ({ goalId, updates }) => fractalApi.updateGoal(rootId, goalId, updates),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['goals', rootId] });
            queryClient.invalidateQueries({ queryKey: ['session', rootId, sessionId] });
        }
    });

    const updateInstanceMutation = useMutation({
        mutationFn: async ({ instanceId, updates }) => {
            const instance = activityInstances.find(inst => inst.id === instanceId);
            if (!instance) throw new Error('Instance not found');

            if (updates.metrics !== undefined) {
                const metricsPayload = updates.metrics.map(m => ({
                    metric_id: m.metric_id,
                    split_id: m.split_id || null,
                    value: m.value
                }));
                return fractalApi.updateActivityMetrics(rootId, sessionId, instanceId, { metrics: metricsPayload });
            }

            return fractalApi.updateActivityInstance(rootId, instanceId, {
                session_id: sessionId,
                activity_definition_id: instance.activity_definition_id,
                ...updates
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['session-activities', rootId, sessionId] });
        }
    });

    // 3. Derived Helpers
    const groupMap = useMemo(() => {
        if (!Array.isArray(activityGroups)) return { ungrouped: { id: 'ungrouped', name: 'Ungrouped' } };
        return activityGroups.reduce((acc, group) => {
            acc[group.id] = group;
            return acc;
        }, { ungrouped: { id: 'ungrouped', name: 'Ungrouped' } });
    }, [activityGroups]);

    const groupedActivities = useMemo(() => {
        if (!Array.isArray(activities)) return {};
        return activities.reduce((acc, activity) => {
            const groupId = activity.group_id || 'ungrouped';
            if (!acc[groupId]) acc[groupId] = [];
            acc[groupId].push(activity);
            return acc;
        }, {});
    }, [activities]);

    const parentGoals = useMemo(() => session?.short_term_goals || [], [session]);
    const immediateGoals = useMemo(() => session?.immediate_goals || [], [session]);

    const allGoalsForTargets = useMemo(() => {
        return [...parentGoals, ...immediateGoals];
    }, [parentGoals, immediateGoals]);

    const {
        targetAchievements,
        achievedTargetIds,
        goalAchievements,
    } = useTargetAchievements(activityInstances, allGoalsForTargets);

    // 4. Handlers
    const handleUpdateTimer = useCallback(async (instanceId, action) => {
        const instance = activityInstances.find(inst => inst.id === instanceId);
        if (!instance) return;

        try {
            let res;
            if (action === 'start') {
                res = await fractalApi.startActivityTimer(rootId, instanceId, {
                    session_id: sessionId,
                    activity_definition_id: instance.activity_definition_id
                });
            } else if (action === 'complete') {
                res = await fractalApi.completeActivityInstance(rootId, instanceId, {
                    session_id: sessionId,
                    activity_definition_id: instance.activity_definition_id
                });
            } else if (action === 'reset') {
                res = await fractalApi.updateActivityInstance(rootId, instanceId, {
                    session_id: sessionId,
                    activity_definition_id: instance.activity_definition_id,
                    time_start: null, time_stop: null, duration_seconds: null, completed: false
                });
            }

            if (res && res.data) {
                queryClient.setQueryData(['session-activities', rootId, sessionId], (prev) =>
                    prev.map(inst => inst.id === instanceId ? res.data : inst)
                );
                queryClient.invalidateQueries({ queryKey: ['session', rootId, sessionId] });
            }
        } catch (err) {
            console.error('Timer action failed', err);
            notify.error('Timer action failed: ' + (err.response?.data?.error || err.message));
        }
    }, [activityInstances, rootId, sessionId, queryClient]);

    const handleReorderActivity = useCallback((sectionIndex, exerciseIndex, direction) => {
        const updatedData = { ...localSessionData };
        const activityIds = [...(updatedData.sections[sectionIndex].activity_ids || [])];
        const newIndex = direction === 'up' ? exerciseIndex - 1 : exerciseIndex + 1;
        if (newIndex < 0 || newIndex >= activityIds.length) return;

        [activityIds[exerciseIndex], activityIds[newIndex]] = [activityIds[newIndex], activityIds[exerciseIndex]];

        updatedData.sections[sectionIndex].activity_ids = activityIds;
        setLocalSessionData(updatedData);
    }, [localSessionData]);

    const handleMoveActivity = useCallback((sourceSectionIndex, targetSectionIndex, instanceId) => {
        if (sourceSectionIndex === targetSectionIndex) return;

        const updatedData = { ...localSessionData };
        const sections = [...updatedData.sections];

        const sourceSection = { ...sections[sourceSectionIndex] };
        const sourceIds = [...(sourceSection.activity_ids || [])];
        const activityIndex = sourceIds.indexOf(instanceId);
        if (activityIndex === -1) return;

        sourceIds.splice(activityIndex, 1);
        sourceSection.activity_ids = sourceIds;

        const targetSection = { ...sections[targetSectionIndex] };
        const targetIds = [...(targetSection.activity_ids || [])];
        targetIds.push(instanceId);
        targetSection.activity_ids = targetIds;

        sections[sourceSectionIndex] = sourceSection;
        sections[targetSectionIndex] = targetSection;
        updatedData.sections = sections;

        setLocalSessionData(updatedData);
    }, [localSessionData]);

    const handleAddActivity = useCallback(async (sectionIndex, activityId, activityObject = null) => {
        const activityDef = activityObject || activities.find(a => a.id === activityId);
        if (!activityDef) return;

        try {
            const response = await addActivityMutation.mutateAsync({
                activity_definition_id: activityDef.id
            });
            const newInstance = response.data;

            // Keep local session UI in sync immediately.
            if (localSessionData?.sections?.[sectionIndex]) {
                const updatedData = { ...localSessionData };
                const section = { ...updatedData.sections[sectionIndex] };
                const activityIds = [...(section.activity_ids || [])];
                activityIds.push(newInstance.id);
                section.activity_ids = activityIds;
                updatedData.sections = [...updatedData.sections];
                updatedData.sections[sectionIndex] = section;
                setLocalSessionData(updatedData);
            }

            setShowActivitySelector(prev => ({ ...prev, [sectionIndex]: false }));
        } catch (err) {
            console.error('Error adding activity:', err);
            const serverError = err?.response?.data?.error;
            const status = err?.response?.status;
            const message = serverError || (status ? `HTTP ${status}` : err?.message || 'Unknown error');
            notify.error(`Failed to add activity: ${message}`);
        }
    }, [activities, addActivityMutation, localSessionData]);

    const handleToggleSessionComplete = useCallback(async () => {
        if (!session) return;
        const newCompleted = !session.attributes.completed;
        const updatePayload = { completed: newCompleted };

        try {
            if (newCompleted) {
                updatePayload.session_end = new Date().toISOString();
                for (const instance of activityInstances) {
                    if (instance.time_start && !instance.time_stop) {
                        await handleUpdateTimer(instance.id, 'complete');
                    }
                }
            }

            await updateSessionMutation.mutateAsync(updatePayload);
            notify.success(newCompleted ? 'Session completed!' : 'Session marked as incomplete');
        } catch (err) {
            console.error('Failed to toggle session completion', err);
            notify.error(`Failed to update session completion: ${err?.response?.data?.error || err?.message || 'Unknown error'}`);
        }
    }, [session, activityInstances, handleUpdateTimer, updateSessionMutation]);

    const calculateTotalDuration = useCallback(() => {
        return activityInstances.reduce((sum, inst) => sum + (inst.duration_seconds || 0), 0);
    }, [activityInstances]);

    const createGoal = useCallback(async (goalData) => {
        try {
            const res = await fractalApi.createGoal(rootId, goalData);
            queryClient.invalidateQueries({ queryKey: ['fractalTree', rootId] });
            queryClient.invalidateQueries({ queryKey: ['session-micro-goals', rootId, sessionId] });
            queryClient.invalidateQueries({ queryKey: ['session', rootId, sessionId] });
            return res.data;
        } catch (err) {
            console.error("Failed to create goal", err);
            throw err;
        }
    }, [rootId, sessionId, queryClient]);

    const toggleGoalCompletion = useCallback(async (goalId, completed) => {
        try {
            const res = await fractalApi.toggleGoalCompletion(rootId, goalId, completed);
            queryClient.invalidateQueries({ queryKey: ['fractalTree', rootId] });
            return res.data;
        } catch (err) {
            console.error("Failed to toggle goal completion", err);
            throw err;
        }
    }, [rootId, queryClient]);

    const autoSaveQueue = useMemo(() => createAutoSaveQueue({
        save: (nextData) => updateSessionMutation.mutateAsync({ session_data: nextData }),
        onError: () => {
            setAutoSaveStatus('error');
            setTimeout(() => setAutoSaveStatus(''), 3000);
        }
    }), [updateSessionMutation.mutateAsync]);

    // 5. Effects
    useEffect(() => {
        if (!rootId) return;
        setActiveRootId(rootId);
        return () => setActiveRootId(null);
    }, [rootId, setActiveRootId]);

    useEffect(() => {
        const sessionKey = `${rootId || ''}:${sessionId || ''}`;
        if (previousSessionKeyRef.current !== sessionKey) {
            previousSessionKeyRef.current = sessionKey;
            initializedRef.current = false;
            setLocalSessionData(null);
            autoSaveQueue.reset();
            setAutoSaveStatus('');
            setShowActivitySelector({});
            setDraggedItem(null);
            setNotifiedTargetIds(new Set());
            setSidePaneMode('details');
        }
    }, [rootId, sessionId]);

    useEffect(() => {
        if (!session) return;
        if (initializedRef.current && localSessionData) return;
        const baseData = session.attributes?.session_data || { sections: [] };

        const extractDefinitionId = (item) => {
            if (typeof item === 'string') return item;
            if (!item || typeof item !== 'object') return null;
            const direct = item.activity_id || item.activity_definition_id || item.activityId || item.activityDefinitionId || item.definition_id || item.id;
            if (direct) return direct;
            if (item.activity && typeof item.activity === 'object') {
                return item.activity.id || item.activity.activity_id || item.activity.activity_definition_id || null;
            }
            return null;
        };

        const normalizeSectionActivityIds = (data, instances) => {
            if (!data || typeof data !== 'object') return data;
            const sections = Array.isArray(data.sections) ? data.sections : [];
            if (sections.length === 0) return data;

            const idsByDef = (instances || []).reduce((acc, inst) => {
                const defId = inst?.activity_definition_id;
                if (!defId || !inst?.id) return acc;
                if (!acc[defId]) acc[defId] = [];
                acc[defId].push(inst.id);
                return acc;
            }, {});

            const allInstanceIds = (instances || []).map(inst => inst.id).filter(Boolean);
            const used = new Set();

            const normalizedSections = sections.map((section) => {
                if (!section || typeof section !== 'object') return section;

                const existing = Array.isArray(section.activity_ids)
                    ? section.activity_ids.filter((id) => allInstanceIds.includes(id) && !used.has(id))
                    : [];

                let activityIds = [...existing];

                if (activityIds.length === 0) {
                    const rawItems = section.exercises || section.activities || [];

                    // Prefer explicit instance IDs from legacy exercise payloads.
                    for (const item of rawItems) {
                        if (!item || typeof item !== 'object') continue;
                        const iid = item.instance_id;
                        if (iid && allInstanceIds.includes(iid) && !used.has(iid) && !activityIds.includes(iid)) {
                            activityIds.push(iid);
                        }
                    }

                    // Then map definition IDs to first unused instance.
                    if (activityIds.length === 0) {
                        for (const item of rawItems) {
                            const defId = extractDefinitionId(item);
                            if (!defId) continue;
                            const candidates = idsByDef[defId] || [];
                            const candidate = candidates.find((id) => !used.has(id) && !activityIds.includes(id));
                            if (candidate) activityIds.push(candidate);
                        }
                    }
                }

                activityIds.forEach((id) => used.add(id));
                return {
                    ...section,
                    activity_ids: activityIds
                };
            });

            // Last resort: single section gets all remaining instances.
            if (normalizedSections.length === 1 && (!normalizedSections[0].activity_ids || normalizedSections[0].activity_ids.length === 0)) {
                normalizedSections[0] = {
                    ...normalizedSections[0],
                    activity_ids: allInstanceIds
                };
            }

            return {
                ...data,
                sections: normalizedSections
            };
        };

        const normalizedData = normalizeSectionActivityIds(baseData, activityInstances);
        setLocalSessionData(normalizedData);
        autoSaveQueue.seed(normalizedData);
        initializedRef.current = true;
        setJustInitialized(true);
        setTimeout(() => setJustInitialized(false), 500); // Guard window
    }, [session, sessionId, localSessionData, activityInstances, autoSaveQueue]);

    useEffect(() => {
        if (!localSessionData || !initializedRef.current || justInitialized) return;
        const timeoutId = setTimeout(() => {
            autoSaveQueue.enqueue(localSessionData);
        }, 800);
        return () => clearTimeout(timeoutId);
    }, [localSessionData, justInitialized, autoSaveQueue]);

    // Notification Effects
    const prevAchievedTargetIdsRef = useRef(new Set());
    useEffect(() => {
        if (!achievedTargetIds || !targetAchievements) return;
        const prevAchieved = prevAchievedTargetIdsRef.current;
        const newlyAchieved = [];
        for (const targetId of achievedTargetIds) {
            if (!notifiedTargetIds.has(targetId)) {
                const status = targetAchievements.get(targetId);
                if (status && !status.wasAlreadyCompleted) newlyAchieved.push(status);
            }
        }
        if (newlyAchieved.length > 0) {
            const names = newlyAchieved.map(s => s.target.name || 'Target').join(', ');
            notify.success(`🎯 Target achieved: ${names}`, { duration: 5000 });
            setNotifiedTargetIds(prev => {
                const newSet = new Set(prev);
                newlyAchieved.forEach(s => newSet.add(s.target.id));
                return newSet;
            });
        }
        const newlyReverted = [];
        for (const targetId of prevAchieved) {
            if (!achievedTargetIds.has(targetId)) {
                const status = targetAchievements.get(targetId);
                if (status) newlyReverted.push(status);
            }
        }
        if (newlyReverted.length > 0) {
            const names = newlyReverted.map(s => s.target.name || 'Target').join(', ');
            notify.error(`🔙 Target reverted: ${names}`, { duration: 5000 });
            setNotifiedTargetIds(prev => {
                const newSet = new Set(prev);
                newlyReverted.forEach(s => newSet.delete(s.target.id));
                return newSet;
            });
        }
        prevAchievedTargetIdsRef.current = new Set(achievedTargetIds);
    }, [achievedTargetIds, targetAchievements, notifiedTargetIds]);

    const prevCompletedIdsRef = useRef(new Set());
    useEffect(() => {
        if (!goalAchievements) return;
        const currentCompleteds = new Set();
        goalAchievements.forEach((status, goalId) => {
            if (status.allAchieved) currentCompleteds.add(goalId);
        });
        const prevCompleted = prevCompletedIdsRef.current;
        const newlyCompleted = [];
        for (const goalId of currentCompleteds) {
            if (!prevCompleted.has(goalId)) {
                const status = goalAchievements.get(goalId);
                if (status && !status.wasAlreadyCompleted) newlyCompleted.push(status);
            }
        }
        if (newlyCompleted.length > 0) {
            const names = newlyCompleted.map(s => s.goalName).join(', ');
            notify.success(`🏆 Goal completed: ${names}`, { duration: 6000 });
        }
        const newlyUncompleted = [];
        for (const goalId of prevCompleted) {
            if (!currentCompleteds.has(goalId)) {
                const status = goalAchievements.get(goalId);
                newlyUncompleted.push(status);
            }
        }
        if (newlyUncompleted.length > 0) {
            const names = newlyUncompleted.map(s => s.goalName).join(', ');
            notify.error(`⚠️ Goal uncompleted: ${names}`, { duration: 6000 });
        }
        prevCompletedIdsRef.current = currentCompleteds;
    }, [goalAchievements]);

    const value = useMemo(() => ({
        rootId,
        sessionId,
        session,
        activityInstances,
        activities,
        activityGroups,
        parentGoals,
        immediateGoals,
        microGoals,
        loading: sessionLoading || instancesLoading || activitiesLoading || (session && !localSessionData),
        sessionError,
        autoSaveStatus,
        sidePaneMode,
        setSidePaneMode,
        showActivitySelector,
        setShowActivitySelector,
        localSessionData,
        setLocalSessionData,
        draggedItem,
        setDraggedItem,
        groupMap,
        groupedActivities,
        targetAchievements,
        achievedTargetIds,
        goalAchievements,
        refreshSession,
        refreshInstances,
        // Handlers
        updateSession: updateSessionMutation.mutateAsync,
        addActivity: handleAddActivity,
        removeActivity: removeActivityMutation.mutate,
        updateInstance: updateInstanceMutation.mutate,
        updateTimer: handleUpdateTimer,
        createGoal,
        updateGoal: updateGoalMutation.mutate,
        toggleGoalCompletion,
        reorderActivity: handleReorderActivity,
        moveActivity: handleMoveActivity,
        deleteSession: deleteSessionMutation.mutateAsync,
        toggleSessionComplete: handleToggleSessionComplete,
        calculateTotalDuration,
    }), [
        rootId,
        sessionId,
        session,
        activityInstances,
        activities,
        activityGroups,
        parentGoals,
        immediateGoals,
        microGoals,
        sessionLoading,
        instancesLoading,
        activitiesLoading,
        localSessionData,
        sessionError,
        autoSaveStatus,
        sidePaneMode,
        showActivitySelector,
        draggedItem,
        groupMap,
        groupedActivities,
        targetAchievements,
        achievedTargetIds,
        goalAchievements,
        refreshSession,
        refreshInstances,
        updateSessionMutation.mutateAsync,
        handleAddActivity,
        removeActivityMutation.mutate,
        updateInstanceMutation.mutate,
        handleUpdateTimer,
        createGoal,
        updateGoalMutation.mutate,
        toggleGoalCompletion,
        handleReorderActivity,
        handleMoveActivity,
        deleteSessionMutation.mutateAsync,
        handleToggleSessionComplete,
        calculateTotalDuration
    ]);

    return (
        <ActiveSessionContext.Provider value={value}>
            {children}
        </ActiveSessionContext.Provider>
    );
}

export function useActiveSession() {
    const context = useContext(ActiveSessionContext);
    if (!context) {
        throw new Error('useActiveSession must be used within an ActiveSessionProvider');
    }
    return context;
}
