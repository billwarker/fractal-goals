import { API_BASE, axios, buildQueryString } from './core';

/** Notes page feed/heatmap parameters; the server validates them (services/note_filter_spec.py). */
function noteFeedQuery(params) {
    const query = new URLSearchParams();
    const list = (key, values) => { if (values?.length) query.set(key, values.join(',')); };
    list('context_types', params.context_types);
    if (params.context_id) query.set('context_id', params.context_id);
    if (params.text) query.set('text', params.text);
    list('categories', params.categories);
    list('goal_ids', params.goal_ids);
    list('activity_definition_ids', params.activity_definition_ids);
    list('activity_group_ids', params.activity_group_ids);
    if (params.pinned_only) query.set('pinned_only', 'true');
    list('filters', params.saved_filter_ids);
    if (params.day) query.set('day', params.day);
    if (params.timezone) query.set('timezone', params.timezone);
    if (params.page != null) query.set('page', params.page);
    if (params.page_size != null) query.set('page_size', params.page_size);
    const qs = query.toString();
    return qs ? `?${qs}` : '';
}

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
    getInstagramOembed: (url) =>
        axios.get(`${API_BASE}/oembed/instagram?url=${encodeURIComponent(url)}`),
    createNote: (rootId, data) => axios.post(`${API_BASE}/${rootId}/notes`, data),
    updateNote: (rootId, noteId, data) => axios.put(`${API_BASE}/${rootId}/notes/${noteId}`, data),
    deleteNote: (rootId, noteId) => axios.delete(`${API_BASE}/${rootId}/notes/${noteId}`),
    getGoalNotes: (rootId, goalId, options = {}) =>
        axios.get(`${API_BASE}/${rootId}/goals/${goalId}/notes${buildQueryString(options, {
            includeDescendants: 'include_descendants',
            includeGoalNotes: 'include_goal_notes',
            includeActivityInstanceNotes: 'include_activity_instance_notes',
        })}`),
    getAllNotes: (rootId, params = {}) => axios.get(`${API_BASE}/${rootId}/notes${noteFeedQuery(params)}`),
    getNotesHeatmap: (rootId, params = {}) => axios.get(`${API_BASE}/${rootId}/notes/heatmap${noteFeedQuery(params)}`),
    listNoteFilters: (rootId) => axios.get(`${API_BASE}/${rootId}/note-filters`),
    createNoteFilter: (rootId, data) => axios.post(`${API_BASE}/${rootId}/note-filters`, data),
    updateNoteFilter: (rootId, filterId, data) => axios.put(`${API_BASE}/${rootId}/note-filters/${filterId}`, data),
    deleteNoteFilter: (rootId, filterId) => axios.delete(`${API_BASE}/${rootId}/note-filters/${filterId}`),
    pinNote: (rootId, noteId) => axios.put(`${API_BASE}/${rootId}/notes/${noteId}/pin`),
    unpinNote: (rootId, noteId) => axios.put(`${API_BASE}/${rootId}/notes/${noteId}/unpin`),
};
