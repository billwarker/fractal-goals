import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AgentChatPopover from '../AgentChatPopover';

const api = vi.hoisted(() => ({
    featureFlags: { current: { ai_agent_embedded: true } },
    listEmbeddedProviders: vi.fn(),
    listEmbeddedConversations: vi.fn(),
    getEmbeddedConversation: vi.fn(),
    startEmbeddedConversation: vi.fn(),
    sendEmbeddedMessage: vi.fn(),
    cancelEmbeddedRun: vi.fn(),
    decideProposal: vi.fn(),
    listRuns: vi.fn(),
}));

vi.mock('../../../utils/api', () => ({ agentApi: api }));
vi.mock('../../../hooks/useFeatureFlags', () => ({
    FEATURE_FLAGS: { aiAgentEmbedded: 'ai_agent_embedded' },
    isFeatureEnabled: (flags, key) => flags[key] === true,
    useFeatureFlags: () => ({ flags: api.featureFlags.current }),
}));

function renderPopover(isOpen = true) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false }, mutations: { retry: false } } });
    return render(<QueryClientProvider client={queryClient}><AgentChatPopover rootId="root-1" isOpen={isOpen} onClose={vi.fn()} /></QueryClientProvider>);
}

describe('AgentChatPopover', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.featureFlags.current = { ai_agent_embedded: true };
        api.listEmbeddedProviders.mockResolvedValue({ data: { providers: [{ id: 'openai', model: 'test-model' }] } });
        api.listEmbeddedConversations.mockResolvedValue({ data: { items: [] } });
        api.getEmbeddedConversation.mockResolvedValue({ data: { messages: [], runs: [] } });
        api.startEmbeddedConversation.mockResolvedValue({ data: { id: 'run-1', conversation_id: 'conversation-1', status: 'queued' } });
    });

    it('sends a message to the embedded provider without item focus or a handoff', async () => {
        renderPopover();
        fireEvent.change(await screen.findByRole('textbox', { name: 'Message' }), { target: { value: 'Create a practice goal' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        await waitFor(() => expect(api.startEmbeddedConversation).toHaveBeenCalledWith(expect.objectContaining({ root_id: 'root-1', provider: 'openai', message: 'Create a practice goal' })));
        expect(screen.queryByText(/Focus on specific items/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/handoff/i)).not.toBeInTheDocument();
    });

    it('renders an immutable proposal preview and binds approval to its hash', async () => {
        api.listEmbeddedConversations.mockResolvedValue({ data: { items: [{ id: 'conversation-1' }] } });
        api.getEmbeddedConversation.mockResolvedValue({ data: {
            id: 'conversation-1', messages: [{ id: 'm1', role: 'assistant', content: 'I prepared a change.' }],
            runs: [{ id: 'embedded-run', status: 'succeeded', proposal: { id: 'proposal-1', revision: 1, proposal_hash: 'a'.repeat(64), status: 'awaiting_approval', preview: [{ operation_id: 'goal-1', action: 'Update goal', name: 'Practice' }] } }],
        } });
        api.decideProposal.mockResolvedValue({ data: { status: 'queued' } });
        renderPopover();
        expect(await screen.findByText('Update goal')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Approve and run' }));
        await waitFor(() => expect(api.decideProposal).toHaveBeenCalledWith('proposal-1', { decision: 'approve', proposal_hash: 'a'.repeat(64) }));
    });

    it('supports Escape without trapping focus in the non-modal pop-up', async () => {
        const onClose = vi.fn();
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(<QueryClientProvider client={queryClient}><AgentChatPopover rootId="root-1" isOpen onClose={onClose} /></QueryClientProvider>);
        expect(await screen.findByRole('dialog', { name: 'Ask AI' })).toHaveAttribute('aria-modal', 'false');
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
