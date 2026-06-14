import { API_BASE, axios } from './core';

export const publicApi = {
    // No cache-busting param: the endpoint serves short-lived public
    // Cache-Control so repeat visits render examples from the HTTP cache.
    getLandingExamples: () => axios.get(`${API_BASE}/public/landing-examples`),
    getStaticLandingExamples: (url) => axios.get(url, { withCredentials: false }),
    createBetaSignup: (data) => axios.post(`${API_BASE}/public/beta-signups`, data),
};
