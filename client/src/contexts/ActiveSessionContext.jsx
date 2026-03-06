import React, { createContext, useContext, useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import notify from '../utils/notify';
import { useGoals } from './GoalsContext';
import { useTimezone } from './TimezoneContext';
import { useTargetAchievements } from '../hooks/useTargetAchievements';
import { createAutoSaveQueue } from '../utils/autoSaveQueue';
import { parseTargets } from '../utils/goalUtils';

const SessionDataContext = createContext(null);
const SessionUiContext = createContext(null);
const SessionActionsContext = createContext(null);

const ActiveSessionContext = createContext(null);

function formatGoalTypeLabel(type) {
    if (!type) return 'Goal';
    return type.replace(/Goal$/, ' Goal').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
}

function patchGoalCompletion(goal, goalId, completed, completedAt) {
    if (!goal || goal.id !== goalId) return goal;
    return {
        ...goal,
        completed,
        completed_at: completedAt,
        attributes: {
            ...(goal.attributes || {}),
            completed,
            completed_at: completedAt
        }
    };
}

function patchGoalTreeCompletion(node, goalId, completed, completedAt) {
    if (!node) return node;

    const patchedNode = patchGoalCompletion(node, goalId, completed, completedAt);
    if (!patchedNode.children || !Array.isArray(patchedNode.children)) return patchedNode;

    return {
        ...patchedNode,
        children: patchedNode.children.map((child) => patchGoalTreeCompletion(child, goalId, completed, completedAt))
    };
}

export function ActiveSessionProvider({ rootId, sessionId, children }) {
    const queryClient = useQueryClient();
    const { setActiveRootId } = useGoals();
    const { timezone } = useTimezone();

    // UI state
    const [showActivitySelector, setShowActivitySelector] = useState({});
    const [autoSaveStatus, setAutoSaveStatus] = useState('');
    const [sidePaneMode, setSidePaneMode] = useState('details');
    const [localSessionData, setLocalSessionData] = useState(null);
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

    const { data: sessionGoalsView = null, isLoading: sessionGoalsViewLoading } = useQuery({
        queryKey: ['session-goals-view', rootId, sessionId],
        queryFn: async () => {
            const res = await fractalApi.getSessionGoalsView(rootId, sessionId);
            return res.data || null;
        },
        enabled: !!rootId && !!sessionId
    });

    const microGoals = useMemo(() => sessionGoalsView?.micro_goals || [], [sessionGoalsView]);

    // 2. Mutations
    const updateSessionMutation = useMutation({
        mutationFn: (updates) => fractalApi.updateSession(rootId, sessionId, updates),
        onMutate: () => setAutoSaveStatus('saving'),
        onSuccess: (res) => {
            queryClient.setQueryData(['session', rootId, sessionId], res.data);
            queryClient.invalidateQueries({ queryKey: ['sessions', rootId] });
            queryClient.invalidateQueries({ queryKey: ['sessions', rootId, 'all'] });
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
            queryClient.invalidateQueries({ queryKey: ['session-activities', rootId, sessionId] });
            queryClient.invalidateQueries({ queryKey: ['session', rootId, sessionId] });
            queryClient.invalidateQueries({ queryKey: ['session-goals-view', rootId, sessionId] });
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
            queryClient.invalidateQueries({ queryKey: ['session-goals-view', rootId, sessionId] });
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

    const pauseSessionMutation = useMutation({
        mutationFn: () => fractalApi.pauseSession(rootId, sessionId),
        onSuccess: (res) => {
            queryClient.setQueryData(['session', rootId, sessionId], res.data);
            queryClient.invalidateQueries({ queryKey: ['session-activities', rootId, sessionId] });
            notify.success('Session paused');
        },
        onError: (err) => {
            notify.error(`Failed to pause: ${err?.response?.data?.error || err.message}`);
        }
    });

    const resumeSessionMutation = useMutation({
        mutationFn: () => fractalApi.resumeSession(rootId, sessionId),
        onSuccess: (res) => {
            queryClient.setQueryData(['session', rootId, sessionId], res.data);
            queryClient.invalidateQueries({ queryKey: ['session-activities', rootId, sessionId] });
            notify.success('Session resumed');
        },
        onError: (err) => {
            notify.error(`Failed to resume: ${err?.response?.data?.error || err.message}`);
        }
    });

    const updateGoalMutation = useMutation({
        mutationFn: ({ goalId, updates }) => fractalApi.updateGoal(rootId, goalId, updates),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['goals', rootId] });
            queryClient.invalidateQueries({ queryKey: ['session', rootId, sessionId] });
            queryClient.invalidateQueries({ queryKey: ['session-goals-view', rootId, sessionId] });
            queryClient.invalidateQueries({ queryKey: ['fractalTree', rootId] });
        }
    });

    const toggleGoalCompletionMutation = useMutation({
        mutationFn: ({ goalId, completed }) => fractalApi.toggleGoalCompletion(rootId, goalId, completed),
        onMutate: async ({ goalId, completed }) => {
            // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
            await queryClient.cancelQueries({ queryKey: ['session-notes', rootId, sessionId] });
            await queryClient.cancelQueries({ queryKey: ['session', rootId, sessionId] });

            // Snapshot the previous value
            const previousNotes = queryClient.getQueryData(['session-notes', rootId, sessionId]);
            const previousSession = queryClient.getQueryData(['session', rootId, sessionId]);

            // Optimistically update notes
            queryClient.setQueryData(['session-notes', rootId, sessionId], (old = []) =>
                old.map(n => n.nano_goal_id === goalId ? { ...n, nano_goal_completed: completed } : n)
            );

            // Optimistically update session data if goal is in immediate_goals etc.
            queryClient.setQueryData(['session', rootId, sessionId], (old) => {
                if (!old) return old;
                // Deep clone and update
                const next = JSON.parse(JSON.stringify(old));
                if (next.immediate_goals) {
                    next.immediate_goals = next.immediate_goals.map(g =>
                        g.id === goalId ? { ...g, completed } : g
                    );
                }
                return next;
            });

            return { previousNotes, previousSession };
        },
        onError: (err, variables, context) => {
            // Rollback
            if (context?.previousNotes) {
                queryClient.setQueryData(['session-notes', rootId, sessionId], context.previousNotes);
            }
            if (context?.previousSession) {
                queryClient.setQueryData(['session', rootId, sessionId], context.previousSession);
            }
        },
        onSuccess: (res, variables) => {
            queryClient.invalidateQueries({ queryKey: ['goals', rootId] });
            queryClient.invalidateQueries({ queryKey: ['session', rootId, sessionId] });
            queryClient.invalidateQueries({ queryKey: ['session-notes', rootId, sessionId] });
            queryClient.invalidateQueries({ queryKey: ['session-goals-view', rootId, sessionId] });
            queryClient.invalidateQueries({ queryKey: ['fractalTree', rootId] });

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
        queryClient.setQueryData(['session-activities', rootId, sessionId], (prev = []) => {
            if (!Array.isArray(prev)) return prev;
            return prev.map((inst) => {
                if (inst.id !== instanceId) return inst;
                return {
                    ...inst,
                    ...updates
                };
            });
        });
    }, [queryClient, rootId, sessionId]);

    const updateInstanceMutation = useMutation({
        mutationFn: async ({ instanceId, updates }) => {
            const cachedInstances = queryClient.getQueryData(['session-activities', rootId, sessionId]);
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
                queryClient.setQueryData(['session-activities', rootId, sessionId], (prev = []) =>
                    prev.map(inst => inst.id === instanceId ? res.data : inst)
                );
            } else {
                queryClient.invalidateQueries({ queryKey: ['session-activities', rootId, sessionId] });
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
    }, [updateInstanceMutation.mutateAsync]);

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

            const optimisticCompletedAt = desiredCompleted ? new Date().toISOString() : null;
            autoSyncedGoalStatesRef.current.set(goalId, desiredCompleted);

            queryClient.setQueryData(['session-goals-view', rootId, sessionId], (prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    goal_tree: patchGoalTreeCompletion(prev.goal_tree, goalId, desiredCompleted, optimisticCompletedAt),
                    micro_goals: Array.isArray(prev.micro_goals)
                        ? prev.micro_goals.map((microGoal) => patchGoalCompletion(microGoal, goalId, desiredCompleted, optimisticCompletedAt))
                        : prev.micro_goals
                };
            });

            queryClient.setQueryData(['session', rootId, sessionId], (prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    short_term_goals: Array.isArray(prev.short_term_goals)
                        ? prev.short_term_goals.map((sessionGoal) => patchGoalCompletion(sessionGoal, goalId, desiredCompleted, optimisticCompletedAt))
                        : prev.short_term_goals,
                    immediate_goals: Array.isArray(prev.immediate_goals)
                        ? prev.immediate_goals.map((sessionGoal) => patchGoalCompletion(sessionGoal, goalId, desiredCompleted, optimisticCompletedAt))
                        : prev.immediate_goals
                };
            });

            queryClient.setQueryData(['fractalTree', rootId], (prev) => (
                prev ? patchGoalTreeCompletion(prev, goalId, desiredCompleted, optimisticCompletedAt) : prev
            ));

            fractalApi.toggleGoalCompletion(rootId, goalId, desiredCompleted)
                .then((res) => {
                    const syncedGoal = res?.data || {};
                    const syncedCompleted = Boolean(syncedGoal.completed);
                    const syncedCompletedAt = syncedGoal.completed_at || null;

                    queryClient.setQueryData(['session-goals-view', rootId, sessionId], (prev) => {
                        if (!prev) return prev;
                        return {
                            ...prev,
                            goal_tree: patchGoalTreeCompletion(prev.goal_tree, goalId, syncedCompleted, syncedCompletedAt),
                            micro_goals: Array.isArray(prev.micro_goals)
                                ? prev.micro_goals.map((microGoal) => patchGoalCompletion(microGoal, goalId, syncedCompleted, syncedCompletedAt))
                                : prev.micro_goals
                        };
                    });

                    queryClient.setQueryData(['session', rootId, sessionId], (prev) => {
                        if (!prev) return prev;
                        return {
                            ...prev,
                            short_term_goals: Array.isArray(prev.short_term_goals)
                                ? prev.short_term_goals.map((sessionGoal) => patchGoalCompletion(sessionGoal, goalId, syncedCompleted, syncedCompletedAt))
                                : prev.short_term_goals,
                            immediate_goals: Array.isArray(prev.immediate_goals)
                                ? prev.immediate_goals.map((sessionGoal) => patchGoalCompletion(sessionGoal, goalId, syncedCompleted, syncedCompletedAt))
                                : prev.immediate_goals
                        };
                    });

                    queryClient.setQueryData(['fractalTree', rootId], (prev) => (
                        prev ? patchGoalTreeCompletion(prev, goalId, syncedCompleted, syncedCompletedAt) : prev
                    ));
                })
                .catch((error) => {
                    console.error('[autoSyncGoalCompletion] failed', {
                        goalId,
                        desiredCompleted,
                        message: error?.message,
                        status: error?.response?.status,
                        data: error?.response?.data
                    });
                    queryClient.invalidateQueries({ queryKey: ['session-goals-view', rootId, sessionId] });
                    queryClient.invalidateQueries({ queryKey: ['session', rootId, sessionId] });
                    queryClient.invalidateQueries({ queryKey: ['fractalTree', rootId] });
                })
                .finally(() => {
                    if (autoSyncedGoalStatesRef.current.get(goalId) === desiredCompleted) {
                        autoSyncedGoalStatesRef.current.delete(goalId);
                    }
                });
        });
    }, [rootId, sessionId, goalAchievements, allGoalsForTargets, queryClient]);

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
            queryClient.invalidateQueries({ queryKey: ['fractalTree', rootId] });
            queryClient.invalidateQueries({ queryKey: ['session-goals-view', rootId, sessionId] });
            queryClient.invalidateQueries({ queryKey: ['session', rootId, sessionId] });
            queryClient.invalidateQueries({ queryKey: ['session-activities', rootId, sessionId] });

            return res.data;
        } catch (err) {
            console.error("Failed to create goal", err);
            throw err;
        }
    }, [rootId, sessionId, queryClient]);



    const autoSaveQueue = useMemo(() => createAutoSaveQueue({
        save: (nextData) => updateSessionMutation.mutateAsync({ session_data: nextData }),
        onError: () => {
            setAutoSaveStatus('error');
            scheduleStatusClear(3000);
        }
    }), [updateSessionMutation.mutateAsync, scheduleStatusClear]);

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
            instanceQueuesRef.current.forEach((queue) => queue.reset());
            instanceQueuesRef.current.clear();
            setAutoSaveStatus('');
            setShowActivitySelector({});
            setDraggedItem(null);
            setSidePaneMode('details');
            targetNotificationsInitializedRef.current = false;
            goalNotificationsInitializedRef.current = false;
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
        if (initTimeoutRef.current) clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = setTimeout(() => {
            setJustInitialized(false);
            initTimeoutRef.current = null;
        }, 500); // Guard window
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
        return () => {
            if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
            if (initTimeoutRef.current) clearTimeout(initTimeoutRef.current);
            instanceQueuesRef.current.forEach((queue) => queue.reset());
            instanceQueuesRef.current.clear();
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
        loading: sessionLoading || (session && !localSessionData),
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
        setLocalSessionData,
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
        setLocalSessionData,
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
