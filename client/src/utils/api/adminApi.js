import { API_BASE, axios } from './core';

export const adminApi = {
    getSummary: () => axios.get(`${API_BASE}/admin/summary`),
    getUsers: (params = {}) => axios.get(`${API_BASE}/admin/users`, { params }),
    createUser: (data) => axios.post(`${API_BASE}/admin/users`, data),
    updateUser: (userId, data) => axios.patch(`${API_BASE}/admin/users/${userId}`, data),
    deleteUser: (userId) => axios.delete(`${API_BASE}/admin/users/${userId}`),
    getInviteKeys: () => axios.get(`${API_BASE}/admin/invite-keys`),
    createInviteKey: (data) => axios.post(`${API_BASE}/admin/invite-keys`, data),
    revokeInviteKey: (inviteId) => axios.patch(`${API_BASE}/admin/invite-keys/${inviteId}/revoke`),
};
