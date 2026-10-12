import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Logs from '../Logs';
import { queryKeys } from '../../hooks/queryKeys';

const { auth, api, notify } = vi.hoisted(() => ({
    auth: { user: { is_admin: true } },
    api: { getLogs: vi.fn(), clearLogs: vi.fn() },
    notify: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../contexts/TimezoneContext', () => ({ useTimezone: () => ({ timezone: 'UTC' }) }));
vi.mock('../../utils/api', () => ({ fractalApi: api }));
vi.mock('../../utils/notify', () => ({ default: notify }));

const history = {
    logs: [{ id: 'event-1', timestamp: '2026-10-12T12:00:00Z', event_type: 'goal.created', description: 'Created goal' }],
    pagination: { total: 101 },
    event_types: ['goal.created'],
};
const emptyHistory = { logs: [], pagination: { total: 0 }, event_types: [] };

function renderLogs() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={['/root-a/logs']}>
                <Routes><Route path="/:rootId/logs" element={<Logs />} /></Routes>
            </MemoryRouter>
        </QueryClientProvider>
    );
    return client;
}

describe('Logs retention control', () => {
    beforeEach(() => {
        auth.user = { is_admin: true };
        api.getLogs.mockReset().mockResolvedValue({ data: history });
        api.clearLogs.mockReset().mockResolvedValue({ data: { deleted_count: 101 } });
    });

    it('keeps retention controls hidden for ordinary owners', async () => {
        auth.user = { is_admin: false };
        renderLogs();
        await screen.findByText('Created goal');
        expect(screen.queryByRole('button', { name: 'CLEAR LOGS' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'REFRESH' })).toBeEnabled();
    });

    it('explains the complete deletion scope and cancels without a request', async () => {
        renderLogs();
        await screen.findByText('Created goal');
        fireEvent.click(screen.getByRole('button', { name: 'CLEAR LOGS' }));
        expect(screen.getByRole('dialog')).toHaveTextContent('including events outside the current filters');
        expect(api.clearLogs).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(api.clearLogs).not.toHaveBeenCalled();
    });

    it('clears from a filtered later page, refreshes all root caches, and resets pagination', async () => {
        const client = renderLogs();
        await screen.findByText('Created goal');
        const cachedPage = queryKeys.logs('root-a', 3, 50, 'session.updated');
        const infiniteKey = queryKeys.logsInfinite('root-a');
        const otherRoot = queryKeys.logs('root-b');
        client.setQueryData(cachedPage, history);
        client.setQueryData(infiniteKey, { pages: [history], pageParams: [0] });
        client.setQueryData(otherRoot, history);
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'goal.created' } });
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        await screen.findByText('Page 2 of 3');
        await waitFor(() => expect(api.getLogs).toHaveBeenLastCalledWith('root-a', expect.objectContaining({ offset: 50, event_type: 'goal.created' })));
        api.getLogs.mockResolvedValue({ data: emptyHistory });
        fireEvent.click(screen.getByRole('button', { name: 'CLEAR LOGS' }));
        fireEvent.click(screen.getByRole('button', { name: 'Clear all logs' }));
        await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Logs cleared'));
        expect(api.clearLogs).toHaveBeenCalledExactlyOnceWith('root-a');
        expect(client.getQueryState(cachedPage).isInvalidated).toBe(true);
        expect(client.getQueryState(infiniteKey).isInvalidated).toBe(true);
        expect(client.getQueryState(otherRoot).isInvalidated).toBe(false);
        await waitFor(() => expect(api.getLogs).toHaveBeenLastCalledWith('root-a', expect.objectContaining({ offset: 0 })));
        expect(screen.getByText('No events matching your filters.')).toBeInTheDocument();
    });

    it('disables duplicate requests while clearing and preserves history on failure', async () => {
        let rejectClear;
        api.clearLogs.mockImplementation(() => new Promise((resolve, reject) => { rejectClear = reject; }));
        renderLogs();
        await screen.findByText('Created goal');
        fireEvent.click(screen.getByRole('button', { name: 'CLEAR LOGS' }));
        fireEvent.click(screen.getByRole('button', { name: 'Clear all logs' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'CLEARING…' })).toBeDisabled());
        expect(screen.getByRole('button', { name: 'REFRESH' })).toBeDisabled();
        await act(async () => rejectClear({ response: { data: { error: 'Admin access required' } } }));
        await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Failed to clear logs: Admin access required'));
        expect(screen.getByText('Created goal')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'CLEAR LOGS' })).toBeEnabled();
        expect(notify.success).not.toHaveBeenCalled();
    });
});
