import { API_BASE, axios } from './core';

export const telemetryApi = {
    recordEvents: (data) => axios.post(`${API_BASE}/telemetry/events`, data),
};
