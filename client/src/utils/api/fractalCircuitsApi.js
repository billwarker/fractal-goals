import { API_BASE, axios } from './core';

export const fractalCircuitsApi = {
    getCircuits: (rootId, params = {}) => axios.get(`${API_BASE}/${rootId}/circuits`, { params }),
    createCircuit: (rootId, data) => axios.post(`${API_BASE}/${rootId}/circuits`, data),
    updateCircuit: (rootId, circuitId, data) => axios.patch(`${API_BASE}/${rootId}/circuits/${circuitId}`, data),
    archiveCircuit: (rootId, circuitId) => axios.delete(`${API_BASE}/${rootId}/circuits/${circuitId}`),
    getSessionCircuitRuns: (rootId, sessionId) => axios.get(`${API_BASE}/${rootId}/sessions/${sessionId}/circuit-runs`),
    createCircuitRun: (rootId, sessionId, data) => axios.post(`${API_BASE}/${rootId}/sessions/${sessionId}/circuit-runs`, data),
    deleteCircuitRun: (rootId, runId) => axios.delete(`${API_BASE}/${rootId}/circuit-runs/${runId}`),
    startCircuitRun: (rootId, runId) => axios.post(`${API_BASE}/${rootId}/circuit-runs/${runId}/start`),
    completeCircuitRun: (rootId, runId) => axios.post(`${API_BASE}/${rootId}/circuit-runs/${runId}/complete`),
    updateCircuitRunTiming: (rootId, runId, data) => axios.patch(
        `${API_BASE}/${rootId}/circuit-runs/${runId}/timing`,
        data,
    ),
    addCircuitRound: (rootId, runId) => axios.post(
        `${API_BASE}/${rootId}/circuit-runs/${runId}/rounds`,
    ),
    deleteCircuitRound: (rootId, runId, roundId) => axios.delete(
        `${API_BASE}/${rootId}/circuit-runs/${runId}/rounds/${roundId}`,
    ),
    updateCircuitMemberMetrics: (rootId, runId, memberId, metrics) => axios.patch(
        `${API_BASE}/${rootId}/circuit-runs/${runId}/members/${memberId}/metrics`,
        { metrics },
    ),
    cascadeCircuitMemberMetric: (rootId, runId, memberId, metricId, splitId = null) => axios.post(
        `${API_BASE}/${rootId}/circuit-runs/${runId}/members/${memberId}/metrics/cascade`,
        { metric_id: metricId, ...(splitId ? { split_id: splitId } : {}) },
    ),
    updateCircuitRunTag: (rootId, runId, data) => axios.patch(
        `${API_BASE}/${rootId}/circuit-runs/${runId}/tags`,
        data,
    ),
    updateCircuitRoundTag: (rootId, runId, roundId, data) => axios.patch(
        `${API_BASE}/${rootId}/circuit-runs/${runId}/rounds/${roundId}/tags`,
        data,
    ),
};
