import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../core', () => ({
    API_BASE: '/api',
    axios: {
        delete: vi.fn(),
        get: vi.fn(),
        post: vi.fn(),
    },
}));

import { axios } from '../core';
import { agentApi } from '../agentApi';

afterEach(() => vi.resetAllMocks());

const cases = [
    ['list connections', () => agentApi.listConnections(), 'get', ['/api/agent/connections']],
    ['revoke connection', () => agentApi.revokeConnection('grant/1'), 'delete', ['/api/agent/connections/grant%2F1']],
    ['get scoped context', () => agentApi.getContext('root 1'), 'get', ['/api/agent/context/root%201']],
    ['create task', () => agentApi.createTask({ request: 'plan' }), 'post', ['/api/agent/tasks', { request: 'plan' }]],
    ['list tasks for all roots', () => agentApi.listTasks(), 'get', ['/api/agent/tasks', { params: {} }]],
    ['list tasks for a root', () => agentApi.listTasks('root-1'), 'get', ['/api/agent/tasks', { params: { root_id: 'root-1' } }]],
    ['list task proposals', () => agentApi.listTaskProposals('task/1'), 'get', ['/api/agent/tasks/task%2F1/proposals']],
    ['decide proposal', () => agentApi.decideProposal('proposal/1', { decision: 'approve' }), 'post', ['/api/agent/proposals/proposal%2F1/decision', { decision: 'approve' }]],
    ['list runs for all roots', () => agentApi.listRuns(), 'get', ['/api/agent/runs', { params: {} }]],
    ['list runs for a root', () => agentApi.listRuns('root-1'), 'get', ['/api/agent/runs', { params: { root_id: 'root-1' } }]],
    ['cancel run', () => agentApi.cancelRun('run/1'), 'post', ['/api/agent/runs/run%2F1/cancel']],
    ['create undo proposal', () => agentApi.createUndoProposal('run/1'), 'post', ['/api/agent/runs/run%2F1/undo-proposal']],
    ['get change cursor', () => agentApi.getChangeCursor('root/1'), 'get', ['/api/agent/changes/root%2F1']],
    ['list embedded providers', () => agentApi.listEmbeddedProviders(), 'get', ['/api/agent/embedded/providers']],
    ['list embedded conversations', () => agentApi.listEmbeddedConversations('root-1'), 'get', ['/api/agent/embedded/conversations', { params: { root_id: 'root-1' } }]],
    ['get embedded conversation', () => agentApi.getEmbeddedConversation('conversation/1'), 'get', ['/api/agent/embedded/conversations/conversation%2F1']],
    ['start embedded conversation', () => agentApi.startEmbeddedConversation({ root_id: 'root-1' }), 'post', ['/api/agent/embedded/conversations', { root_id: 'root-1' }]],
    ['send embedded message', () => agentApi.sendEmbeddedMessage('conversation/1', { text: 'hello' }), 'post', ['/api/agent/embedded/conversations/conversation%2F1/messages', { text: 'hello' }]],
    ['cancel embedded run', () => agentApi.cancelEmbeddedRun('run/1'), 'post', ['/api/agent/embedded/runs/run%2F1/cancel']],
];

it.each(cases)('%s maps to the authenticated agent API contract', (_name, invoke, method, args) => {
    invoke();

    expect(axios[method]).toHaveBeenCalledWith(...args);
});
