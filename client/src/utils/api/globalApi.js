import { API_BASE, axios } from './core';

export const globalApi = {
    getAllFractals: () => axios.get(`${API_BASE}/fractals`),
    createFractal: (data) => axios.post(`${API_BASE}/fractals`, data),
    // The welcome flow: a fractal and its first long-term goals in one request, safe to retry.
    quickstartFractal: (data, idempotencyKey) => axios.post(`${API_BASE}/fractals/quickstart`, data, {
        headers: { 'Idempotency-Key': idempotencyKey },
    }),
    deleteFractal: (rootId) => axios.delete(`${API_BASE}/fractals/${rootId}`),
    getGoalLevels: (rootId) => axios.get(`${API_BASE}/goal-levels`, { params: rootId ? { root_id: rootId } : {} }),
    updateGoalLevel: (levelId, data) => axios.put(`${API_BASE}/goal-levels/${levelId}`, data),
    resetGoalLevel: (levelId) => axios.delete(`${API_BASE}/goal-levels/${levelId}`),
    getFeatureFlags: () => axios.get(`${API_BASE}/feature-flags`),
    // Reachability only: no auth, no database.
    probeHealth: ({ timeout = 5000 } = {}) => axios.get(`${API_BASE}/healthz`, { timeout, _skipAuth: true, _skipWarmth: true }),
    getAnalyticsCatalog: () => axios.get(`${API_BASE}/analytics/catalog`),
    runAnalyticsQuery: (querySpec) => axios.post(`${API_BASE}/analytics/query/run`, { query_spec: querySpec }),
    getAnalyticsQueryProfiles: () => axios.get(`${API_BASE}/analytics/query-profiles`),
    createAnalyticsQueryProfile: (data) => axios.post(`${API_BASE}/analytics/query-profiles`, data),
    updateAnalyticsQueryProfile: (profileId, data) => axios.patch(`${API_BASE}/analytics/query-profiles/${profileId}`, data),
    deleteAnalyticsQueryProfile: (profileId) => axios.delete(`${API_BASE}/analytics/query-profiles/${profileId}`),
};
