// @ts-check
import { API_BASE, axios } from './core';

const ENTITY_PATHS = {
    goal: 'goals',
    note: 'notes',
    program: 'programs',
    template: 'session-templates',
    activity: 'activities',
    session: 'sessions',
};

export const syncApi = {
    getCursor: () => axios.get(`${API_BASE}/sync/cursor`),
    getConflicts: () => axios.get(`${API_BASE}/sync/conflicts`),
    /** @param {string} id */
    resolveConflict: (id) => axios.post(`${API_BASE}/sync/conflicts/${id}/resolve`),
    /**
     * Put a field back to the value that was set aside: an ordinary edit.
     * @param {{ root_id: string, type: string, entity_id: string, field: string, lost_value: string | null }} conflict
     */
    restoreConflict: ({ root_id: rootId, type, entity_id: entityId, field, lost_value: value }) => axios.put(
        `${API_BASE}/${rootId}/${ENTITY_PATHS[/** @type {keyof typeof ENTITY_PATHS} */ (type)]}/${entityId}`,
        { [field]: value },
    ),
    getDevices: () => axios.get(`${API_BASE}/auth/devices`),
    /** @param {string} id */
    revokeDevice: (id) => axios.delete(`${API_BASE}/auth/devices/${id}`),
    /** @param {string} cursor */
    getChangedIds: (cursor) => axios.get(`${API_BASE}/sync/changes`, { params: { cursor, view: 'ids', limit: 200 } }),
};
