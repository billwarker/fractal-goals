import { API_BASE, axios, buildQueryString } from './core';

export const fractalMetaApi = {
    getAnalyticsViews: (rootId) => axios.get(`${API_BASE}/roots/${rootId}/dashboards`),
    createAnalyticsView: (rootId, data) => axios.post(`${API_BASE}/roots/${rootId}/dashboards`, data),
    updateAnalyticsView: (rootId, dashboardId, data) => axios.put(`${API_BASE}/roots/${rootId}/dashboards/${dashboardId}`, data),
    deleteAnalyticsView: (rootId, dashboardId) => axios.delete(`${API_BASE}/roots/${rootId}/dashboards/${dashboardId}`),
    getLogs: (rootId, options = {}) => axios.get(`${API_BASE}/${rootId}/logs${buildQueryString(options)}`),
    clearLogs: (rootId) => axios.delete(`${API_BASE}/${rootId}/logs/clear`),
};
