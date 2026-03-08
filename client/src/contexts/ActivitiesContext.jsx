import React, { createContext, useContext, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import notify from '../utils/notify';
import { queryKeys } from '../hooks/queryKeys';

const ActivitiesContext = createContext();

export function ActivitiesProvider({ children }) {
    const queryClient = useQueryClient();
    const [activeRootId, setActiveRootId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const activitiesQuery = useQuery({
        queryKey: queryKeys.activities(activeRootId),
        queryFn: async () => {
            const res = await fractalApi.getActivities(activeRootId);
            return res.data || [];
        },
        enabled: Boolean(activeRootId),
    });

    const activityGroupsQuery = useQuery({
        queryKey: queryKeys.activityGroups(activeRootId),
        queryFn: async () => {
            const res = await fractalApi.getActivityGroups(activeRootId);
            return res.data || [];
        },
        enabled: Boolean(activeRootId),
    });

    const emitActivityEvent = useCallback((eventName, detail) => {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(new CustomEvent(eventName, { detail }));
    }, []);

    // Fetch all activities for a root goal
    const fetchActivities = useCallback(async (rootId) => {
        if (!rootId) return;

        try {
            setLoading(true);
            setError(null);
            setActiveRootId(rootId);
            return await queryClient.fetchQuery({
                queryKey: queryKeys.activities(rootId),
                queryFn: async () => {
                    const res = await fractalApi.getActivities(rootId);
                    return res.data || [];
                },
            });
        } catch (err) {
            console.error('Failed to fetch activities:', err);
            setError('Failed to load activities');
            return [];
        } finally {
            setLoading(false);
        }
    }, [queryClient]);

    // Create a new activity
    const createActivity = useCallback(async (rootId, activityData) => {
        try {
            setError(null);
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
            setError(err?.response?.data?.error || 'Failed to create activity');
            throw err;
        }
    }, [queryClient, emitActivityEvent]);

    // Update an existing activity
    const updateActivity = useCallback(async (rootId, activityId, updates, options = {}) => {
        try {
            setError(null);
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
            setError(err?.response?.data?.error || 'Failed to update activity');
            throw err;
        }
    }, [queryClient, emitActivityEvent]);

    // Delete an activity
    const deleteActivity = useCallback(async (rootId, activityId) => {
        try {
            setError(null);
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
            setError(err?.response?.data?.error || 'Failed to delete activity');
            throw err;
        }
    }, [queryClient, emitActivityEvent]);

    // Fetch activity groups
    const fetchActivityGroups = useCallback(async (rootId) => {
        if (!rootId) return;
        try {
            setActiveRootId(rootId);
            return await queryClient.fetchQuery({
                queryKey: queryKeys.activityGroups(rootId),
                queryFn: async () => {
                    const res = await fractalApi.getActivityGroups(rootId);
                    return res.data || [];
                },
            });
        } catch (err) {
            console.error('Failed to fetch activity groups:', err);
            return [];
        }
    }, [queryClient]);

    // Create activity group
    const createActivityGroup = useCallback(async (rootId, data) => {
        try {
            const res = await fractalApi.createActivityGroup(rootId, data);
            await fetchActivityGroups(rootId);
            return res.data;
        } catch (err) {
            console.error('Failed to create activity group:', err);
            throw err;
        }
    }, [fetchActivityGroups]);

    // Update activity group
    const updateActivityGroup = useCallback(async (rootId, groupId, data) => {
        try {
            const res = await fractalApi.updateActivityGroup(rootId, groupId, data);
            await fetchActivityGroups(rootId);
            return res.data;
        } catch (err) {
            console.error('Failed to update activity group:', err);
            throw err;
        }
    }, [fetchActivityGroups]);

    // Set goals for an activity group
    const setActivityGroupGoals = useCallback(async (rootId, groupId, goalIds) => {
        try {
            const res = await fractalApi.setActivityGroupGoals(rootId, groupId, goalIds);
            await fetchActivityGroups(rootId);
            return res.data;
        } catch (err) {
            console.error('Failed to set activity group goals:', err);
            throw err;
        }
    }, [fetchActivityGroups]);

    // Delete activity group
    const deleteActivityGroup = useCallback(async (rootId, groupId) => {
        try {
            await fractalApi.deleteActivityGroup(rootId, groupId);
            await fetchActivityGroups(rootId);
            // Also refresh activities as their group_id might have been nulled?
            // Yes, backend unlinks them.
            await fetchActivities(rootId);
        } catch (err) {
            console.error('Failed to delete activity group:', err);
            throw err;
        }
    }, [fetchActivityGroups, fetchActivities]);

    // Reorder activity groups
    const reorderActivityGroups = useCallback(async (rootId, groupIds) => {
        try {
            await fractalApi.reorderActivityGroups(rootId, groupIds);
            await fetchActivityGroups(rootId);
        } catch (err) {
            console.error('Failed to reorder activity groups:', err);
            throw err;
        }
    }, [fetchActivityGroups]);

    // Get a specific activity by ID
    const getActivityById = useCallback((activityId) => {
        return (activitiesQuery.data || []).find((activity) => activity.id === activityId);
    }, [activitiesQuery.data]);

    const value = {
        activities: activitiesQuery.data || [],
        loading: loading || activitiesQuery.isLoading || activityGroupsQuery.isLoading,
        error,
        fetchActivities,
        createActivity,
        updateActivity,
        deleteActivity,
        getActivityById,
        activityGroups: activityGroupsQuery.data || [],
        fetchActivityGroups,
        createActivityGroup,
        updateActivityGroup,
        deleteActivityGroup,
        reorderActivityGroups,
        setActivityGroupGoals
    };

    return (
        <ActivitiesContext.Provider value={value}>
            {children}
        </ActivitiesContext.Provider>
    );
}

// Custom hook to use the ActivitiesContext
export function useActivities() {
    const context = useContext(ActivitiesContext);
    if (!context) {
        throw new Error('useActivities must be used within an ActivitiesProvider');
    }
    return context;
}

export default ActivitiesContext;
