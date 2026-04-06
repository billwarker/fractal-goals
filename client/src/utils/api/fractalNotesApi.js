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
    getGoalNotes: (rootId, goalId, options = {}) =>
        axios.get(`${API_BASE}/${rootId}/goals/${goalId}/notes${buildQueryString(options, { includeDescendants: 'include_descendants' })}`),
    getAllNotes: (rootId, params = {}) => {
        const query = new URLSearchParams();
        if (params.context_types && params.context_types.length) query.set('context_types', params.context_types.join(','));
        if (params.note_types && params.note_types.length) query.set('note_types', params.note_types.join(','));
        if (params.goal_id) query.set('goal_id', params.goal_id);
        if (params.activity_definition_ids && params.activity_definition_ids.length)
            params.activity_definition_ids.forEach(id => query.append('activity_definition_ids[]', id));
        if (params.activity_group_ids && params.activity_group_ids.length)
            params.activity_group_ids.forEach(id => query.append('activity_group_ids[]', id));
        if (params.pinned_only) query.set('pinned_only', 'true');
        if (params.search) query.set('search', params.search);
        if (params.date_from) query.set('date_from', params.date_from);
        if (params.date_to) query.set('date_to', params.date_to);
        if (params.page != null) query.set('page', params.page);
        if (params.page_size != null) query.set('page_size', params.page_size);
        const qs = query.toString();
        return axios.get(`${API_BASE}/${rootId}/notes${qs ? '?' + qs : ''}`);
    },
    pinNote: (rootId, noteId) => axios.put(`${API_BASE}/${rootId}/notes/${noteId}/pin`),
    unpinNote: (rootId, noteId) => axios.put(`${API_BASE}/${rootId}/notes/${noteId}/unpin`),
};
