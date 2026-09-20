import { API_BASE, axios } from './core';

const agentPath = `${API_BASE}/agent`;

export const agentApi = {
    listConnections: () => axios.get(`${agentPath}/connections`),
    revokeConnection: (grantId) => axios.delete(`${agentPath}/connections/${encodeURIComponent(grantId)}`),
    getContext: (rootId) => axios.get(`${agentPath}/context/${encodeURIComponent(rootId)}`),
    createTask: (data) => axios.post(`${agentPath}/tasks`, data),
    listTasks: (rootId) => axios.get(`${agentPath}/tasks`, { params: rootId ? { root_id: rootId } : {} }),
    listTaskProposals: (taskId) => axios.get(`${agentPath}/tasks/${encodeURIComponent(taskId)}/proposals`),
    decideProposal: (proposalId, data) => axios.post(
        `${agentPath}/proposals/${encodeURIComponent(proposalId)}/decision`,
        data,
    ),
    listRuns: (rootId) => axios.get(`${agentPath}/runs`, { params: rootId ? { root_id: rootId } : {} }),
    cancelRun: (runId) => axios.post(`${agentPath}/runs/${encodeURIComponent(runId)}/cancel`),
    createUndoProposal: (runId) => axios.post(`${agentPath}/runs/${encodeURIComponent(runId)}/undo-proposal`),
    getChangeCursor: (rootId) => axios.get(`${agentPath}/changes/${encodeURIComponent(rootId)}`),
    listEmbeddedProviders: () => axios.get(`${agentPath}/embedded/providers`),
    listEmbeddedConversations: (rootId) => axios.get(`${agentPath}/embedded/conversations`, { params: { root_id: rootId } }),
    getEmbeddedConversation: (conversationId) => axios.get(`${agentPath}/embedded/conversations/${encodeURIComponent(conversationId)}`),
    startEmbeddedConversation: (data) => axios.post(`${agentPath}/embedded/conversations`, data),
    sendEmbeddedMessage: (conversationId, data) => axios.post(`${agentPath}/embedded/conversations/${encodeURIComponent(conversationId)}/messages`, data),
    cancelEmbeddedRun: (runId) => axios.post(`${agentPath}/embedded/runs/${encodeURIComponent(runId)}/cancel`),
};
