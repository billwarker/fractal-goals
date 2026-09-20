import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AgentConnectionsPanel from '../AgentConnectionsPanel';

const api = vi.hoisted(() => ({
    listConnections: vi.fn(),
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

        expect(await screen.findByText('ChatGPT')).toBeInTheDocument();
        expect(screen.getByText(/goals:read, notes:write/)).toBeInTheDocument();
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
});
