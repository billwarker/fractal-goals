import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import notify from '../utils/notify';
import { queryKeys } from '../hooks/queryKeys';

const ActivitiesContext = createContext();

export function ActivitiesProvider({ children }) {
    const queryClient = useQueryClient();

    const emitActivityEvent = useCallback((eventName, detail) => {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(new CustomEvent(eventName, { detail }));
    }, []);

    const createActivity = useCallback(async (rootId, activityData) => {
        try {
            const res = await fractalApi.createActivity(rootId, activityData);
            const created = res.data;

            queryClient.setQueryData(queryKeys.activities(rootId), (prev = []) => {
                const next = Array.isArray(prev) ? [...prev] : [];
                if (!created?.id || next.some((item) => item.id === created.id)) return next;
                next.push(created);
                return next;
            });

            emitActivityEvent('activity.created', { rootId, activity: created });
            emitActivityEvent('activities.changed', { rootId, action: 'created', activity: created });
            notify.success(`Created activity "${created?.name || 'Untitled'}"`);
            return created;
        } catch (err) {
            console.error('Failed to create activity:', err);
            throw err;
        }
    }, [queryClient, emitActivityEvent]);

    const updateActivity = useCallback(async (rootId, activityId, updates, options = {}) => {
        try {
            const res = await fractalApi.updateActivity(rootId, activityId, updates);
            const updated = res.data;

            queryClient.setQueryData(queryKeys.activities(rootId), (prev = []) => {
                if (!Array.isArray(prev)) return prev;
                return prev.map((item) => item.id === activityId ? { ...item, ...updated } : item);
            });

            emitActivityEvent('activity.updated', { rootId, activityId, activity: updated });
            emitActivityEvent('activities.changed', { rootId, action: 'updated', activityId, activity: updated });

            if (options?.action === 'regroup') {
                const targetGroupName = options?.groupName || 'Ungrouped';
                notify.success(`Moved "${updated?.name || 'Untitled'}" to ${targetGroupName}`);
            } else {
                notify.success(`Updated activity "${updated?.name || 'Untitled'}"`);
            }

            return updated;
        } catch (err) {
            console.error('Failed to update activity:', err);
            throw err;
        }
    }, [queryClient, emitActivityEvent]);

    const deleteActivity = useCallback(async (rootId, activityId) => {
        try {
            const currentActivities = queryClient.getQueryData(queryKeys.activities(rootId));
            const deletedActivity = Array.isArray(currentActivities)
                ? currentActivities.find((item) => item.id === activityId)
                : null;

            await fractalApi.deleteActivity(rootId, activityId);

            queryClient.setQueryData(queryKeys.activities(rootId), (prev = []) => {
                if (!Array.isArray(prev)) return prev;
                return prev.filter((item) => item.id !== activityId);
            });

            emitActivityEvent('activity.deleted', { rootId, activityId, activity: deletedActivity || null });
            emitActivityEvent('activities.changed', { rootId, action: 'deleted', activityId, activity: deletedActivity || null });
            notify.success(`Deleted activity "${deletedActivity?.name || 'Untitled'}"`);
        } catch (err) {
            console.error('Failed to delete activity:', err);
            throw err;
        }
    }, [queryClient, emitActivityEvent]);

    const createActivityGroup = useCallback(async (rootId, data) => {
        try {
            const res = await fractalApi.createActivityGroup(rootId, data);
            const created = res.data;

            queryClient.setQueryData(queryKeys.activityGroups(rootId), (prev = []) => {
                const next = Array.isArray(prev) ? [...prev] : [];
                if (!created?.id || next.some((item) => item.id === created.id)) return next;
                next.push(created);
                return next;
            });

            return created;
        } catch (err) {
            console.error('Failed to create activity group:', err);
            throw err;
        }
    }, [queryClient]);

    const updateActivityGroup = useCallback(async (rootId, groupId, data) => {
        try {
            const res = await fractalApi.updateActivityGroup(rootId, groupId, data);
            const updated = res.data;

            queryClient.setQueryData(queryKeys.activityGroups(rootId), (prev = []) => {
                if (!Array.isArray(prev)) return prev;
                return prev.map((item) => item.id === groupId ? { ...item, ...updated } : item);
            });

            return updated;
        } catch (err) {
            console.error('Failed to update activity group:', err);
            throw err;
        }
    }, [queryClient]);

    const setActivityGroupGoals = useCallback(async (rootId, groupId, goalIds) => {
        try {
            const res = await fractalApi.setActivityGroupGoals(rootId, groupId, goalIds);
            const updated = res.data;

            if (updated?.id) {
                queryClient.setQueryData(queryKeys.activityGroups(rootId), (prev = []) => {
                    if (!Array.isArray(prev)) return prev;
                    return prev.map((item) => item.id === groupId ? { ...item, ...updated } : item);
                });
            } else {
                await queryClient.invalidateQueries({ queryKey: queryKeys.activityGroups(rootId) });
            }

            return updated;
        } catch (err) {
            console.error('Failed to set activity group goals:', err);
            throw err;
        }
    }, [queryClient]);

    const deleteActivityGroup = useCallback(async (rootId, groupId) => {
        try {
            await fractalApi.deleteActivityGroup(rootId, groupId);

            queryClient.setQueryData(queryKeys.activityGroups(rootId), (prev = []) => {
                if (!Array.isArray(prev)) return prev;
                return prev.filter((item) => item.id !== groupId);
            });

            await queryClient.invalidateQueries({ queryKey: queryKeys.activities(rootId) });
        } catch (err) {
            console.error('Failed to delete activity group:', err);
            throw err;
        }
    }, [queryClient]);

    const reorderActivityGroups = useCallback(async (rootId, groupIds) => {
        try {
            await fractalApi.reorderActivityGroups(rootId, groupIds);
            await queryClient.invalidateQueries({ queryKey: queryKeys.activityGroups(rootId) });
        } catch (err) {
            console.error('Failed to reorder activity groups:', err);
            throw err;
        }
    }, [queryClient]);

    const value = useMemo(() => ({
        createActivity,
        updateActivity,
        deleteActivity,
        createActivityGroup,
        updateActivityGroup,
        deleteActivityGroup,
        reorderActivityGroups,
        setActivityGroupGoals,
    }), [
        createActivity,
        updateActivity,
        deleteActivity,
        createActivityGroup,
        updateActivityGroup,
        deleteActivityGroup,
        reorderActivityGroups,
        setActivityGroupGoals,
    ]);

    return (
        <ActivitiesContext.Provider value={value}>
            {children}
        </ActivitiesContext.Provider>
    );
}

export function useActivities() {
    const context = useContext(ActivitiesContext);
    if (!context) {
        throw new Error('useActivities must be used within an ActivitiesProvider');
    }
    return context;
}

export default ActivitiesContext;
