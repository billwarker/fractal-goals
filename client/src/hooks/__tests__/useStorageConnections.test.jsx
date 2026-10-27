import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useStorageConnections } from '../useStorageConnections';

const mocks = vi.hoisted(() => ({ connections: vi.fn(), connect: vi.fn(), disconnect: vi.fn() }));
vi.mock('../../utils/api/storageApi', () => ({ storageApi: mocks }));

const channels = [];
class FakeChannel {
    constructor(name) { this.name = name; channels.push(this); }
    close() {}
}

function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return { invalidate, ...renderHook(() => useStorageConnections(), { wrapper }) };
}

beforeEach(() => {
    vi.clearAllMocks();
    channels.length = 0;
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    mocks.connections.mockResolvedValue({ data: { providers: [{ provider: 'dropbox', status: 'active' }], limits: { max_attachments: 8 } } });
});
afterEach(() => vi.unstubAllGlobals());

describe('useStorageConnections', () => {
    it('invalidates only attachment read models after disconnecting', async () => {
        mocks.disconnect.mockResolvedValue({});
        const { result, invalidate } = setup();
        await waitFor(() => expect(result.current.providers).toHaveLength(1));
        await act(() => result.current.disconnect('dropbox'));
        const keys = invalidate.mock.calls.map(([filters]) => filters.queryKey[0]);
        expect(keys).toEqual(expect.arrayContaining(['storage', 'all-notes', 'goal-notes', 'session-notes', 'goalTimeline']));
        expect(invalidate.mock.calls.every(([filters]) => Array.isArray(filters.queryKey))).toBe(true);
    });

    it('refetches when a consent window reports its result', async () => {
        const { result } = setup();
        await waitFor(() => expect(result.current.providers).toHaveLength(1));
        act(() => channels[0].onmessage({ data: { type: 'storage-connection', provider: 'dropbox', result: 'connected' } }));
        expect(result.current.lastResult).toEqual(expect.objectContaining({ ok: true, message: 'Dropbox connected.' }));
        await waitFor(() => expect(mocks.connections).toHaveBeenCalledTimes(2));
    });

    it('opens consent synchronously and closes the window when the request fails', async () => {
        const popup = { close: vi.fn(), location: {} };
        vi.spyOn(window, 'open').mockReturnValue(popup);
        mocks.connect.mockRejectedValue(new Error('down'));
        const { result } = setup();
        const pending = result.current.connect('dropbox');
        expect(window.open).toHaveBeenCalledWith('about:blank', '_blank');
        await expect(pending).rejects.toThrow('down');
        expect(popup.close).toHaveBeenCalled();
        expect(popup.opener).toBeNull();
    });
});
