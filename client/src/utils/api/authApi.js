import { API_BASE, axios } from './core';

export const authApi = {
    signup: (data) => axios.post(`${API_BASE}/auth/signup`, data),
    login: (data) => axios.post(`${API_BASE}/auth/login`, data),
    forgotPassword: (data) => axios.post(`${API_BASE}/auth/password/forgot`, data),
    resetPassword: (data) => axios.post(`${API_BASE}/auth/password/reset`, data),
    logout: () => axios.post(`${API_BASE}/auth/logout`, {}),
    refresh: (token) => axios.post(
        `${API_BASE}/auth/refresh`,
        {},
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
    ),
    getCsrf: () => axios.get(`${API_BASE}/auth/csrf`),
    getMe: () => axios.get(`${API_BASE}/auth/me`),
    getAccountUsage: (params = {}) => axios.get(`${API_BASE}/auth/account/usage`, { params }),
    updatePreferences: (data) => axios.patch(`${API_BASE}/auth/preferences`, data),
    getOnboarding: (rootId = null) => axios.get(`${API_BASE}/auth/onboarding`, {
        params: rootId ? { root_id: rootId } : {},
    }),
    updateOnboarding: (data) => axios.patch(`${API_BASE}/auth/onboarding`, data),
    updatePassword: (data) => axios.put(`${API_BASE}/auth/account/password`, data),
    updateEmail: (data) => axios.put(`${API_BASE}/auth/account/email`, data),
    updateUsername: (data) => axios.put(`${API_BASE}/auth/account/username`, data),
    deleteAccount: (data) => axios.delete(`${API_BASE}/auth/account`, { data }),
};
