import { API_BASE, axios } from './core';

export const fractalActivitiesApi = {
    getFractalMetrics: (rootId) => axios.get(`${API_BASE}/${rootId}/fractal-metrics`),
    createFractalMetric: (rootId, data) => axios.post(`${API_BASE}/${rootId}/fractal-metrics`, data),
    updateFractalMetric: (rootId, metricId, data) =>
        axios.put(`${API_BASE}/${rootId}/fractal-metrics/${metricId}`, data),
    deleteFractalMetric: (rootId, metricId) => axios.delete(`${API_BASE}/${rootId}/fractal-metrics/${metricId}`),
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
    getActivityTagCatalog: (rootId, params = {}) =>
        axios.get(`${API_BASE}/${rootId}/activity-tags`, { params }),
    createActivityTagCatalogItem: (rootId, data) =>
        axios.post(`${API_BASE}/${rootId}/activity-tags`, data),
    updateActivityTagCatalogItem: (rootId, definitionId, data) =>
        axios.put(`${API_BASE}/${rootId}/activity-tags/${definitionId}`, data),
    archiveActivityTagCatalogItem: (rootId, definitionId, version) =>
        axios.post(`${API_BASE}/${rootId}/activity-tags/${definitionId}/archive`, { version }),
    restoreActivityTagCatalogItem: (rootId, definitionId, version) =>
        axios.post(`${API_BASE}/${rootId}/activity-tags/${definitionId}/restore`, { version }),
    getActivityTagImpact: (rootId, definitionId) =>
        axios.get(`${API_BASE}/${rootId}/activity-tags/${definitionId}/impact`),
    hardDeleteActivityTagCatalogItem: (rootId, definitionId, data) =>
        axios.post(`${API_BASE}/${rootId}/activity-tags/${definitionId}/hard-delete`, data),
    mergeActivityTagCatalogItems: (rootId, data) =>
        axios.post(`${API_BASE}/${rootId}/activity-tags/merge`, data),
    previewActivityTagCatalogMerge: (rootId, data) =>
        axios.post(`${API_BASE}/${rootId}/activity-tags/merge-preview`, data),
    replaceActivityInstanceTags: (rootId, instanceId, tagIds, version = null) =>
        axios.put(`${API_BASE}/${rootId}/activity-instances/${instanceId}/tags`, { tag_ids: tagIds, ...(version ? { version } : {}) }),
    replaceActivitySetTags: (rootId, setId, tagIds, version = null) =>
        axios.put(`${API_BASE}/${rootId}/activity-sets/${setId}/tags`, { tag_ids: tagIds, ...(version ? { version } : {}) }),
    createActivityProgressView: (rootId, activityId, data) =>
        axios.post(`${API_BASE}/${rootId}/activities/${activityId}/progress-views`, data),
    updateActivityProgressView: (rootId, activityId, viewId, data) =>
        axios.put(`${API_BASE}/${rootId}/activities/${activityId}/progress-views/${viewId}`, data),
    deleteActivityProgressView: (rootId, activityId, viewId) =>
        axios.delete(`${API_BASE}/${rootId}/activities/${activityId}/progress-views/${viewId}`),
    activateActivityProgressView: (rootId, activityId, viewId) =>
        axios.put(`${API_BASE}/${rootId}/activities/${activityId}/active-progress-view`, { view_id: viewId }),
    getActivityProgressTimeline: (rootId, activityId, params = {}) =>
        axios.get(`${API_BASE}/${rootId}/activities/${activityId}/progress-timeline`, { params }),
    queryActivityProgress: (rootId, activityId, data) =>
        axios.post(`${API_BASE}/${rootId}/activities/${activityId}/progress-query`, data),
};
