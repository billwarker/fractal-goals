import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AgentConnectionsPanel from '../AgentConnectionsPanel';

const api = vi.hoisted(() => ({
    listConnections: vi.fn(),
    listEmbeddedProviders: vi.fn(),
    revokeConnection: vi.fn(),
}));

vi.mock('../../../utils/api', () => ({ agentApi: api }));

describe('AgentConnectionsPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.listConnections.mockResolvedValue({ data: { items: [{
            id: 'grant-1',
            client_name: 'ChatGPT',
            root_ids: ['root-1'],
            scopes: ['goals:read', 'notes:write'],
            created_at: '2026-09-01T00:00:00Z',
        }] } });
        api.revokeConnection.mockResolvedValue({ data: { revoked: true } });
        api.listEmbeddedProviders.mockResolvedValue({ data: { providers: [], billing_notice: 'Embedded requests use the configured provider account.' } });
    });

    it('shows delegated scope and revokes the selected connection', async () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });
        render(
            <QueryClientProvider client={queryClient}>
                <AgentConnectionsPanel />
            </QueryClientProvider>,
        );

        await waitFor(() => expect(screen.getByText(/goals:read, notes:write/)).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
        await waitFor(() => expect(api.revokeConnection).toHaveBeenCalledWith('grant-1'));
    });

    it('announces a connection-loading failure to assistive technology', async () => {
        api.listConnections.mockRejectedValueOnce(new Error('Network unavailable'));
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });
        render(
            <QueryClientProvider client={queryClient}>
                <AgentConnectionsPanel />
            </QueryClientProvider>,
        );

        expect(await screen.findByRole('alert')).toHaveTextContent(/connections are unavailable: network unavailable/i);
    });

    it('keeps revoke available while the connector is disabled and hides connection setup', async () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });
        render(
            <QueryClientProvider client={queryClient}>
                <AgentConnectionsPanel enabled={false} />
            </QueryClientProvider>,
        );

        expect(await screen.findByRole('status')).toHaveTextContent(/new ai connections are unavailable/i);
        expect(await screen.findByText('ChatGPT')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Copy server URL' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Open ChatGPT' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
        await waitFor(() => expect(api.revokeConnection).toHaveBeenCalledWith('grant-1'));
    });

    it('guides the user through provider MCP setup and model selection', async () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });
        render(
            <QueryClientProvider client={queryClient}>
                <AgentConnectionsPanel />
            </QueryClientProvider>,
        );

        expect(await screen.findByRole('link', { name: 'Open ChatGPT' })).toHaveAttribute('href', 'https://chatgpt.com');
        expect(screen.getByRole('link', { name: 'Open Claude' })).toHaveAttribute('href', 'https://claude.ai');
        expect(screen.getByText(/choose an available model inside ChatGPT or Claude/i)).toBeInTheDocument();
        expect(screen.getByText(/Fractal does not receive a provider subscription token/i)).toBeInTheDocument();
        expect(screen.getByText(/ChatGPT currently limits MCP write actions to Business, Enterprise, and Edu/i)).toBeInTheDocument();
        expect(screen.getAllByRole('link', { name: 'View setup guide' })[0]).toHaveAttribute(
            'href',
            'https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt',
        );
    });
});
