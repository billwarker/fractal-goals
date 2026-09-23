import { API_BASE, axios } from './core';

export const fractalCalendarPeriodsApi = {
    getCalendarPeriods: (rootId, params) => axios.get(`${API_BASE}/${rootId}/calendar-periods`, { params }),
    createCalendarPeriod: (rootId, data) => axios.post(`${API_BASE}/${rootId}/calendar-periods`, data),
    updateCalendarPeriod: (rootId, periodId, data) => axios.put(`${API_BASE}/${rootId}/calendar-periods/${periodId}`, data),
    deleteCalendarPeriod: (rootId, periodId) => axios.delete(`${API_BASE}/${rootId}/calendar-periods/${periodId}`),
};
