import { API_BASE, axios } from './core';

export const fractalActivitiesApi = {
    getActivityGroups: (rootId) => axios.get(`${API_BASE}/${rootId}/activity-groups`),
    createActivityGroup: (rootId, data) => axios.post(`${API_BASE}/${rootId}/activity-groups`, data),
    updateActivityGroup: (rootId, groupId, data) =>
        axios.put(`${API_BASE}/${rootId}/activity-groups/${groupId}`, data),
    setActivityGroupGoals: (rootId, groupId, goalIds) =>
        axios.post(`${API_BASE}/${rootId}/activity-groups/${groupId}/goals`, { goal_ids: goalIds }),
    reorderActivityGroups: (rootId, groupIds) =>
        axios.put(`${API_BASE}/${rootId}/activity-groups/reorder`, { group_ids: groupIds }),
    deleteActivityGroup: (rootId, groupId) => axios.delete(`${API_BASE}/${rootId}/activity-groups/${groupId}`),
    getActivities: (rootId) => axios.get(`${API_BASE}/${rootId}/activities`),
    createActivity: (rootId, data) => axios.post(`${API_BASE}/${rootId}/activities`, data),
    updateActivity: (rootId, activityId, data) => axios.put(`${API_BASE}/${rootId}/activities/${activityId}`, data),
    deleteActivity: (rootId, activityId) => axios.delete(`${API_BASE}/${rootId}/activities/${activityId}`),
    getActivityGoals: (rootId, activityId) => axios.get(`${API_BASE}/${rootId}/activities/${activityId}/goals`),
    setActivityGoals: (rootId, activityId, goalIds) =>
        axios.post(`${API_BASE}/${rootId}/activities/${activityId}/goals`, { goal_ids: goalIds }),
    removeActivityGoal: (rootId, activityId, goalId) =>
        axios.delete(`${API_BASE}/${rootId}/activities/${activityId}/goals/${goalId}`),
    createActivityInstance: (rootId, data) => axios.post(`${API_BASE}/${rootId}/activity-instances`, data),
    startActivityTimer: (rootId, instanceId, data = {}) =>
        axios.post(`${API_BASE}/${rootId}/activity-instances/${instanceId}/start`, data),
    completeActivityInstance: (rootId, instanceId, data = {}) =>
        axios.post(`${API_BASE}/${rootId}/activity-instances/${instanceId}/complete`, data),
    updateActivityInstance: (rootId, instanceId, data) =>
        axios.put(`${API_BASE}/${rootId}/activity-instances/${instanceId}`, data),
    getActivityInstances: (rootId) => axios.get(`${API_BASE}/${rootId}/activity-instances`),
};
