import { API_BASE, axios } from './core';

export const publicApi = {
    createBetaSignup: (data) => axios.post(`${API_BASE}/public/beta-signups`, data),
};
