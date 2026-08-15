import { logError } from '../utils/logger';
import { useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';

import { createAutoSaveQueue } from '../utils/autoSaveQueue';
import { formatError } from '../utils/mutationNotify';
import { applyOptimisticQueryUpdate } from '../utils/optimisticQuery';
import { fractalApi } from '../utils/api';
import { invalidateOnboardingProgress, invalidateQueryKeys, invalidateSessionLists } from '../utils/queryInvalidation';
import { queryKeys } from './queryKeys';
import {
    formatGoalTypeLabel,
    replaceGoalInList,
    replaceGoalInTree,
} from './sessionDetailMutationUtils';
import notify from '../utils/notify';
import { cloneMetricRows, cloneSetRows, getSectionItems, withSectionItems } from './sessionItemMutationUtils';

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
        invalidateSessionLists(queryClient, rootId, queryKeys);
        invalidateOnboardingProgress(queryClient, queryKeys);
    }, [queryClient, rootId]);

    const invalidateFlowTreeActivityEvidence = useCallback(() => {
        invalidateQueryKeys(queryClient, [
            queryKeys.sessionsEvidenceGoalsRoot(rootId),
            queryKeys.sessionsFlowtreeMetricsRoot(rootId),
        ]);
    }, [queryClient, rootId]);

    const invalidateGoalQueries = useCallback(() => {
        invalidateQueryKeys(queryClient, [
            goalsKey,
            goalsForSelectionKey,
            fractalTreeKey,
            queryKeys.rootGoal(rootId),
            queryKeys.sessionGoalsViewRoot(rootId),
            sessionGoalsViewKey,
            queryKeys.goalAnalytics(rootId),
        ]);
    }, [fractalTreeKey, goalsForSelectionKey, goalsKey, queryClient, rootId, sessionGoalsViewKey]);

    const addActivityMutation = useMutation({
        mutationFn: (variables) => {
            const data = { ...variables };
            delete data.suppressToast;
            return fractalApi.addActivityToSession(rootId, sessionId, data);
        },
        onSuccess: (response, variables) => {
            const createdInstance = response?.data;
            if (createdInstance) {
                queryClient.setQueryData(sessionActivitiesKey, (previous = []) => {
                    if (!Array.isArray(previous)) return previous;
                    if (previous.some((instance) => instance.id === createdInstance.id)) return previous;
                    return [...previous, createdInstance];
                });
            }
            const refreshes = [
                queryClient.invalidateQueries({ queryKey: sessionKey }),
                queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey }),
            ];
            invalidateSessionListQueries();
            if (!variables?.suppressToast) {
                notify.success('Activity added');
            }
            return Promise.all(refreshes);
        },
        onError: (error) => {
            const status = error?.response?.status;
            const endpoint = error?.config?.url;
            logError('[addActivityMutation] failed', {
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
                        ...withSectionItems(
                            section,
                            getSectionItems(section).filter((item) => !(
                                item?.type === 'activity' && item.activity_instance_id === instanceId
                            )),
                        ),
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
            queryClient.invalidateQueries({ queryKey: queryKeys.activityHistoryRoot(rootId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.progressRoot() });
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
            queryClient.invalidateQueries({ queryKey: queryKeys.sessionCircuitRuns(rootId, sessionId) });
            invalidateSessionListQueries();
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
            queryClient.invalidateQueries({ queryKey: queryKeys.sessionCircuitRuns(rootId, sessionId) });
            invalidateSessionListQueries();
            notify.success('Session resumed');
        },
        onError: (error) => {
            notify.error(`Failed to resume: ${error?.response?.data?.error || error.message}`);
        }
    });

    const updateGoalMutation = useMutation({
        mutationFn: ({ goalId, updates }) => fractalApi.updateGoal(rootId, goalId, updates),
        onSuccess: (response) => {
            const goalResponse = response?.data;
            if (goalResponse) {
                queryClient.setQueryData(fractalTreeKey, (previous) => replaceGoalInTree(previous, goalResponse));
                queryClient.setQueryData(sessionGoalsViewKey, (previous) => (
                    previous?.goal_tree
                        ? { ...previous, goal_tree: replaceGoalInTree(previous.goal_tree, goalResponse) }
                        : previous
                ));
                queryClient.setQueryData(goalsKey, (previous) => replaceGoalInList(previous, goalResponse));
                queryClient.setQueryData(goalsForSelectionKey, (previous) => replaceGoalInList(previous, goalResponse));
            }
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
            const goalResponse = response?.data;
            if (goalResponse) {
                queryClient.setQueryData(fractalTreeKey, (previous) => replaceGoalInTree(previous, goalResponse));
                queryClient.setQueryData(sessionGoalsViewKey, (previous) => (
                    previous?.goal_tree
                        ? { ...previous, goal_tree: replaceGoalInTree(previous.goal_tree, goalResponse) }
                        : previous
                ));
                queryClient.setQueryData(goalsKey, (previous) => replaceGoalInList(previous, goalResponse));
                queryClient.setQueryData(goalsForSelectionKey, (previous) => replaceGoalInList(previous, goalResponse));
            }
            invalidateGoalQueries();
            queryClient.invalidateQueries({ queryKey: sessionKey });
            queryClient.invalidateQueries({ queryKey: sessionNotesKey });
            invalidateSessionListQueries();

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

            if (updates.sets !== undefined) {
                const setsPayload = (Array.isArray(updates.sets) ? updates.sets : []).map((set) => ({
                    ...set,
                    metrics: (Array.isArray(set?.metrics) ? set.metrics : [])
                        .filter((metric) => {
                            const value = metric?.value;
                            return value != null && !(typeof value === 'string' && value.trim() === '');
                        }),
                }));
                return fractalApi.updateActivityInstance(rootId, instanceId, {
                    session_id: sessionId,
                    activity_definition_id: instance.activity_definition_id,
                    ...updates,
                    sets: setsPayload,
                });
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
                || updates?.duration_seconds !== undefined
            ) {
                queryClient.invalidateQueries({ queryKey: sessionKey });
                queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey });
                queryClient.invalidateQueries({ queryKey: queryKeys.sessionCircuitRuns(rootId, sessionId) });
                queryClient.invalidateQueries({ queryKey: queryKeys.sessionTemplates(rootId) });
                invalidateSessionListQueries();
                invalidateFlowTreeActivityEvidence();
            }
            if (updates?.metrics !== undefined || updates?.sets !== undefined) {
                queryClient.invalidateQueries({ queryKey: queryKeys.progressComparison(instanceId) });
                if (activityDefinitionId) {
                    queryClient.invalidateQueries({ queryKey: queryKeys.progressHistoryRoot(activityDefinitionId) });
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
                logError('[updateInstance] failed', {
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
                queryClient.invalidateQueries({ queryKey: queryKeys.sessionCircuitRuns(rootId, sessionId) });
                invalidateSessionListQueries();
                invalidateFlowTreeActivityEvidence();
            }
        } catch (error) {
            logError('Timer action failed', error);
            notify.error(`Timer action failed: ${error.response?.data?.error || error.message}`);
            throw error;
        }
    }, [activityInstances, invalidateFlowTreeActivityEvidence, invalidateSessionListQueries, queryClient, rootId, sessionActivitiesKey, sessionGoalsViewKey, sessionId, sessionKey]);

    const handleReorderActivity = useCallback((sectionIndex, itemIndex, direction) => {
        updateSessionDataDraft((currentData) => {
            const updatedData = { ...currentData };
            const sections = [...(updatedData.sections || [])];
            const section = sections[sectionIndex];
            if (!section) return currentData;

            const items = getSectionItems(section);
            const newIndex = direction === 'up' ? itemIndex - 1 : itemIndex + 1;
            if (newIndex < 0 || newIndex >= items.length) return currentData;

            [items[itemIndex], items[newIndex]] = [items[newIndex], items[itemIndex]];
            sections[sectionIndex] = withSectionItems(section, items);
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

            const sourceItems = getSectionItems(sourceSection);
            const activityIndex = sourceItems.findIndex((item) => (
                item?.type === 'activity' && item.activity_instance_id === instanceId
            ));
            if (activityIndex === -1) return currentData;

            const [movedItem] = sourceItems.splice(activityIndex, 1);

            const targetItems = getSectionItems(targetSection);
            targetItems.push(movedItem);

            sections[sourceSectionIndex] = withSectionItems(sourceSection, sourceItems);
            sections[targetSectionIndex] = withSectionItems(targetSection, targetItems);
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
                section_index: sectionIndex,
            });
            const newInstance = response.data;
            updateSessionDataDraft((currentData) => {
                if (!currentData?.sections?.[sectionIndex]) return currentData;
                const updatedData = { ...currentData };
                const sections = [...updatedData.sections];
                const section = { ...sections[sectionIndex] };
                const items = getSectionItems(section).filter((item) => !(
                    item?.type === 'activity' && item.activity_instance_id === newInstance.id
                ));
                items.push({ type: 'activity', activity_instance_id: newInstance.id });
                sections[sectionIndex] = withSectionItems(section, items);
                updatedData.sections = sections;
                return updatedData;
            });

            setShowActivitySelector((previous) => ({ ...previous, [sectionIndex]: false }));
            return newInstance;
        } catch (error) {
            logError('Error adding activity:', error);
            throw error;
        }
    }, [activities, addActivityMutation, setShowActivitySelector, updateSessionDataDraft]);

    const duplicateActivityInstance = useCallback(async (sectionIndex, sourceInstanceId, insertAfterIndex) => {
        const cachedInstances = queryClient.getQueryData(sessionActivitiesKey);
        const instanceSource = Array.isArray(cachedInstances) ? cachedInstances : activityInstances;
        const sourceInstance = instanceSource.find((entry) => entry.id === sourceInstanceId);
        if (!sourceInstance?.activity_definition_id) return null;

        try {
            const response = await addActivityMutation.mutateAsync({
                activity_definition_id: sourceInstance.activity_definition_id,
                section_index: sectionIndex,
                suppressToast: true,
            });
            const newInstance = response.data;
            if (!newInstance?.id) return newInstance || null;

            updateSessionDataDraft((currentData) => {
                if (!currentData?.sections?.[sectionIndex]) return currentData;
                const updatedData = { ...currentData };
                const sections = [...updatedData.sections];
                const section = { ...sections[sectionIndex] };
                const items = getSectionItems(section).filter((item) => !(
                    item?.type === 'activity' && item.activity_instance_id === newInstance.id
                ));
                const sourceIndex = items.findIndex((item) => (
                    item?.type === 'activity' && item.activity_instance_id === sourceInstanceId
                ));
                const insertionIndex = sourceIndex >= 0
                    ? sourceIndex + 1
                    : Math.min(Math.max((insertAfterIndex ?? items.length - 1) + 1, 0), items.length);
                items.splice(insertionIndex, 0, { type: 'activity', activity_instance_id: newInstance.id });
                sections[sectionIndex] = withSectionItems(section, items);
                updatedData.sections = sections;
                return updatedData;
            });

            const copiedSets = cloneSetRows(sourceInstance.sets || [], { preserveCompletion: false });
            const copiedMetrics = cloneMetricRows(sourceInstance.metrics || sourceInstance.metric_values || []);

            await updateInstanceMutation.mutateAsync({
                instanceId: newInstance.id,
                updates: {
                    ...(copiedSets.length > 0 ? { sets: copiedSets } : {}),
                    completed: false,
                    time_start: null,
                    time_stop: null,
                    duration_seconds: null,
                    target_duration_seconds: null,
                },
            });

            if (copiedMetrics.length > 0) {
                await updateInstanceMutation.mutateAsync({
                    instanceId: newInstance.id,
                    updates: { metrics: copiedMetrics },
                });
            }

            notify.success('Activity instance duplicated');
            return newInstance;
        } catch (error) {
            logError('Error duplicating activity instance:', error);
            notify.error(`Failed to duplicate activity: ${formatError(error)}`);
            throw error;
        }
    }, [
        activityInstances,
        addActivityMutation,
        queryClient,
        sessionActivitiesKey,
        updateInstanceMutation,
        updateSessionDataDraft,
    ]);

    const clearActivityInstanceValues = useCallback(async (instanceId) => {
        const cachedInstances = queryClient.getQueryData(sessionActivitiesKey);
        const instanceSource = Array.isArray(cachedInstances) ? cachedInstances : activityInstances;
        const instance = instanceSource.find((entry) => entry.id === instanceId);
        if (!instance) return null;

        try {
            if (Array.isArray(instance.sets) && instance.sets.length > 0) {
                await updateInstanceMutation.mutateAsync({
                    instanceId,
                    updates: {
                        sets: [],
                        completed: false,
                        time_start: null,
                        time_stop: null,
                        duration_seconds: null,
                        target_duration_seconds: null,
                    },
                });
            } else {
                const flatMetrics = instance.metrics || instance.metric_values || [];
                if (Array.isArray(flatMetrics) && flatMetrics.length > 0) {
                    await updateInstanceMutation.mutateAsync({
                        instanceId,
                        updates: { metrics: [] },
                    });
                }
                await updateInstanceMutation.mutateAsync({
                    instanceId,
                    updates: {
                        completed: false,
                        time_start: null,
                        time_stop: null,
                        duration_seconds: null,
                        target_duration_seconds: null,
                    },
                });
            }
            notify.success('Activity values cleared');
            return instanceId;
        } catch (error) {
            logError('Error clearing activity instance values:', error);
            notify.error(`Failed to clear activity values: ${formatError(error)}`);
            throw error;
        }
    }, [
        activityInstances,
        queryClient,
        sessionActivitiesKey,
        updateInstanceMutation,
    ]);

    const copyActivityValuesFromSource = useCallback(async (targetInstanceId, sourceInstance) => {
        if (!targetInstanceId || !sourceInstance || targetInstanceId === sourceInstance.id) return null;

        const cachedInstances = queryClient.getQueryData(sessionActivitiesKey);
        const instanceSource = Array.isArray(cachedInstances) ? cachedInstances : activityInstances;
        const targetInstance = instanceSource.find((entry) => entry.id === targetInstanceId);
        if (!sourceInstance || !targetInstance) return null;
        if (sourceInstance.activity_definition_id !== targetInstance.activity_definition_id) {
            notify.error('Previous values can only be copied from the same activity');
            return null;
        }

        const copiedSets = cloneSetRows(sourceInstance.sets || [], { preserveCompletion: true });
        const copiedMetrics = cloneMetricRows(sourceInstance.metrics || sourceInstance.metric_values || []);

        try {
            if (copiedSets.length > 0 || Array.isArray(targetInstance.sets)) {
                await updateInstanceMutation.mutateAsync({
                    instanceId: targetInstanceId,
                    updates: { sets: copiedSets },
                });
            }

            await updateInstanceMutation.mutateAsync({
                instanceId: targetInstanceId,
                updates: { metrics: copiedMetrics },
            });

            notify.success('Copied values from previous instance');
            return targetInstanceId;
        } catch (error) {
            logError('Error copying values from previous activity instance:', error);
            notify.error(`Failed to copy previous values: ${formatError(error)}`);
            throw error;
        }
    }, [
        activityInstances,
        queryClient,
        sessionActivitiesKey,
        updateInstanceMutation,
    ]);

    const copyActivityValuesFromInstance = useCallback(async (targetInstanceId, sourceInstanceId) => {
        if (!targetInstanceId || !sourceInstanceId || targetInstanceId === sourceInstanceId) return null;

        const cachedInstances = queryClient.getQueryData(sessionActivitiesKey);
        const instanceSource = Array.isArray(cachedInstances) ? cachedInstances : activityInstances;
        const sourceInstance = instanceSource.find((entry) => entry.id === sourceInstanceId);
        return copyActivityValuesFromSource(targetInstanceId, sourceInstance);
    }, [
        activityInstances,
        copyActivityValuesFromSource,
        queryClient,
        sessionActivitiesKey,
    ]);

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
            logError('Failed to toggle session completion', error);
            notify.error(`Failed to update session completion: ${error?.response?.data?.error || error?.message || 'Unknown error'}`);
        }
    }, [activityInstances, handleUpdateTimer, queryClient, session, sessionId, updateSession]);

    const createGoal = useCallback(async (goalData) => {
        try {
            const response = await fractalApi.createGoal(rootId, goalData);
            invalidateGoalQueries();
            queryClient.invalidateQueries({ queryKey: sessionKey });
            queryClient.invalidateQueries({ queryKey: activitiesKey });
            return response.data;
        } catch (error) {
            logError('Failed to create goal', error);
            notify.error(`Failed to create goal: ${formatError(error)}`);
            throw error;
        }
    }, [activitiesKey, invalidateGoalQueries, queryClient, rootId, sessionKey]);

    return {
        addActivity: handleAddActivity,
        removeActivity: removeActivityMutation.mutate,
        updateInstance: enqueueInstanceUpdate,
        updateTimer: handleUpdateTimer,
        duplicateActivityInstance,
        clearActivityInstanceValues,
        copyActivityValuesFromSource,
        copyActivityValuesFromInstance,
        createGoal,
        updateGoal: updateGoalMutation.mutateAsync,
        toggleGoalCompletion: toggleGoalCompletionMutation.mutateAsync,
        reorderActivity: handleReorderActivity,
        moveActivity: handleMoveActivity,
        deleteSession: deleteSessionMutation.mutateAsync,
        pauseSession: pauseSessionMutation.mutateAsync,
        resumeSession: resumeSessionMutation.mutateAsync,
        toggleSessionComplete: handleToggleSessionComplete,
    };
}
export default useSessionDetailMutations;
