import { API_BASE, axios } from './core';

export const fractalProgramsApi = {
    getPrograms: (rootId, params) => axios.get(`${API_BASE}/${rootId}/programs`, params ? { params } : undefined),
    getProgram: (rootId, programId, params) => axios.get(`${API_BASE}/${rootId}/programs/${programId}`, params ? { params } : undefined),
    getProgramMetrics: (rootId, programId, params = {}) => axios.get(
        `${API_BASE}/${rootId}/programs/${programId}/metrics`, { params },
    ),
    getProgramDayReadModel: (rootId, programId, params) => axios.get(
        `${API_BASE}/${rootId}/programs/${programId}/day-read-model`, { params },
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
    getProgramDayOptions: (rootId, date, timezone) => axios.get(
        `${API_BASE}/${rootId}/programs/day-options`,
        { params: { date, timezone } },
    ),
};
