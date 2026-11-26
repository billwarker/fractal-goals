import { usesCookies } from '../../platform';
import { API_BASE, axios, getNativeSession, refreshSession } from './core';

export const authApi = {
    signup: (data) => axios.post(`${API_BASE}/auth/signup`, data),
    login: async (data) => {
        const session = await getNativeSession();
        return session ? session.signIn(data) : axios.post(`${API_BASE}/auth/login`, data);
    },
    forgotPassword: (data) => axios.post(`${API_BASE}/auth/password/forgot`, data),
    resetPassword: (data) => axios.post(`${API_BASE}/auth/password/reset`, data),
    logout: async () => {
        const session = await getNativeSession();
        return session ? session.signOut() : axios.post(`${API_BASE}/auth/logout`, {});
    },
    revokeAllSessions: async () => {
        const response = await axios.post(`${API_BASE}/auth/sessions/revoke`, {});
        await (await getNativeSession())?.forget();
        return response;
    },
    refresh: (token) => refreshSession(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    getCsrf: async () => (usesCookies ? axios.get(`${API_BASE}/auth/csrf`) : null),
    getMe: () => axios.get(`${API_BASE}/auth/me`),
    acceptLegalDocuments: (data) => axios.post(`${API_BASE}/auth/legal/acceptance`, data),
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
    cancelAccountDeletion: () => axios.delete(`${API_BASE}/auth/account/deletion`),
    exportAccountData: (data) => axios.post(`${API_BASE}/auth/account/export`, data),
};
