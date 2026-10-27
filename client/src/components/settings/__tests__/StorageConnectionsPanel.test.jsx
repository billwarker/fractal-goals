import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import StorageConnectionsPanel from '../StorageConnectionsPanel';

const mocks = vi.hoisted(() => ({ state: {}, connect: vi.fn(), disconnect: vi.fn(), refetch: vi.fn(), clearLastResult: vi.fn(), setUploadDestination: vi.fn() }));
vi.mock('../../../hooks/useStorageConnections', () => ({ useStorageConnections: () => mocks.state }));

const provider = (overrides) => ({
    provider: 'google_drive', configured: true, status: 'not_connected', connected: false,
    account_label: null, connected_at: null, attachment_count: 0, ...overrides,
});
const card = (name) => screen.getByRole('article', { name });

beforeEach(() => {
    vi.clearAllMocks();
    mocks.state = {
        providers: [], limits: { max_file_bytes: 100 * 1024 * 1024, max_attachments: 8 },
        isLoading: false, isError: false, refetch: mocks.refetch, connect: mocks.connect,
        disconnect: mocks.disconnect, isDisconnecting: false, lastResult: null, clearLastResult: mocks.clearLastResult,
        uploadDestination: null, setUploadDestination: mocks.setUploadDestination, isSavingDestination: false,
    };
});

describe('StorageConnectionsPanel', () => {
    it('renders every connection state with the right action', () => {
        mocks.state.providers = [
            provider({ status: 'active', connected: true, account_label: 'me@example.test', connected_at: '2026-10-01T00:00:00Z', attachment_count: 3 }),
            provider({ provider: 'dropbox', status: 'reconnect_required', account_label: 'me@dropbox.test', attachment_count: 1 }),
        ];
        render(<StorageConnectionsPanel />);
        const drive = card('Google Drive');
        expect(within(drive).getByText('Connected')).toBeInTheDocument();
        expect(within(drive).getByText('me@example.test')).toBeInTheDocument();
        expect(within(drive).getByText('3 attachments')).toBeInTheDocument();
        expect(within(drive).getByRole('button', { name: 'Disconnect Google Drive' })).toBeInTheDocument();
        const dropbox = card('Dropbox');
        expect(within(dropbox).getByText(/expired or was removed/)).toHaveTextContent('1 attachment can’t display');
        expect(within(dropbox).getByRole('button', { name: 'Reconnect Dropbox' })).toBeInTheDocument();
        expect(screen.getByText('Up to 100 MB per file')).toBeInTheDocument();
        expect(screen.getByText('Up to 8 attachments per note')).toBeInTheDocument();
    });

    it('explains unavailable and disconnected providers', () => {
        mocks.state.providers = [
            provider({ status: 'unavailable', configured: false }),
            provider({ provider: 'dropbox', status: 'disconnected', account_label: 'old@dropbox.test', attachment_count: 2 }),
        ];
        render(<StorageConnectionsPanel />);
        expect(within(card('Google Drive')).getByText(/isn’t available on this deployment/)).toBeInTheDocument();
        expect(within(card('Google Drive')).queryByRole('button')).not.toBeInTheDocument();
        expect(within(card('Dropbox')).getByText(/2 attachments from old@dropbox.test/)).toBeInTheDocument();
        expect(within(card('Dropbox')).getByRole('button', { name: 'Reconnect Dropbox' })).toBeInTheDocument();
    });

    it('suggests pasted links when no provider is available', () => {
        mocks.state.providers = [provider({ status: 'unavailable' }), provider({ provider: 'dropbox', status: 'unavailable' })];
        render(<StorageConnectionsPanel />);
        expect(screen.getByText(/paste shared links/)).toBeInTheDocument();
    });

    it('connects and surfaces a blocked consent window', async () => {
        mocks.state.providers = [provider({})];
        mocks.connect.mockRejectedValue(new Error('Allow the connection window to open, then try again.'));
        render(<StorageConnectionsPanel />);
        fireEvent.click(screen.getByRole('button', { name: 'Connect Google Drive' }));
        expect(mocks.connect).toHaveBeenCalledWith('google_drive');
        expect(await screen.findByRole('alert')).toHaveTextContent('Allow the connection window');
    });

    it('confirms before disconnecting and reports the outcome', async () => {
        mocks.state.providers = [provider({ status: 'active', connected: true, account_label: 'me@example.test', attachment_count: 2 })];
        mocks.disconnect.mockResolvedValue({});
        render(<StorageConnectionsPanel />);
        fireEvent.click(screen.getByRole('button', { name: 'Disconnect Google Drive' }));
        const confirm = screen.getByRole('group', { name: 'Confirm disconnecting Google Drive' });
        expect(confirm).toHaveTextContent('2 attachments will stop displaying until you reconnect');
        expect(mocks.disconnect).not.toHaveBeenCalled();
        fireEvent.click(within(confirm).getByRole('button', { name: 'Disconnect' }));
        await waitFor(() => expect(mocks.disconnect).toHaveBeenCalledWith('google_drive'));
        expect(await screen.findByRole('status')).toHaveTextContent('Google Drive disconnected.');
    });

    it('shows the result of a consent window and retries a failed load', () => {
        mocks.state.lastResult = { ok: false, result: 'account_mismatch', message: 'Reconnect the same Dropbox account' };
        mocks.state.isError = true;
        render(<StorageConnectionsPanel />);
        expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Reconnect the same Dropbox account');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(mocks.refetch).toHaveBeenCalled();
    });

    it('lets the user choose where uploads go once two accounts are connected', async () => {
        mocks.state.providers = [provider({ status: 'active', connected: true, account_label: 'me@gmail.test' })];
        const { rerender } = render(<StorageConnectionsPanel />);
        expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
        mocks.state.providers = [...mocks.state.providers,
            provider({ provider: 'dropbox', status: 'active', connected: true, account_label: 'me@dropbox.test' })];
        mocks.state.uploadDestination = 'google_drive';
        mocks.setUploadDestination.mockResolvedValue({});
        rerender(<StorageConnectionsPanel />);
        const group = screen.getByRole('radiogroup', { name: 'Save new uploads to' });
        expect(within(group).getByRole('radio', { name: /Google Drive/ })).toBeChecked();
        fireEvent.click(within(group).getByRole('radio', { name: /Dropbox/ }));
        await waitFor(() => expect(mocks.setUploadDestination).toHaveBeenCalledWith('dropbox'));
        expect(await screen.findByRole('status')).toHaveTextContent('New uploads will be saved to Dropbox.');
    });
});
