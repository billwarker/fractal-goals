import { useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';

import { createAutoSaveQueue } from '../utils/autoSaveQueue';
import { formatError } from '../utils/mutationNotify';
import { applyOptimisticQueryUpdate } from '../utils/optimisticQuery';
import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';
import notify from '../utils/notify';

function formatGoalTypeLabel(type) {
    if (!type) return 'Goal';
    return type.replace(/Goal$/, ' Goal').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
}

export function useSessionDetailMutations({
    rootId,
    sessionId,
    session,
    activityInstances,
    activities,
    queryClient,
    sessionKey,
    sessionActivitiesKey,
    sessionGoalsViewKey,
    sessionNotesKey,
    sessionsKey,
    sessionsAllKey,
    sessionsPaginatedKey,
    fractalTreeKey,
    activitiesKey,
    updateSession,
    updateSessionDataDraft,
    setSessionDataDraft,
    setShowActivitySelector,
    setIsDeletingSession,
    instanceQueuesRef,
    instanceRollbackRef,
}) {
    const goalsKey = queryKeys.goals(rootId);
    const goalsForSelectionKey = queryKeys.goalsForSelection(rootId);

    const invalidateSessionListQueries = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: sessionsKey });
        queryClient.invalidateQueries({ queryKey: sessionsAllKey });
        queryClient.invalidateQueries({ queryKey: sessionsPaginatedKey });
    }, [queryClient, sessionsAllKey, sessionsKey, sessionsPaginatedKey]);

    const invalidateGoalQueries = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: goalsKey });
        queryClient.invalidateQueries({ queryKey: goalsForSelectionKey });
        queryClient.invalidateQueries({ queryKey: fractalTreeKey });
        queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey });
    }, [fractalTreeKey, goalsForSelectionKey, goalsKey, queryClient, sessionGoalsViewKey]);

    const addActivityMutation = useMutation({
        mutationFn: (data) => fractalApi.addActivityToSession(rootId, sessionId, data),
        onSuccess: (response) => {
            const createdInstance = response?.data;
            if (createdInstance) {
                queryClient.setQueryData(sessionActivitiesKey, (previous = []) => {
                    if (!Array.isArray(previous)) return previous;
                    if (previous.some((instance) => instance.id === createdInstance.id)) return previous;
                    return [...previous, createdInstance];
                });
            }
            queryClient.invalidateQueries({ queryKey: sessionKey });
            queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey });
            invalidateSessionListQueries();
            notify.success('Activity added');
        },
        onError: (error) => {
            const status = error?.response?.status;
            const endpoint = error?.config?.url;
            console.error('[addActivityMutation] failed', {
                status,
                endpoint,
                message: error?.message,
                data: error?.response?.data
            });
            notify.error(`Failed to add activity: ${formatError(error)}`);
        }
    });

    const removeActivityMutation = useMutation({
        mutationFn: (instanceId) => fractalApi.removeActivityFromSession(rootId, sessionId, instanceId),
        onSuccess: (_, instanceId) => {
            queryClient.setQueryData(sessionActivitiesKey, (previous = []) => {
                if (!Array.isArray(previous)) return previous;
                return previous.filter((instance) => instance.id !== instanceId);
            });
            setSessionDataDraft((previous) => {
                if (!previous?.sections) return previous;
                return {
                    ...previous,
                    sections: previous.sections.map((section) => ({
                        ...section,
                        activity_ids: (section.activity_ids || []).filter((id) => id !== instanceId),
                    })),
                };
            });
            queryClient.invalidateQueries({ queryKey: sessionKey });
            queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey });
            invalidateSessionListQueries();
            notify.success('Activity removed');
        },
        onError: (error) => {
            notify.error(`Failed to remove activity: ${formatError(error)}`);
        },
    });

    const deleteSessionMutation = useMutation({
        mutationFn: () => fractalApi.deleteSession(rootId, sessionId),
        onMutate: async () => {
            setIsDeletingSession(true);
            await queryClient.cancelQueries({ queryKey: sessionKey });
            await queryClient.cancelQueries({ queryKey: sessionActivitiesKey });
        },
        onSuccess: () => {
            invalidateSessionListQueries();
            queryClient.removeQueries({ queryKey: sessionKey });
            queryClient.removeQueries({ queryKey: sessionActivitiesKey });
            queryClient.invalidateQueries({ queryKey: ['activity-history', rootId] });
            queryClient.invalidateQueries({ queryKey: ['progress'] });
            notify.success('Session deleted successfully');
        },
        onError: () => {
            setIsDeletingSession(false);
        }
    });

    const pauseSessionMutation = useMutation({
        mutationFn: () => fractalApi.pauseSession(rootId, sessionId),
        onSuccess: (response) => {
            queryClient.setQueryData(sessionKey, response.data);
            queryClient.invalidateQueries({ queryKey: sessionActivitiesKey });
            notify.success('Session paused');
        },
        onError: (error) => {
            notify.error(`Failed to pause: ${error?.response?.data?.error || error.message}`);
        }
    });

    const resumeSessionMutation = useMutation({
        mutationFn: () => fractalApi.resumeSession(rootId, sessionId),
        onSuccess: (response) => {
            queryClient.setQueryData(sessionKey, response.data);
            queryClient.invalidateQueries({ queryKey: sessionActivitiesKey });
            notify.success('Session resumed');
        },
        onError: (error) => {
            notify.error(`Failed to resume: ${error?.response?.data?.error || error.message}`);
        }
    });

    const updateGoalMutation = useMutation({
        mutationFn: ({ goalId, updates }) => fractalApi.updateGoal(rootId, goalId, updates),
        onSuccess: () => {
            invalidateGoalQueries();
            queryClient.invalidateQueries({ queryKey: sessionKey });
        },
        onError: (error) => {
            notify.error(`Failed to update goal: ${formatError(error)}`);
        },
    });

    const toggleGoalCompletionMutation = useMutation({
        mutationFn: ({ goalId, completed }) => fractalApi.toggleGoalCompletion(
            rootId,
            goalId,
            completed,
            completed ? sessionId : null
        ),
        onSuccess: (response, variables) => {
            invalidateGoalQueries();
            queryClient.invalidateQueries({ queryKey: sessionKey });
            queryClient.invalidateQueries({ queryKey: sessionNotesKey });

            const goalResponse = response?.data;
            if (goalResponse) {
                const goalType = formatGoalTypeLabel(goalResponse.attributes?.type || goalResponse.type);
                const action = variables.completed ? 'Completed' : 'Uncompleted';
                notify.success(`${goalType} ${action}: ${goalResponse.name}`, { duration: 5000 });
            }
        }
    });

    const applyInstanceOptimisticUpdate = useCallback((instanceId, updates) => {
        const updater = (previous = []) => {
            if (!Array.isArray(previous)) return previous;
            return previous.map((instance) => {
                if (instance.id !== instanceId) return instance;
                return {
                    ...instance,
                    ...updates
                };
            });
        };

        if (!instanceRollbackRef.current.has(instanceId)) {
            const rollback = applyOptimisticQueryUpdate({
                queryClient,
                queryKey: sessionActivitiesKey,
                updater,
            });
            instanceRollbackRef.current.set(instanceId, rollback);
            return;
        }

        queryClient.setQueryData(sessionActivitiesKey, updater);
    }, [instanceRollbackRef, queryClient, sessionActivitiesKey]);

    const updateInstanceMutation = useMutation({
        mutationFn: async ({ instanceId, updates }) => {
            const cachedInstances = queryClient.getQueryData(sessionActivitiesKey);
            const instanceSource = Array.isArray(cachedInstances) ? cachedInstances : activityInstances;
            const instance = instanceSource.find((entry) => entry.id === instanceId);
            if (!instance) throw new Error('Instance not found');

            if (updates.metrics !== undefined) {
                const metricsPayload = (Array.isArray(updates.metrics) ? updates.metrics : [])
                    .map((metric) => {
                        const metricId = metric?.metric_id || metric?.metric_definition_id || null;
                        if (!metricId) return null;
                        const rawValue = metric?.value;
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
                            ...(value == null ? {} : { value }),
                            metric_id: metricId,
                            split_id: metric?.split_id || metric?.split_definition_id || null,
                        };
                    })
                    .filter((metric) => metric && metric.value != null);

                try {
                    return await fractalApi.updateActivityMetrics(rootId, sessionId, instanceId, { metrics: metricsPayload });
                } catch (error) {
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
        onSuccess: (response, { instanceId, updates }) => {
            instanceRollbackRef.current.delete(instanceId);
            const activityDefinitionId = response?.data?.activity_definition_id;
            if (response?.data) {
                queryClient.setQueryData(sessionActivitiesKey, (previous = []) =>
                    previous.map((instance) => instance.id === instanceId ? response.data : instance)
                );
            } else {
                queryClient.invalidateQueries({ queryKey: sessionActivitiesKey });
            }

            if (
                updates?.completed !== undefined
                || updates?.sets !== undefined
                || updates?.metrics !== undefined
                || updates?.time_start !== undefined
                || updates?.time_stop !== undefined
            ) {
                queryClient.invalidateQueries({ queryKey: sessionKey });
                queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey });
            }

            // Invalidate progress comparison when metrics are updated
            if (updates?.metrics !== undefined || updates?.sets !== undefined) {
                queryClient.invalidateQueries({ queryKey: queryKeys.progressComparison(instanceId) });
                if (activityDefinitionId) {
                    queryClient.invalidateQueries({ queryKey: ['progress', 'history', activityDefinitionId] });
                }
                queryClient.invalidateQueries({ queryKey: queryKeys.sessionProgressSummary(sessionId) });
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
                const rollback = instanceRollbackRef.current.get(instanceId);
                if (rollback) {
                    rollback();
                    instanceRollbackRef.current.delete(instanceId);
                }
                queryClient.invalidateQueries({ queryKey: sessionActivitiesKey });
                queryClient.invalidateQueries({ queryKey: sessionKey });
                queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey });
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
    }, [
        instanceQueuesRef,
        instanceRollbackRef,
        queryClient,
        sessionActivitiesKey,
        sessionGoalsViewKey,
        sessionKey,
        updateInstanceMutation,
    ]);

    const enqueueInstanceUpdate = useCallback((instanceId, updates) => {
        applyInstanceOptimisticUpdate(instanceId, updates);
        const queue = getInstanceQueue(instanceId);
        if (!queue) return Promise.resolve();
        return queue.enqueue(updates);
    }, [applyInstanceOptimisticUpdate, getInstanceQueue]);

    const handleUpdateTimer = useCallback(async (instanceId, action, extraData = {}) => {
        const instance = activityInstances.find((entry) => entry.id === instanceId);
        if (!instance) return;

        try {
            let response;
            if (action === 'start') {
                response = await fractalApi.startActivityTimer(rootId, instanceId, {
                    session_id: sessionId,
                    activity_definition_id: instance.activity_definition_id,
                    ...extraData,
                });
            } else if (action === 'complete') {
                response = await fractalApi.completeActivityInstance(rootId, instanceId, {
                    session_id: sessionId,
                    activity_definition_id: instance.activity_definition_id
                });
            } else if (action === 'reset') {
                response = await fractalApi.updateActivityInstance(rootId, instanceId, {
                    session_id: sessionId,
                    activity_definition_id: instance.activity_definition_id,
                    time_start: null,
                    time_stop: null,
                    duration_seconds: null,
                    target_duration_seconds: null,
                    completed: false
                });
            }

            if (response?.data) {
                queryClient.setQueryData(sessionActivitiesKey, (previous = []) =>
                    previous.map((entry) => entry.id === instanceId ? response.data : entry)
                );
                queryClient.invalidateQueries({ queryKey: sessionKey });
                queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey });
            }
        } catch (error) {
            console.error('Timer action failed', error);
            notify.error(`Timer action failed: ${error.response?.data?.error || error.message}`);
        }
    }, [activityInstances, queryClient, rootId, sessionActivitiesKey, sessionGoalsViewKey, sessionId, sessionKey]);

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
        const activityDefinition = activityObject || activities.find((entry) => entry.id === activityId);
        if (!activityDefinition) return;

        try {
            const response = await addActivityMutation.mutateAsync({
                activity_definition_id: activityDefinition.id,
            });
            const newInstance = response.data;

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

            setShowActivitySelector((previous) => ({ ...previous, [sectionIndex]: false }));
            return newInstance;
        } catch (error) {
            console.error('Error adding activity:', error);
            throw error;
        }
    }, [activities, addActivityMutation, setShowActivitySelector, updateSessionDataDraft]);

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

            await updateSession(updatePayload);
            if (newCompleted) {
                queryClient.invalidateQueries({ queryKey: queryKeys.sessionProgressSummary(sessionId) });
            }
            notify.success(newCompleted ? 'Session completed!' : 'Session marked as incomplete');
        } catch (error) {
            console.error('Failed to toggle session completion', error);
            notify.error(`Failed to update session completion: ${error?.response?.data?.error || error?.message || 'Unknown error'}`);
        }
    }, [activityInstances, handleUpdateTimer, rootId, session, updateSession]);

    const calculateTotalDuration = useCallback(() => {
        return activityInstances.reduce((sum, instance) => sum + (instance.duration_seconds || 0), 0);
    }, [activityInstances]);

    const createGoal = useCallback(async (goalData) => {
        try {
            const response = await fractalApi.createGoal(rootId, goalData);
            invalidateGoalQueries();
            queryClient.invalidateQueries({ queryKey: sessionKey });
            queryClient.invalidateQueries({ queryKey: activitiesKey });
            return response.data;
        } catch (error) {
            console.error('Failed to create goal', error);
            notify.error(`Failed to create goal: ${formatError(error)}`);
            throw error;
        }
    }, [activitiesKey, invalidateGoalQueries, queryClient, rootId, sessionKey]);

    return {
        addActivity: handleAddActivity,
        removeActivity: removeActivityMutation.mutate,
        updateInstance: enqueueInstanceUpdate,
        updateTimer: handleUpdateTimer,
        createGoal,
        updateGoal: updateGoalMutation.mutateAsync,
        toggleGoalCompletion: toggleGoalCompletionMutation.mutateAsync,
        reorderActivity: handleReorderActivity,
        moveActivity: handleMoveActivity,
        deleteSession: deleteSessionMutation.mutateAsync,
        pauseSession: pauseSessionMutation.mutateAsync,
        resumeSession: resumeSessionMutation.mutateAsync,
        toggleSessionComplete: handleToggleSessionComplete,
        calculateTotalDuration,
    };
}

export default useSessionDetailMutations;
