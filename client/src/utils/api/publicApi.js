import { API_BASE, axios } from './core';

export const publicApi = {
    getLandingExamples: () => axios.get(`${API_BASE}/public/landing-examples`, {
        params: { _: Date.now() },
    }),
    createBetaSignup: (data) => axios.post(`${API_BASE}/public/beta-signups`, data),
};
