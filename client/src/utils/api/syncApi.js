// @ts-check
import { API_BASE, axios } from './core';

export const syncApi = {
    getCursor: () => axios.get(`${API_BASE}/sync/cursor`),
    /** @param {string} cursor */
    getChangedIds: (cursor) => axios.get(`${API_BASE}/sync/changes`, { params: { cursor, view: 'ids', limit: 200 } }),
};
