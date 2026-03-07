import { API_BASE, axios, buildQueryString } from './core';

export const fractalSessionsApi = {
    getSessions: (rootId, options = {}) =>
        axios.get(`${API_BASE}/${rootId}/sessions${buildQueryString(options)}`),
    getSession: (rootId, sessionId) => axios.get(`${API_BASE}/${rootId}/sessions/${sessionId}`),
    createSession: (rootId, data) => axios.post(`${API_BASE}/${rootId}/sessions`, data),
    updateSession: (rootId, sessionId, data) => axios.put(`${API_BASE}/${rootId}/sessions/${sessionId}`, data),
    deleteSession: (rootId, sessionId) => axios.delete(`${API_BASE}/${rootId}/sessions/${sessionId}`),
    pauseSession: (rootId, sessionId) => axios.post(`${API_BASE}/${rootId}/timers/session/${sessionId}/pause`),
    resumeSession: (rootId, sessionId) => axios.post(`${API_BASE}/${rootId}/timers/session/${sessionId}/resume`),
    addSessionGoal: (rootId, sessionId, goalId, goalType = 'immediate') =>
        axios.post(`${API_BASE}/${rootId}/sessions/${sessionId}/goals`, { goal_id: goalId, goal_type: goalType }),
    getSessionMicroGoals: (rootId, sessionId) =>
        axios.get(`${API_BASE}/fractal/${rootId}/sessions/${sessionId}/micro-goals`),
    getSessionGoalsView: (rootId, sessionId) =>
        axios.get(`${API_BASE}/fractal/${rootId}/sessions/${sessionId}/goals-view`),
    getSessionActivities: (rootId, sessionId) => axios.get(`${API_BASE}/${rootId}/sessions/${sessionId}/activities`),
    addActivityToSession: (rootId, sessionId, data) =>
        axios.post(`${API_BASE}/${rootId}/sessions/${sessionId}/activities`, data),
    removeActivityFromSession: (rootId, sessionId, instanceId) =>
        axios.delete(`${API_BASE}/${rootId}/sessions/${sessionId}/activities/${instanceId}`),
    updateActivityMetrics: (rootId, sessionId, instanceId, data) =>
        axios.put(`${API_BASE}/${rootId}/sessions/${sessionId}/activities/${instanceId}/metrics`, data),
    getSessionTemplates: (rootId) => axios.get(`${API_BASE}/${rootId}/session-templates`),
    getSessionTemplate: (rootId, templateId) => axios.get(`${API_BASE}/${rootId}/session-templates/${templateId}`),
    createSessionTemplate: (rootId, data) => axios.post(`${API_BASE}/${rootId}/session-templates`, data),
    updateSessionTemplate: (rootId, templateId, data) =>
        axios.put(`${API_BASE}/${rootId}/session-templates/${templateId}`, data),
    deleteSessionTemplate: (rootId, templateId) =>
        axios.delete(`${API_BASE}/${rootId}/session-templates/${templateId}`),
};
