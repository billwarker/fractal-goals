import { API_BASE, axios } from './core';

export const fractalProgramsApi = {
    getPrograms: (rootId) => axios.get(`${API_BASE}/${rootId}/programs`),
    getProgram: (rootId, programId) => axios.get(`${API_BASE}/${rootId}/programs/${programId}`),
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
    attachGoalToBlock: (rootId, programId, blockId, data) =>
        axios.post(`${API_BASE}/${rootId}/programs/${programId}/blocks/${blockId}/goals`, data),
    deleteBlockDay: (rootId, programId, blockId, dayId) =>
        axios.delete(`${API_BASE}/${rootId}/programs/${programId}/blocks/${blockId}/days/${dayId}`),
    getActiveProgramDays: (rootId) => axios.get(`${API_BASE}/${rootId}/programs/active-days`),
};
