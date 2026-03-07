import { API_BASE, axios } from './core';

export const authApi = {
    signup: (data) => axios.post(`${API_BASE}/auth/signup`, data),
    login: (data) => axios.post(`${API_BASE}/auth/login`, data),
    getMe: () => axios.get(`${API_BASE}/auth/me`),
    updatePreferences: (data) => axios.patch(`${API_BASE}/auth/preferences`, data),
    updatePassword: (data) => axios.put(`${API_BASE}/auth/account/password`, data),
    updateEmail: (data) => axios.put(`${API_BASE}/auth/account/email`, data),
    updateUsername: (data) => axios.put(`${API_BASE}/auth/account/username`, data),
    deleteAccount: (data) => axios.delete(`${API_BASE}/auth/account`, { data }),
};
