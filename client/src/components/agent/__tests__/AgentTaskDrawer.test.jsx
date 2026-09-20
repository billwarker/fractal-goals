import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AgentTaskDrawer from '../AgentTaskDrawer';

const api = vi.hoisted(() => ({
    featureFlags: { current: { ai_agent_connectors: true, ai_agent_embedded: false } },
    listConnections: vi.fn(),
    getContext: vi.fn(),
    createTask: vi.fn(),
    listTasks: vi.fn(),
    listTaskProposals: vi.fn(),
    listRuns: vi.fn(),
    getChangeCursor: vi.fn(),
    decideProposal: vi.fn(),
    listEmbeddedProviders: vi.fn(),
    listEmbeddedConversations: vi.fn(),
    getEmbeddedConversation: vi.fn(),
    startEmbeddedConversation: vi.fn(),
    sendEmbeddedMessage: vi.fn(),
    cancelEmbeddedRun: vi.fn(),
}));

vi.mock('../../../utils/api', () => ({ agentApi: api }));
vi.mock('../../../hooks/useFeatureFlags', () => ({
    FEATURE_FLAGS: {
        aiAgentConnectors: 'ai_agent_connectors',
        aiAgentEmbedded: 'ai_agent_embedded',
    },
    isFeatureEnabled: (flags, key) => flags[key] === true,
    useFeatureFlags: () => ({ flags: api.featureFlags.current }),
}));

function renderDrawer() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, refetchInterval: false },
            mutations: { retry: false },
        },
    });
    render(
        <QueryClientProvider client={queryClient}>
            <AgentTaskDrawer rootId="root-1" onClose={vi.fn()} />
        </QueryClientProvider>,
    );
}

describe('AgentTaskDrawer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.featureFlags.current = { ai_agent_connectors: true, ai_agent_embedded: false };
        api.listConnections.mockResolvedValue({ data: { items: [
            { id: 'grant-1', client_name: 'ChatGPT', root_ids: ['root-1'], scopes: ['goals:read'] },
            { id: 'grant-other', client_name: 'Other fractal', root_ids: ['root-2'], scopes: [] },
        ] } });
        api.getContext.mockResolvedValue({ data: {
            goals: { items: [{ id: 'goal-1', name: 'Run a 5K' }] },
            activities: { items: [] },
            programs: { items: [] },
            templates: { items: [] },
        } });
        api.listTasks.mockResolvedValue({ data: { items: [] } });
        api.listTaskProposals.mockResolvedValue({ data: { items: [] } });
        api.listRuns.mockResolvedValue({ data: { items: [] } });
        api.getChangeCursor.mockResolvedValue({ data: { cursor: 0 } });
    });

    it('creates a root-scoped brief and shows a copyable handoff', async () => {
        api.createTask.mockResolvedValue({ data: {
            id: 'opaque-task-id',
            request_text: 'Plan a practice routine',
        } });
        renderDrawer();

        fireEvent.change(await screen.findByLabelText('What would you like help with?'), {
            target: { value: 'Plan a practice routine' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Create handoff' }));

        await waitFor(() => expect(api.createTask).toHaveBeenCalledWith(expect.objectContaining({
            root_id: 'root-1',
            grant_id: 'grant-1',
            request_text: 'Plan a practice routine',
            context: {},
        })));
        expect(await screen.findByText(/opaque-task-id/)).toBeInTheDocument();
        expect(screen.getByText(/paste it into a conversation/)).toBeInTheDocument();
    });

    it('binds first-party approval to the displayed immutable proposal hash', async () => {
        api.listTasks.mockResolvedValue({ data: { items: [{
            id: 'task-1',
            request_text: 'Add an explanatory note',
        }] } });
        api.listTaskProposals.mockResolvedValue({ data: { items: [{
            id: 'proposal-1',
            task_id: 'task-1',
            revision: 1,
            proposal_hash: 'a'.repeat(64),
            status: 'awaiting_approval',
            preview: [{
                operation_id: 'goal-update',
                action: 'Update goal',
                name: 'Run a 5K',
                changes: { name: 'Complete a 5K' },
                before: { name: 'Run a 5K' },
                before_goal_names: ['Base fitness'],
                goal_names: ['Race preparation'],
            }],
        }] } });
        api.decideProposal.mockResolvedValue({ data: { id: 'run-1', status: 'queued' } });
        renderDrawer();

        expect(await screen.findByText((_, element) => element?.textContent.trim() === 'Before: Run a 5K')).toBeInTheDocument();
        expect(screen.getByText((_, element) => element?.textContent.trim() === 'Proposed: Complete a 5K')).toBeInTheDocument();
        expect(screen.getByText('Goals before: Base fitness')).toBeInTheDocument();
        expect(screen.getByText('Goals after: Race preparation')).toBeInTheDocument();
        fireEvent.click(await screen.findByRole('button', { name: 'Approve and run' }));
        await waitFor(() => expect(api.decideProposal).toHaveBeenCalledWith('proposal-1', {
            decision: 'approve',
            proposal_hash: 'a'.repeat(64),
        }));
    });

    it('includes only selected entity IDs in a saved task brief', async () => {
        api.createTask.mockResolvedValue({ data: { id: 'task-2', request_text: 'Plan this goal' } });
        renderDrawer();

        const goalsSelect = await screen.findByLabelText('Goals');
        const goalOption = await screen.findByRole('option', { name: 'Run a 5K' });
        goalOption.selected = true;
        fireEvent.change(goalsSelect);
        fireEvent.change(screen.getByLabelText('What would you like help with?'), {
            target: { value: 'Plan this goal' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Create handoff' }));

        await waitFor(() => expect(api.createTask).toHaveBeenCalledWith(expect.objectContaining({
            context: { goal_ids: ['goal-1'] },
        })));
    });

    it('starts a bounded embedded provider conversation without an external connector', async () => {
        api.featureFlags.current = { ai_agent_connectors: false, ai_agent_embedded: true };
        api.listEmbeddedProviders.mockResolvedValue({ data: {
            providers: [{ id: 'openai', model: 'configured-model' }],
            billing_notice: 'Provider API usage is billed to Fractal Goals.',
        } });
        api.listEmbeddedConversations.mockResolvedValue({ data: { items: [] } });
        api.getChangeCursor.mockResolvedValue({ data: { cursor: 0 } });
        api.startEmbeddedConversation.mockResolvedValue({ data: {
            conversation_id: 'conversation-1', id: 'run-1', status: 'queued',
        } });
        api.getEmbeddedConversation.mockResolvedValue({ data: {
            id: 'conversation-1',
            messages: [{ id: 'message-1', role: 'user', content: 'Plan my week.' }],
            runs: [{ id: 'run-1', status: 'queued', steps_used: 0, step_budget: 6, tokens_used: 0, token_budget: 8000 }],
        } });
        renderDrawer();

        expect(await screen.findByText('Provider API usage is billed to Fractal Goals.')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Plan my week.' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));

        await waitFor(() => expect(api.startEmbeddedConversation).toHaveBeenCalledWith(expect.objectContaining({
            root_id: 'root-1',
            provider: 'openai',
            message: 'Plan my week.',
            timezone: expect.any(String),
        })));
    });

    it('explains that an embedded provider must be enabled and configured', async () => {
        api.featureFlags.current = { ai_agent_connectors: false, ai_agent_embedded: true };
        api.listEmbeddedProviders.mockResolvedValue({ data: {
            providers: [],
            billing_notice: 'Embedded providers are unavailable.',
        } });
        api.listEmbeddedConversations.mockResolvedValue({ data: { items: [] } });
        renderDrawer();

        expect(await screen.findByText(/administrator must enable an embedded provider and configure its API key and model/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    });
});
