import { API_BASE, axios } from './core';

export const publicApi = {
    // Correctness-first fallback: the API response is no-store so it cannot
    // mask a newer static revision after a delivery recovery.
    getLandingExamples: () => axios.get(`${API_BASE}/public/landing-examples`),
    getStaticLandingExamples: (url) => axios.get(url, {
        withCredentials: false,
        timeout: 2000,
        _skipAuth: true,
    }),
    createBetaSignup: (data) => axios.post(`${API_BASE}/public/beta-signups`, data),
    // A short-lived read-only token for the live demo of the published examples.
    createDemoSession: () => axios.post(`${API_BASE}/public/demo-session`, {}, { _skipAuth: true }),
};
