import { API_BASE, axios } from './core';

export const legacyApi = {
    getGoals: () => axios.get(`${API_BASE}/goals`),
    createGoal: (data) => axios.post(`${API_BASE}/goals`, data),
    getAllSessions: () => axios.get(`${API_BASE}/practice-sessions`),
    createSession: (data) => axios.post(`${API_BASE}/goals/practice-session`, data),
};
