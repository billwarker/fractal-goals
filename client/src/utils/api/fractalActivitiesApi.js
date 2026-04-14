import { API_BASE, axios } from './core';

export const fractalActivitiesApi = {
    getFractalMetrics: (rootId) => axios.get(`${API_BASE}/${rootId}/fractal-metrics`),
    createFractalMetric: (rootId, data) => axios.post(`${API_BASE}/${rootId}/fractal-metrics`, data),
    updateFractalMetric: (rootId, metricId, data) =>
        axios.put(`${API_BASE}/${rootId}/fractal-metrics/${metricId}`, data),
    deleteFractalMetric: (rootId, metricId) => axios.delete(`${API_BASE}/${rootId}/fractal-metrics/${metricId}`),
    getActivityModes: (rootId) => axios.get(`${API_BASE}/${rootId}/activity-modes`),
    createActivityMode: (rootId, data) => axios.post(`${API_BASE}/${rootId}/activity-modes`, data),
    updateActivityMode: (rootId, modeId, data) =>
        axios.put(`${API_BASE}/${rootId}/activity-modes/${modeId}`, data),
    deleteActivityMode: (rootId, modeId) => axios.delete(`${API_BASE}/${rootId}/activity-modes/${modeId}`),
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
    getActivityInstanceProgress: (rootId, instanceId) =>
        axios.get(`${API_BASE}/${rootId}/activity-instances/${instanceId}/progress`),
    getActivityProgressHistory: (rootId, activityDefId, params = {}) =>
        axios.get(`${API_BASE}/${rootId}/activities/${activityDefId}/progress-history`, { params }),
    recomputeAllProgress: (rootId) =>
        axios.post(`${API_BASE}/${rootId}/progress/recompute-all`),
};
