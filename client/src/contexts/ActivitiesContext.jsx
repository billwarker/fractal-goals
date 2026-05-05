import React, { createContext, useContext, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { withNotify } from '../utils/mutationNotify';
import { queryKeys } from '../hooks/queryKeys';

const ActivitiesContext = createContext();

export function ActivitiesProvider({ children }) {
    const queryClient = useQueryClient();

    const createActivity = useMemo(() => withNotify(
        async (rootId, activityData) => {
            const res = await fractalApi.createActivity(rootId, activityData);
            const created = res.data;

            queryClient.setQueryData(queryKeys.activities(rootId), (prev = []) => {
                const next = Array.isArray(prev) ? [...prev] : [];
                if (!created?.id || next.some((item) => item.id === created.id)) return next;
                next.push(created);
                return next;
            });
            return created;
        },
        {
            success: (created) => `Created activity "${created?.name || 'Untitled'}"`,
            error: 'Failed to create activity',
            onError: (err) => {
                console.error('Failed to create activity:', err);
            },
        },
    ), [queryClient]);

    const updateActivity = useMemo(() => withNotify(
        async (rootId, activityId, updates) => {
            const res = await fractalApi.updateActivity(rootId, activityId, updates);
            const updated = res.data;

            queryClient.setQueryData(queryKeys.activities(rootId), (prev = []) => {
                if (!Array.isArray(prev)) return prev;
                return prev.map((item) => item.id === activityId ? { ...item, ...updated } : item);
            });
            await queryClient.invalidateQueries({ queryKey: ['session', rootId] });
            await queryClient.invalidateQueries({ queryKey: ['session-activities', rootId] });
            return updated;
        },
        {
            success: (updated, _rootId, _activityId, _updates, options = {}) => {
                if (options?.action === 'regroup') {
                    return `Moved "${updated?.name || 'Untitled'}" to ${options?.groupName || 'Ungrouped'}`;
                }
                return `Updated activity "${updated?.name || 'Untitled'}"`;
            },
            error: 'Failed to update activity',
            onError: (err) => {
                console.error('Failed to update activity:', err);
            },
        },
    ), [queryClient]);

    const deleteActivity = useMemo(() => withNotify(
        async (rootId, activityId) => {
            const currentActivities = queryClient.getQueryData(queryKeys.activities(rootId));
            const deletedActivity = Array.isArray(currentActivities)
                ? currentActivities.find((item) => item.id === activityId)
                : null;

            await fractalApi.deleteActivity(rootId, activityId);

            queryClient.setQueryData(queryKeys.activities(rootId), (prev = []) => {
                if (!Array.isArray(prev)) return prev;
                return prev.filter((item) => item.id !== activityId);
            });
            return deletedActivity;
        },
        {
            success: (deletedActivity) => `Deleted activity "${deletedActivity?.name || 'Untitled'}"`,
            error: 'Failed to delete activity',
            onError: (err) => {
                console.error('Failed to delete activity:', err);
            },
        },
    ), [queryClient]);

    const createActivityGroup = useMemo(() => withNotify(
        async (rootId, data) => {
            const res = await fractalApi.createActivityGroup(rootId, data);
            const created = res.data;

            queryClient.setQueryData(queryKeys.activityGroups(rootId), (prev = []) => {
                const next = Array.isArray(prev) ? [...prev] : [];
                if (!created?.id || next.some((item) => item.id === created.id)) return next;
                next.push(created);
                return next;
            });

            return created;
        },
        {
            success: (created) => `Created group "${created?.name || 'Untitled'}"`,
            error: 'Failed to create group',
            onError: (err) => {
                console.error('Failed to create activity group:', err);
            },
        },
    ), [queryClient]);

    const updateActivityGroup = useMemo(() => withNotify(
        async (rootId, groupId, data) => {
            const res = await fractalApi.updateActivityGroup(rootId, groupId, data);
            const updated = res.data;

            queryClient.setQueryData(queryKeys.activityGroups(rootId), (prev = []) => {
                if (!Array.isArray(prev)) return prev;
                return prev.map((item) => item.id === groupId ? { ...item, ...updated } : item);
            });

            return updated;
        },
        {
            success: (updated) => `Updated group "${updated?.name || 'Untitled'}"`,
            error: 'Failed to update group',
            onError: (err) => {
                console.error('Failed to update activity group:', err);
            },
        },
    ), [queryClient]);

    const setActivityGroupGoals = useMemo(() => withNotify(
        async (rootId, groupId, goalIds) => {
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
        },
        {
            success: null,
            error: 'Failed to update group goals',
            onError: (err) => {
                console.error('Failed to set activity group goals:', err);
            },
        },
    ), [queryClient]);

    const deleteActivityGroup = useMemo(() => withNotify(
        async (rootId, groupId) => {
            await fractalApi.deleteActivityGroup(rootId, groupId);

            queryClient.setQueryData(queryKeys.activityGroups(rootId), (prev = []) => {
                if (!Array.isArray(prev)) return prev;
                return prev.filter((item) => item.id !== groupId);
            });

            await queryClient.invalidateQueries({ queryKey: queryKeys.activities(rootId) });
        },
        {
            success: 'Deleted group',
            error: 'Failed to delete group',
            onError: (err) => {
                console.error('Failed to delete activity group:', err);
            },
        },
    ), [queryClient]);

    const reorderActivityGroups = useMemo(() => withNotify(
        async (rootId, groupIds) => {
            await fractalApi.reorderActivityGroups(rootId, groupIds);
            await queryClient.invalidateQueries({ queryKey: queryKeys.activityGroups(rootId) });
        },
        {
            success: null,
            error: 'Failed to reorder groups',
            onError: (err) => {
                console.error('Failed to reorder activity groups:', err);
            },
        },
    ), [queryClient]);

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
