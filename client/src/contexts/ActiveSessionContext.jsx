import React, { createContext, useContext, useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { useTargetAchievements } from '../hooks/useTargetAchievements';
import { createAutoSaveQueue } from '../utils/autoSaveQueue';
import { parseTargets } from '../utils/goalUtils';
import { queryKeys } from '../hooks/queryKeys';
import { fractalApi } from '../utils/api';
import notify from '../utils/notify';
import { useGoals } from './GoalsContext';

const SessionDataContext = createContext(null);
const SessionUiContext = createContext(null);
const SessionActionsContext = createContext(null);

const ActiveSessionContext = createContext(null);

function formatGoalTypeLabel(type) {
    if (!type) return 'Goal';
    return type.replace(/Goal$/, ' Goal').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
}

function extractDefinitionId(item) {
    if (typeof item === 'string') return item;
    if (!item || typeof item !== 'object') return null;
    const direct = item.activity_id || item.activity_definition_id || item.activityId || item.activityDefinitionId || item.definition_id || item.id;
    if (direct) return direct;
    if (item.activity && typeof item.activity === 'object') {
        return item.activity.id || item.activity.activity_id || item.activity.activity_definition_id || null;
    }
    return null;
}

function normalizeSectionActivityIds(data, instances) {
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

    const allInstanceIds = (instances || []).map((inst) => inst.id).filter(Boolean);
    const used = new Set();

    const normalizedSections = sections.map((section) => {
        if (!section || typeof section !== 'object') return section;

        const existing = Array.isArray(section.activity_ids)
            ? section.activity_ids.filter((id) => allInstanceIds.includes(id) && !used.has(id))
            : [];

        let activityIds = [...existing];

        if (activityIds.length === 0) {
            const rawItems = section.exercises || section.activities || [];

            for (const item of rawItems) {
                if (!item || typeof item !== 'object') continue;
                const instanceId = item.instance_id;
                if (instanceId && allInstanceIds.includes(instanceId) && !used.has(instanceId) && !activityIds.includes(instanceId)) {
                    activityIds.push(instanceId);
                }
            }

            if (activityIds.length === 0) {
                for (const item of rawItems) {
                    const definitionId = extractDefinitionId(item);
                    if (!definitionId) continue;
                    const candidates = idsByDef[definitionId] || [];
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
}

export function ActiveSessionProvider({ rootId, sessionId, children }) {
    const queryClient = useQueryClient();
    const { setActiveRootId } = useGoals();
    const sessionKey = queryKeys.session(rootId, sessionId);
    const sessionActivitiesKey = queryKeys.sessionActivities(rootId, sessionId);
    const sessionGoalsViewKey = queryKeys.sessionGoalsView(rootId, sessionId);
    const sessionNotesKey = queryKeys.sessionNotes(rootId, sessionId);
    const sessionsKey = queryKeys.sessions(rootId);
    const sessionsAllKey = queryKeys.sessionsAll(rootId);
    const fractalTreeKey = queryKeys.fractalTree(rootId);
    const activitiesKey = queryKeys.activities(rootId);
    const activityGroupsKey = queryKeys.activityGroups(rootId);

    // UI state
    const [showActivitySelector, setShowActivitySelector] = useState({});
    const [autoSaveStatus, setAutoSaveStatus] = useState('');
    const [sidePaneMode, setSidePaneMode] = useState('details');
    const [sessionDataDraft, setSessionDataDraft] = useState(null);
    const [draggedItem, setDraggedItem] = useState(null);
    const [isDeletingSession, setIsDeletingSession] = useState(false);
    const initializedRef = useRef(false);
    const [justInitialized, setJustInitialized] = useState(false);
    const previousSessionKeyRef = useRef(null);
    const statusTimeoutRef = useRef(null);
    const initTimeoutRef = useRef(null);
    const instanceQueuesRef = useRef(new Map());
    const autoSyncedGoalStatesRef = useRef(new Map());
    const targetNotificationsInitializedRef = useRef(false);
    const goalNotificationsInitializedRef = useRef(false);

    const scheduleStatusClear = useCallback((delayMs) => {
        if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
        statusTimeoutRef.current = setTimeout(() => {
            setAutoSaveStatus('');
            statusTimeoutRef.current = null;
        }, delayMs);
    }, []);

    // 1. Queries
    const { data: session, isLoading: sessionLoading, isError: sessionError, refetch: refreshSession } = useQuery({
        queryKey: sessionKey,
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
        queryKey: sessionActivitiesKey,
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
        queryKey: activitiesKey,
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
        queryKey: activityGroupsKey,
        queryFn: async () => {
            const res = await fractalApi.getActivityGroups(rootId);
            return res.data;
        },
        enabled: !!rootId
    });

    const { data: sessionGoalsView = null, isLoading: sessionGoalsViewLoading } = useQuery({
        queryKey: sessionGoalsViewKey,
        queryFn: async () => {
            const res = await fractalApi.getSessionGoalsView(rootId, sessionId);
            return res.data || null;
        },
        enabled: !!rootId && !!sessionId
    });

    const microGoals = useMemo(() => sessionGoalsView?.micro_goals || [], [sessionGoalsView]);
    const normalizedSessionData = useMemo(() => {
        if (!session) return null;
        const baseData = session.attributes?.session_data || { sections: [] };
        return normalizeSectionActivityIds(baseData, activityInstances);
    }, [session, activityInstances]);
    const localSessionData = sessionDataDraft ?? normalizedSessionData;
    const updateSessionDataDraft = useCallback((updater) => {
        setSessionDataDraft((prev) => {
            const base = prev ?? normalizedSessionData;
            if (!base) return prev;
            return typeof updater === 'function' ? updater(base) : updater;
        });
    }, [normalizedSessionData]);

    // 2. Mutations
    const updateSessionMutation = useMutation({
        mutationFn: (updates) => fractalApi.updateSession(rootId, sessionId, updates),
        onMutate: () => setAutoSaveStatus('saving'),
        onSuccess: (res) => {
            queryClient.setQueryData(sessionKey, res.data);
            queryClient.invalidateQueries({ queryKey: sessionsKey });
            queryClient.invalidateQueries({ queryKey: sessionsAllKey });
            setAutoSaveStatus('saved');
            scheduleStatusClear(2000);
        },
        onError: () => {
            setAutoSaveStatus('error');
            scheduleStatusClear(3000);
        }
    });

    const addActivityMutation = useMutation({
        mutationFn: (data) => fractalApi.addActivityToSession(rootId, sessionId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: sessionActivitiesKey });
            queryClient.invalidateQueries({ queryKey: sessionKey });
            queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey });
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
            queryClient.invalidateQueries({ queryKey: sessionActivitiesKey });
            queryClient.invalidateQueries({ queryKey: sessionKey });
            queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey });
        }
    });

    const deleteSessionMutation = useMutation({
        mutationFn: () => fractalApi.deleteSession(rootId, sessionId),
        onMutate: async () => {
            setIsDeletingSession(true);
            await queryClient.cancelQueries({ queryKey: sessionKey });
            await queryClient.cancelQueries({ queryKey: sessionActivitiesKey });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: sessionsKey });
            queryClient.invalidateQueries({ queryKey: sessionsAllKey });
            queryClient.removeQueries({ queryKey: sessionKey });
            queryClient.removeQueries({ queryKey: sessionActivitiesKey });
            notify.success('Session deleted successfully');
        },
        onError: () => {
            setIsDeletingSession(false);
        }
    });

    const pauseSessionMutation = useMutation({
        mutationFn: () => fractalApi.pauseSession(rootId, sessionId),
        onSuccess: (res) => {
            queryClient.setQueryData(sessionKey, res.data);
            queryClient.invalidateQueries({ queryKey: sessionActivitiesKey });
            notify.success('Session paused');
        },
        onError: (err) => {
            notify.error(`Failed to pause: ${err?.response?.data?.error || err.message}`);
        }
    });

    const resumeSessionMutation = useMutation({
        mutationFn: () => fractalApi.resumeSession(rootId, sessionId),
        onSuccess: (res) => {
            queryClient.setQueryData(sessionKey, res.data);
            queryClient.invalidateQueries({ queryKey: sessionActivitiesKey });
            notify.success('Session resumed');
        },
        onError: (err) => {
            notify.error(`Failed to resume: ${err?.response?.data?.error || err.message}`);
        }
    });

    const updateGoalMutation = useMutation({
        mutationFn: ({ goalId, updates }) => fractalApi.updateGoal(rootId, goalId, updates),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.goals(rootId) });
            queryClient.invalidateQueries({ queryKey: sessionKey });
            queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey });
            queryClient.invalidateQueries({ queryKey: fractalTreeKey });
        }
    });

    const toggleGoalCompletionMutation = useMutation({
        mutationFn: ({ goalId, completed }) => fractalApi.toggleGoalCompletion(rootId, goalId, completed),
        onSuccess: (res, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.goals(rootId) });
            queryClient.invalidateQueries({ queryKey: sessionKey });
            queryClient.invalidateQueries({ queryKey: sessionNotesKey });
            queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey });
            queryClient.invalidateQueries({ queryKey: fractalTreeKey });

            // Toast for manual completion
            const goalResponse = res?.data;
            if (goalResponse) {
                const goalType = formatGoalTypeLabel(goalResponse.attributes?.type || goalResponse.type);
                const action = variables.completed ? 'Completed' : 'Uncompleted';
                notify.success(`${goalType} ${action}: ${goalResponse.name}`, { duration: 5000 });
            }
        }
    });

    const applyInstanceOptimisticUpdate = useCallback((instanceId, updates) => {
        queryClient.setQueryData(sessionActivitiesKey, (prev = []) => {
            if (!Array.isArray(prev)) return prev;
            return prev.map((inst) => {
                if (inst.id !== instanceId) return inst;
                return {
                    ...inst,
                    ...updates
                };
            });
        });
    }, [queryClient, sessionActivitiesKey]);

    const updateInstanceMutation = useMutation({
        mutationFn: async ({ instanceId, updates }) => {
            const cachedInstances = queryClient.getQueryData(sessionActivitiesKey);
            const instanceSource = Array.isArray(cachedInstances) ? cachedInstances : activityInstances;
            const instance = instanceSource.find(inst => inst.id === instanceId);
            if (!instance) throw new Error('Instance not found');

            if (updates.metrics !== undefined) {
                const metricsPayload = (Array.isArray(updates.metrics) ? updates.metrics : [])
                    .map((m) => {
                        const metricId = m?.metric_id || m?.metric_definition_id || null;
                        if (!metricId) return null;
                        const rawValue = m?.value;
                        let value = rawValue;
                        if (rawValue === '' || rawValue === undefined) {
                            value = null;
                        } else if (typeof rawValue === 'string') {
                            const trimmed = rawValue.trim();
                            if (trimmed === '') {
                                value = null;
                            } else if (!Number.isNaN(Number(trimmed))) {
                                value = Number(trimmed);
                            } else {
                                value = rawValue;
                            }
                        }
                        return {
                            metric_id: metricId,
                            split_id: m?.split_id || m?.split_definition_id || null,
                            value
                        };
                    })
                    .filter(Boolean);
                try {
                    return await fractalApi.updateActivityMetrics(rootId, sessionId, instanceId, { metrics: metricsPayload });
                } catch (error) {
                    // Some environments reject CORS preflight on the dedicated metrics endpoint.
                    // Fall back to the broader instance update endpoint so metric edits still persist.
                    const isNetworkLikeFailure = !error?.response || /network error/i.test(error?.message || '');
                    if (!isNetworkLikeFailure) throw error;
                    return fractalApi.updateActivityInstance(rootId, instanceId, {
                        session_id: sessionId,
                        activity_definition_id: instance.activity_definition_id,
                        metrics: metricsPayload
                    });
                }
            }

            return fractalApi.updateActivityInstance(rootId, instanceId, {
                session_id: sessionId,
                activity_definition_id: instance.activity_definition_id,
                ...updates
            });
        },
        onSuccess: (res, { instanceId }) => {
            if (res?.data) {
                queryClient.setQueryData(sessionActivitiesKey, (prev = []) =>
                    prev.map(inst => inst.id === instanceId ? res.data : inst)
                );
            } else {
                queryClient.invalidateQueries({ queryKey: sessionActivitiesKey });
            }
        }
    });

    const getInstanceQueue = useCallback((instanceId) => {
        if (!instanceId) return null;
        const existing = instanceQueuesRef.current.get(instanceId);
        if (existing) return existing;

        const queue = createAutoSaveQueue({
            save: async (updates) => {
                await updateInstanceMutation.mutateAsync({ instanceId, updates });
            },
            onError: (error) => {
                console.error('[updateInstance] failed', {
                    instanceId,
                    message: error?.message,
                    status: error?.response?.status,
                    data: error?.response?.data
                });
                notify.error('Failed to save activity changes');
            }
        });
        instanceQueuesRef.current.set(instanceId, queue);
        return queue;
    }, [updateInstanceMutation]);

    const enqueueInstanceUpdate = useCallback((instanceId, updates) => {
        applyInstanceOptimisticUpdate(instanceId, updates);
        const queue = getInstanceQueue(instanceId);
        if (!queue) return Promise.resolve();
        return queue.enqueue(updates);
    }, [applyInstanceOptimisticUpdate, getInstanceQueue]);

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
        // Include micro goals so target completion state is reflected in session sidepane target cards.
        return [...parentGoals, ...immediateGoals, ...microGoals];
    }, [parentGoals, immediateGoals, microGoals]);

    const {
        targetAchievements,
        achievedTargetIds,
        goalAchievements,
    } = useTargetAchievements(activityInstances, allGoalsForTargets, sessionId);

    useEffect(() => {
        if (!rootId || !sessionId || !goalAchievements) return;

        const targetDrivenGoals = allGoalsForTargets.filter((goal) => parseTargets(goal).length > 0);
        targetDrivenGoals.forEach((goal) => {
            const goalId = goal?.id;
            const achievement = goalAchievements.get(goalId);
            if (!goalId || !achievement) return;

            const desiredCompleted = achievement.allAchieved;
            const persistedCompleted = Boolean(goal.completed || goal.attributes?.completed);
            const inflightDesired = autoSyncedGoalStatesRef.current.get(goalId);

            if (persistedCompleted === desiredCompleted || inflightDesired === desiredCompleted) {
                return;
            }

            autoSyncedGoalStatesRef.current.set(goalId, desiredCompleted);

            fractalApi.toggleGoalCompletion(rootId, goalId, desiredCompleted)
                .then(() => {
                    queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey });
                    queryClient.invalidateQueries({ queryKey: sessionKey });
                    queryClient.invalidateQueries({ queryKey: fractalTreeKey });
                })
                .catch((error) => {
                    console.error('[autoSyncGoalCompletion] failed', {
                        goalId,
                        desiredCompleted,
                        message: error?.message,
                        status: error?.response?.status,
                        data: error?.response?.data
                    });
                    queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey });
                    queryClient.invalidateQueries({ queryKey: sessionKey });
                    queryClient.invalidateQueries({ queryKey: fractalTreeKey });
                })
                .finally(() => {
                    if (autoSyncedGoalStatesRef.current.get(goalId) === desiredCompleted) {
                        autoSyncedGoalStatesRef.current.delete(goalId);
                    }
                });
        });
    }, [allGoalsForTargets, fractalTreeKey, goalAchievements, queryClient, rootId, sessionGoalsViewKey, sessionId, sessionKey]);

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
                queryClient.setQueryData(sessionActivitiesKey, (prev) =>
                    prev.map(inst => inst.id === instanceId ? res.data : inst)
                );
                queryClient.invalidateQueries({ queryKey: sessionKey });
            }
        } catch (err) {
            console.error('Timer action failed', err);
            notify.error('Timer action failed: ' + (err.response?.data?.error || err.message));
        }
    }, [activityInstances, queryClient, rootId, sessionActivitiesKey, sessionId, sessionKey]);

    const handleReorderActivity = useCallback((sectionIndex, exerciseIndex, direction) => {
        updateSessionDataDraft((currentData) => {
            const updatedData = { ...currentData };
            const sections = [...(updatedData.sections || [])];
            const section = sections[sectionIndex];
            if (!section) return currentData;

            const activityIds = [...(section.activity_ids || [])];
            const newIndex = direction === 'up' ? exerciseIndex - 1 : exerciseIndex + 1;
            if (newIndex < 0 || newIndex >= activityIds.length) return currentData;

            [activityIds[exerciseIndex], activityIds[newIndex]] = [activityIds[newIndex], activityIds[exerciseIndex]];
            sections[sectionIndex] = {
                ...section,
                activity_ids: activityIds,
            };
            updatedData.sections = sections;
            return updatedData;
        });
    }, [updateSessionDataDraft]);

    const handleMoveActivity = useCallback((sourceSectionIndex, targetSectionIndex, instanceId) => {
        if (sourceSectionIndex === targetSectionIndex) return;

        updateSessionDataDraft((currentData) => {
            const updatedData = { ...currentData };
            const sections = [...(updatedData.sections || [])];

            const sourceSection = sections[sourceSectionIndex];
            const targetSection = sections[targetSectionIndex];
            if (!sourceSection || !targetSection) return currentData;

            const nextSource = { ...sourceSection };
            const sourceIds = [...(nextSource.activity_ids || [])];
            const activityIndex = sourceIds.indexOf(instanceId);
            if (activityIndex === -1) return currentData;

            sourceIds.splice(activityIndex, 1);
            nextSource.activity_ids = sourceIds;

            const nextTarget = { ...targetSection };
            const targetIds = [...(nextTarget.activity_ids || [])];
            targetIds.push(instanceId);
            nextTarget.activity_ids = targetIds;

            sections[sourceSectionIndex] = nextSource;
            sections[targetSectionIndex] = nextTarget;
            updatedData.sections = sections;
            return updatedData;
        });
    }, [updateSessionDataDraft]);

    const handleAddActivity = useCallback(async (sectionIndex, activityId, activityObject = null) => {
        const activityDef = activityObject || activities.find(a => a.id === activityId);
        if (!activityDef) return;

        try {
            const response = await addActivityMutation.mutateAsync({
                activity_definition_id: activityDef.id
            });
            const newInstance = response.data;

            // Keep local session UI in sync immediately.
            updateSessionDataDraft((currentData) => {
                if (!currentData?.sections?.[sectionIndex]) return currentData;
                const updatedData = { ...currentData };
                const sections = [...updatedData.sections];
                const section = { ...sections[sectionIndex] };
                const activityIds = [...(section.activity_ids || [])];
                activityIds.push(newInstance.id);
                section.activity_ids = activityIds;
                sections[sectionIndex] = section;
                updatedData.sections = sections;
                return updatedData;
            });

            setShowActivitySelector(prev => ({ ...prev, [sectionIndex]: false }));
        } catch (err) {
            console.error('Error adding activity:', err);
            const serverError = err?.response?.data?.error;
            const status = err?.response?.status;
            const message = serverError || (status ? `HTTP ${status}` : err?.message || 'Unknown error');
            notify.error(`Failed to add activity: ${message}`);
        }
    }, [activities, addActivityMutation, updateSessionDataDraft]);

    const handleToggleSessionComplete = useCallback(async () => {
        if (!session) return;
        const newCompleted = !session.attributes.completed;
        const updatePayload = { completed: newCompleted };

        try {
            if (newCompleted) {
                // Carry forward logic for uncompleted instance-bound Micro Goals
                const uncompletedInstanceMicroGoals = microGoals.filter(mg =>
                    !mg.completed &&
                    mg.attributes?.targets?.some(t => t.activity_instance_id)
                );

                if (uncompletedInstanceMicroGoals.length > 0) {
                    const carryForward = window.confirm(
                        "You have uncompleted Micro Goals bound to this session's activities. " +
                        "Would you like to carry them forward to the next time you do these activities?"
                    );

                    if (carryForward) {
                        for (const mg of uncompletedInstanceMicroGoals) {
                            const updatedTargets = (mg.attributes?.targets || []).map(t => ({
                                ...t,
                                activity_instance_id: null,
                                session_id: null
                            }));

                            await fractalApi.updateGoal(rootId, mg.id, {
                                session_id: null,
                                targets: updatedTargets
                            });
                        }
                    }
                }

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
    }, [session, activityInstances, handleUpdateTimer, updateSessionMutation, microGoals, rootId]);

    const calculateTotalDuration = useCallback(() => {
        return activityInstances.reduce((sum, inst) => sum + (inst.duration_seconds || 0), 0);
    }, [activityInstances]);

    const createGoal = useCallback(async (goalData) => {
        try {
            const res = await fractalApi.createGoal(rootId, goalData);
            queryClient.invalidateQueries({ queryKey: fractalTreeKey });
            queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey });
            queryClient.invalidateQueries({ queryKey: sessionKey });
            queryClient.invalidateQueries({ queryKey: sessionActivitiesKey });

            return res.data;
        } catch (err) {
            console.error("Failed to create goal", err);
            throw err;
        }
    }, [fractalTreeKey, rootId, sessionActivitiesKey, sessionGoalsViewKey, sessionKey, queryClient]);

    // The queue is intentionally memoized once per mutation callback identity so it can retain
    // its dedupe state across renders without re-enqueuing unchanged session payloads.
    /* eslint-disable react-hooks/refs, react-hooks/exhaustive-deps */
    const autoSaveQueue = useMemo(() => createAutoSaveQueue({
        save: (nextData) => updateSessionMutation.mutateAsync({ session_data: nextData }),
        onError: () => {
            setAutoSaveStatus('error');
            scheduleStatusClear(3000);
        },
    }), [scheduleStatusClear, updateSessionMutation.mutateAsync]);
    /* eslint-enable react-hooks/refs, react-hooks/exhaustive-deps */

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
            setSessionDataDraft(null);
            autoSaveQueue.reset();
            instanceQueuesRef.current.forEach((queue) => queue.reset());
            instanceQueuesRef.current.clear();
            setAutoSaveStatus('');
            setShowActivitySelector({});
            setDraggedItem(null);
            setSidePaneMode('details');
            targetNotificationsInitializedRef.current = false;
            goalNotificationsInitializedRef.current = false;
        }
    }, [rootId, sessionId, autoSaveQueue]);

    useEffect(() => {
        if (!normalizedSessionData || initializedRef.current) return;
        autoSaveQueue.seed(normalizedSessionData);
        initializedRef.current = true;
        setJustInitialized(true);
        if (initTimeoutRef.current) clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = setTimeout(() => {
            setJustInitialized(false);
            initTimeoutRef.current = null;
        }, 500); // Guard window
    }, [normalizedSessionData, autoSaveQueue]);

    useEffect(() => {
        if (!sessionDataDraft || !initializedRef.current || justInitialized) return;
        const timeoutId = setTimeout(() => {
            autoSaveQueue.enqueue(sessionDataDraft);
        }, 800);
        return () => clearTimeout(timeoutId);
    }, [sessionDataDraft, justInitialized, autoSaveQueue]);

    useEffect(() => {
        if (!sessionDataDraft || !normalizedSessionData) return;
        if (JSON.stringify(sessionDataDraft) === JSON.stringify(normalizedSessionData)) {
            setSessionDataDraft(null);
        }
    }, [sessionDataDraft, normalizedSessionData]);

    // Notification Effects
    const prevAchievedTargetIdsRef = useRef(new Set());
    useEffect(() => {
        if (!achievedTargetIds || !targetAchievements) return;
        if (sessionLoading || instancesLoading || sessionGoalsViewLoading) return;
        if (!targetNotificationsInitializedRef.current) {
            prevAchievedTargetIdsRef.current = new Set(achievedTargetIds);
            targetNotificationsInitializedRef.current = true;
            return;
        }
        const prevAchieved = prevAchievedTargetIdsRef.current;
        const newlyAchieved = [];
        for (const targetId of achievedTargetIds) {
            if (!prevAchieved.has(targetId)) {
                const status = targetAchievements.get(targetId);
                if (status && !status.wasAlreadyCompleted) newlyAchieved.push(status);
            }
        }
        if (newlyAchieved.length > 0) {
            const names = newlyAchieved.map(s => s.target.name || 'Target').join(', ');
            notify.success(`Target achieved: ${names}`, { duration: 5000 });
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
            notify.success(`Target reverted: ${names}`, { duration: 5000 });
        }
        prevAchievedTargetIdsRef.current = new Set(achievedTargetIds);
    }, [achievedTargetIds, targetAchievements, sessionLoading, instancesLoading, sessionGoalsViewLoading]);

    const prevCompletedIdsRef = useRef(new Set());
    useEffect(() => {
        if (!goalAchievements) return;
        if (sessionLoading || instancesLoading || sessionGoalsViewLoading) return;
        const currentCompleteds = new Set();
        goalAchievements.forEach((status, goalId) => {
            if (status.allAchieved) currentCompleteds.add(goalId);
        });
        if (!goalNotificationsInitializedRef.current) {
            prevCompletedIdsRef.current = currentCompleteds;
            goalNotificationsInitializedRef.current = true;
            return;
        }
        const prevCompleted = prevCompletedIdsRef.current;
        const newlyCompleted = [];
        for (const goalId of currentCompleteds) {
            if (!prevCompleted.has(goalId)) {
                const status = goalAchievements.get(goalId);
                if (status && !status.wasAlreadyCompleted) newlyCompleted.push(status);
            }
        }
        if (newlyCompleted.length > 0) {
            const messages = newlyCompleted.map((status) => `${status.goalType || 'Goal'} Completed: ${status.goalName}`);
            notify.success(messages.join(', '), { duration: 6000 });
        }
        const newlyUncompleted = [];
        for (const goalId of prevCompleted) {
            if (!currentCompleteds.has(goalId)) {
                const status = goalAchievements.get(goalId);
                if (status) newlyUncompleted.push(status);
            }
        }
        if (newlyUncompleted.length > 0) {
            const messages = newlyUncompleted.map((status) => `${status.goalType || 'Goal'} Uncompleted: ${status.goalName}`);
            notify.success(messages.join(', '), { duration: 6000 });
        }
        prevCompletedIdsRef.current = currentCompleteds;
    }, [goalAchievements, sessionLoading, instancesLoading, sessionGoalsViewLoading]);

    useEffect(() => {
        const instanceQueues = instanceQueuesRef.current;
        return () => {
            if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
            if (initTimeoutRef.current) clearTimeout(initTimeoutRef.current);
            instanceQueues.forEach((queue) => queue.reset());
            instanceQueues.clear();
        };
    }, []);

    const dataValue = useMemo(() => ({
        rootId,
        sessionId,
        session,
        activityInstances,
        activities,
        activityGroups,
        parentGoals,
        immediateGoals,
        microGoals,
        sessionGoalsView,
        loading: sessionLoading || (session && !normalizedSessionData),
        instancesLoading,
        activitiesLoading,
        sessionError,
        autoSaveStatus,
        localSessionData,
        groupMap,
        groupedActivities,
        targetAchievements,
        achievedTargetIds,
        goalAchievements,
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
        sessionGoalsView,
        sessionLoading,
        instancesLoading,
        activitiesLoading,
        normalizedSessionData,
        localSessionData,
        sessionError,
        autoSaveStatus,
        groupMap,
        groupedActivities,
        targetAchievements,
        achievedTargetIds,
        goalAchievements,
    ]);

    const uiValue = useMemo(() => ({
        sidePaneMode,
        setSidePaneMode,
        showActivitySelector,
        setShowActivitySelector,
        draggedItem,
        setDraggedItem
    }), [
        sidePaneMode,
        showActivitySelector,
        draggedItem
    ]);

    const actionsValue = useMemo(() => ({
        setLocalSessionData: setSessionDataDraft,
        refreshSession,
        refreshInstances,
        updateSession: updateSessionMutation.mutateAsync,
        addActivity: handleAddActivity,
        removeActivity: removeActivityMutation.mutate,
        updateInstance: enqueueInstanceUpdate,
        updateTimer: handleUpdateTimer,
        createGoal,
        updateGoal: updateGoalMutation.mutate,
        toggleGoalCompletion: toggleGoalCompletionMutation.mutateAsync,
        reorderActivity: handleReorderActivity,
        moveActivity: handleMoveActivity,
        deleteSession: deleteSessionMutation.mutateAsync,
        pauseSession: pauseSessionMutation.mutateAsync,
        resumeSession: resumeSessionMutation.mutateAsync,
        toggleSessionComplete: handleToggleSessionComplete,
        calculateTotalDuration
    }), [
        setSessionDataDraft,
        refreshSession,
        refreshInstances,
        updateSessionMutation.mutateAsync,
        handleAddActivity,
        removeActivityMutation.mutate,
        enqueueInstanceUpdate,
        handleUpdateTimer,
        createGoal,
        updateGoalMutation.mutate,
        toggleGoalCompletionMutation.mutateAsync,
        handleReorderActivity,
        handleMoveActivity,
        deleteSessionMutation.mutateAsync,
        pauseSessionMutation.mutateAsync,
        resumeSessionMutation.mutateAsync,
        handleToggleSessionComplete,
        calculateTotalDuration
    ]);

    const value = useMemo(() => ({
        ...dataValue,
        ...uiValue,
        ...actionsValue
    }), [
        dataValue,
        uiValue,
        actionsValue
    ]);

    return (
        <SessionDataContext.Provider value={dataValue}>
            <SessionUiContext.Provider value={uiValue}>
                <SessionActionsContext.Provider value={actionsValue}>
                    <ActiveSessionContext.Provider value={value}>
                        {children}
                    </ActiveSessionContext.Provider>
                </SessionActionsContext.Provider>
            </SessionUiContext.Provider>
        </SessionDataContext.Provider>
    );
}

export function useActiveSessionData() {
    const context = useContext(SessionDataContext);
    if (!context) {
        throw new Error('useActiveSessionData must be used within an ActiveSessionProvider');
    }
    return context;
}

export function useActiveSessionUi() {
    const context = useContext(SessionUiContext);
    if (!context) {
        throw new Error('useActiveSessionUi must be used within an ActiveSessionProvider');
    }
    return context;
}

export function useActiveSessionActions() {
    const context = useContext(SessionActionsContext);
    if (!context) {
        throw new Error('useActiveSessionActions must be used within an ActiveSessionProvider');
    }
    return context;
}

export function useActiveSession() {
    const context = useContext(ActiveSessionContext);
    if (!context) {
        throw new Error('useActiveSession must be used within an ActiveSessionProvider');
    }
    return context;
}
