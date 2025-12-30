import React, { createContext, useContext, useState, useCallback } from 'react';
import { fractalApi } from '../utils/api';

const ActivitiesContext = createContext();

export function ActivitiesProvider({ children }) {
    const [activities, setActivities] = useState([]);
    const [activityGroups, setActivityGroups] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Fetch all activities for a root goal
    const fetchActivities = useCallback(async (rootId) => {
        if (!rootId) return;

        try {
            setLoading(true);
            setError(null);
            const res = await fractalApi.getActivities(rootId);
            setActivities(res.data);
        } catch (err) {
            console.error('Failed to fetch activities:', err);
            setError('Failed to load activities');
        } finally {
            setLoading(false);
        }
    }, []);

    // Create a new activity
    const createActivity = useCallback(async (rootId, activityData) => {
        try {
            setError(null);
            const res = await fractalApi.createActivity(rootId, activityData);
            // Refresh activities list
            await fetchActivities(rootId);
            return res.data;
        } catch (err) {
            console.error('Failed to create activity:', err);
            setError('Failed to create activity');
            throw err;
        }
    }, [fetchActivities]);

    // Update an existing activity
    const updateActivity = useCallback(async (rootId, activityId, updates) => {
        try {
            setError(null);
            const res = await fractalApi.updateActivity(rootId, activityId, updates);
            // Refresh activities list
            await fetchActivities(rootId);
            return res.data;
        } catch (err) {
            console.error('Failed to update activity:', err);
            setError('Failed to update activity');
            throw err;
        }
    }, [fetchActivities]);

    // Delete an activity
    const deleteActivity = useCallback(async (rootId, activityId) => {
        try {
            setError(null);
            await fractalApi.deleteActivity(rootId, activityId);
            // Refresh activities list
            await fetchActivities(rootId);
        } catch (err) {
            console.error('Failed to delete activity:', err);
            setError('Failed to delete activity');
            throw err;
        }
    }, [fetchActivities]);

    // Fetch activity groups
    const fetchActivityGroups = useCallback(async (rootId) => {
        if (!rootId) return;
        try {
            const res = await fractalApi.getActivityGroups(rootId);
            setActivityGroups(res.data);
        } catch (err) {
            console.error('Failed to fetch activity groups:', err);
        }
    }, []);

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
        return activities.find(a => a.id === activityId);
    }, [activities]);

    const value = {
        activities,
        loading,
        error,
        fetchActivities,
        createActivity,
        updateActivity,
        deleteActivity,
        getActivityById,
        activityGroups,
        fetchActivityGroups,
        createActivityGroup,
        updateActivityGroup,
        deleteActivityGroup,
        reorderActivityGroups
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
