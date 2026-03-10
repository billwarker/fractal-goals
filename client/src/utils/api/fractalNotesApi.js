import { API_BASE, axios, buildQueryString } from './core';

export const fractalNotesApi = {
    getSessionNotes: (rootId, sessionId) => axios.get(`${API_BASE}/${rootId}/sessions/${sessionId}/notes`),
    getPreviousSessionNotes: (rootId, sessionId) =>
        axios.get(`${API_BASE}/${rootId}/sessions/${sessionId}/previous-session-notes`),
    getActivityInstanceNotes: (rootId, instanceId) =>
        axios.get(`${API_BASE}/${rootId}/activity-instances/${instanceId}/notes`),
    getActivityDefinitionNotes: (rootId, activityId, options = {}) =>
        axios.get(
            `${API_BASE}/${rootId}/activities/${activityId}/notes${buildQueryString(options, { excludeSession: 'exclude_session' })}`
        ),
    getActivityHistory: (rootId, activityId, options = {}) =>
        axios.get(
            `${API_BASE}/${rootId}/activities/${activityId}/history${buildQueryString(options, { excludeSession: 'exclude_session' })}`
        ),
    createNote: (rootId, data) => axios.post(`${API_BASE}/${rootId}/notes`, data),
    createNanoGoalNote: (rootId, data) => axios.post(`${API_BASE}/${rootId}/nano-goal-notes`, data),
    updateNote: (rootId, noteId, data) => axios.put(`${API_BASE}/${rootId}/notes/${noteId}`, data),
    deleteNote: (rootId, noteId) => axios.delete(`${API_BASE}/${rootId}/notes/${noteId}`),
};
