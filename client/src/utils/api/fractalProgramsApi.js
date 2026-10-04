import { API_BASE, axios } from './core';

export const fractalProgramsApi = {
    getPrograms: (rootId, params) => axios.get(`${API_BASE}/${rootId}/programs`, params ? { params } : undefined),
    getProgramSummaries: (rootId, params) => axios.get(`${API_BASE}/${rootId}/programs/calendar`, params ? { params } : undefined),
    getProgramCalendarFeed: (rootId, params) => axios.get(
        `${API_BASE}/${rootId}/programs/calendar-feed`, { params },
    ),
    getProgram: (rootId, programId, params) => axios.get(`${API_BASE}/${rootId}/programs/${programId}`, params ? { params } : undefined),
    getProgramMetrics: (rootId, programId, params = {}) => axios.get(
        `${API_BASE}/${rootId}/programs/${programId}/metrics`, { params },
    ),
    getProgramDayReadModel: (rootId, programId, params) => axios.get(
        `${API_BASE}/${rootId}/programs/${programId}/day-read-model`, { params },
    ),
    updateProgramDayStatuses: (rootId, programId, data) => axios.patch(
        `${API_BASE}/${rootId}/programs/${programId}/day-statuses`, data,
    ),
    updateProgramDaySessionCredit: (rootId, programId, data) => axios.put(
        `${API_BASE}/${rootId}/programs/${programId}/day-session-credits`, data,
    ),
    createProgram: (rootId, data) => axios.post(`${API_BASE}/${rootId}/programs`, data),
    updateProgram: (rootId, programId, data) => axios.put(`${API_BASE}/${rootId}/programs/${programId}`, data),
    deleteProgram: (rootId, programId) => axios.delete(`${API_BASE}/${rootId}/programs/${programId}`),
    getProgramSessionCount: (rootId, programId) =>
        axios.get(`${API_BASE}/${rootId}/programs/${programId}/session-count`),
    createBlock: (rootId, programId, data) => axios.post(`${API_BASE}/${rootId}/programs/${programId}/blocks`, data),
    updateBlock: (rootId, programId, blockId, data) =>
        axios.put(`${API_BASE}/${rootId}/programs/${programId}/blocks/${blockId}`, data),
    deleteBlock: (rootId, programId, blockId) =>
        axios.delete(`${API_BASE}/${rootId}/programs/${programId}/blocks/${blockId}`),
    attachGoalToDay: (rootId, programId, blockId, dayId, data) =>
        axios.post(`${API_BASE}/${rootId}/programs/${programId}/blocks/${blockId}/days/${dayId}/goals`, data),
    addBlockDay: (rootId, programId, blockId, data) =>
        axios.post(`${API_BASE}/${rootId}/programs/${programId}/blocks/${blockId}/days`, data),
    updateBlockDay: (rootId, programId, blockId, dayId, data) =>
        axios.put(`${API_BASE}/${rootId}/programs/${programId}/blocks/${blockId}/days/${dayId}`, data),
    copyBlockDay: (rootId, programId, blockId, dayId, data) =>
        axios.post(`${API_BASE}/${rootId}/programs/${programId}/blocks/${blockId}/days/${dayId}/copy`, data),
    scheduleBlockDay: (rootId, programId, blockId, dayId, data) =>
        axios.post(`${API_BASE}/${rootId}/programs/${programId}/blocks/${blockId}/days/${dayId}/schedule`, data),
    unscheduleBlockDayOccurrence: (rootId, programId, blockId, dayId, data) =>
        axios.post(`${API_BASE}/${rootId}/programs/${programId}/blocks/${blockId}/days/${dayId}/unschedule`, data),
    attachGoalToBlock: (rootId, programId, blockId, data) =>
        axios.post(`${API_BASE}/${rootId}/programs/${programId}/blocks/${blockId}/goals`, data),
    setProgramGoalDeadline: (rootId, programId, data) =>
        axios.post(`${API_BASE}/${rootId}/programs/${programId}/goal-deadlines`, data),
    deleteBlockDay: (rootId, programId, blockId, dayId) =>
        axios.delete(`${API_BASE}/${rootId}/programs/${programId}/blocks/${blockId}/days/${dayId}`),
    getProgramPlanOccurrences: (rootId, programId, params = {}) => axios.get(
        `${API_BASE}/${rootId}/programs/${programId}/plan-occurrences`, { params },
    ),
    getProgramDayPlans: (rootId, programId, dayId, date, timezone = 'UTC') => axios.get(
        `${API_BASE}/${rootId}/programs/${programId}/days/${dayId}/plans`, { params: { date, timezone } },
    ),
    // Plan writes send the viewer's timezone: past program days (in local time) are read-only.
    saveProgramSessionPlan: (rootId, programId, dayId, templateId, date, data, timezone = 'UTC') => axios.put(
        `${API_BASE}/${rootId}/programs/${programId}/days/${dayId}/plans/${templateId}/${date}`, data,
        { params: { timezone } },
    ),
    resetProgramSessionPlan: (rootId, programId, dayId, templateId, date, timezone = 'UTC') => axios.delete(
        `${API_BASE}/${rootId}/programs/${programId}/days/${dayId}/plans/${templateId}/${date}`,
        { params: { timezone } },
    ),
    loadProgramSessionPlan: (rootId, programId, dayId, templateId, date, timezone = 'UTC') => axios.post(
        `${API_BASE}/${rootId}/programs/${programId}/days/${dayId}/plans/${templateId}/${date}/load`,
        null,
        { params: { timezone } },
    ),
    pullProgramSessionPlanTemplate: (rootId, programId, dayId, templateId, date, data, timezone = 'UTC') => axios.post(
        `${API_BASE}/${rootId}/programs/${programId}/days/${dayId}/plans/${templateId}/${date}/pull-template`,
        data,
        { params: { timezone } },
    ),
    getSessionPlanCandidates: (rootId, templateId, date) => axios.get(
        `${API_BASE}/${rootId}/session-plans/candidates`, { params: { template_id: templateId, date } },
    ),
    getProgramDayOptions: (rootId, date, timezone) => axios.get(
        `${API_BASE}/${rootId}/programs/day-options`,
        { params: { date, timezone } },
    ),
};
