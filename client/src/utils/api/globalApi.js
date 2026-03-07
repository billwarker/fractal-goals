import { API_BASE, axios } from './core';

export const globalApi = {
    getAllFractals: () => axios.get(`${API_BASE}/fractals`),
    createFractal: (data) => axios.post(`${API_BASE}/fractals`, data),
    deleteFractal: (rootId) => axios.delete(`${API_BASE}/fractals/${rootId}`),
    getGoalLevels: (rootId) => axios.get(`${API_BASE}/goal-levels`, { params: rootId ? { root_id: rootId } : {} }),
    updateGoalLevel: (levelId, data) => axios.put(`${API_BASE}/goal-levels/${levelId}`, data),
    resetGoalLevel: (levelId) => axios.delete(`${API_BASE}/goal-levels/${levelId}`),
};
