import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api, notify } = vi.hoisted(() => ({
    api: { getConflicts: vi.fn(), resolveConflict: vi.fn(), restoreConflict: vi.fn(), getDevices: vi.fn(), revokeDevice: vi.fn() },
    notify: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../utils/api/syncApi', () => ({ syncApi: api }));
vi.mock('../../../utils/notify', () => ({ default: notify }));

import DeviceList from '../DeviceList';
import SyncConflictsPanel from '../SyncConflictsPanel';

const show = (element) => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{element}</QueryClientProvider>,
);
const conflict = {
    id: 'c1', root_id: 'root', type: 'goal', entity_id: 'g1', entity_name: 'Play jazz', field: 'description',
    kept_value: 'From Mac', lost_value: null,
};

beforeEach(() => {
    vi.clearAllMocks();
    api.getConflicts.mockResolvedValue({ data: { conflicts: [conflict] } });
    api.getDevices.mockResolvedValue({ data: { devices: [
        { id: 'd1', platform: 'ios', name: 'My phone', last_seen_at: '2026-11-20T10:00:00Z' },
    ] } });
    [api.resolveConflict, api.restoreConflict, api.revokeDevice].forEach((call) => call.mockResolvedValue({}));
});

describe('SyncConflictsPanel', () => {
    it('shows both values and restores the one set aside before closing it', async () => {
        show(<SyncConflictsPanel />);
        expect(await screen.findByText('Goal “Play jazz”: description')).toBeInTheDocument();
        expect(screen.getByText('From Mac')).toBeInTheDocument();
        expect(screen.getByText('Empty')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Use the other' }));
        await waitFor(() => expect(api.resolveConflict).toHaveBeenCalledWith('c1'));
        expect(api.restoreConflict).toHaveBeenCalledWith(conflict);
    });

    it('keeps the current value without editing anything', async () => {
        show(<SyncConflictsPanel />);
        fireEvent.click(await screen.findByRole('button', { name: 'Keep as is' }));
        await waitFor(() => expect(api.resolveConflict).toHaveBeenCalledWith('c1'));
        expect(api.restoreConflict).not.toHaveBeenCalled();
    });

    it('stays open when the restore fails', async () => {
        api.restoreConflict.mockRejectedValue({ response: { status: 404 } });
        show(<SyncConflictsPanel />);
        fireEvent.click(await screen.findByRole('button', { name: 'Use the other' }));
        await waitFor(() => expect(notify.error).toHaveBeenCalledWith('That item has been deleted.'));
        expect(api.resolveConflict).not.toHaveBeenCalled();
    });
});

describe('DeviceList', () => {
    it('lists apps and signs one out', async () => {
        show(<DeviceList />);
        expect(await screen.findByText('My phone')).toBeInTheDocument();
        expect(screen.getByText(/iPhone app/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Sign out of My phone' }));
        await waitFor(() => expect(api.revokeDevice.mock.calls[0][0]).toBe('d1'));
        await waitFor(() => expect(notify.success).toHaveBeenCalled());
    });

    it('offers a retry when the list fails', async () => {
        api.getDevices.mockRejectedValue(new Error('x'));
        show(<DeviceList />);
        expect(await screen.findByText("Couldn't load your devices.")).toBeInTheDocument();
    });
});
