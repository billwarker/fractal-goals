import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CloudMediaDialog from '../CloudMediaDialog';

const mocks = vi.hoisted(() => ({
    state: {}, connect: vi.fn(), disconnect: vi.fn(), refetch: vi.fn(), picker: vi.fn(), choose: vi.fn(),
    importFile: vi.fn(), dropboxFiles: vi.fn(),
}));
vi.mock('../../../hooks/useStorageConnections', () => ({ useStorageConnections: () => mocks.state }));
vi.mock('../../../utils/googleDrivePicker', () => ({ chooseGoogleDriveFile: mocks.choose }));
vi.mock('../../../utils/api/storageApi', () => ({ storageApi: mocks }));

const connected = (provider) => ({ provider, status: 'active', connected: true, configured: true, account_label: 'me@example.test' });

beforeEach(() => {
    vi.clearAllMocks();
    mocks.state = { providers: [], refetch: mocks.refetch, connect: mocks.connect, isLoading: false, isError: false };
});

describe('CloudMediaDialog', () => {
    it('explains unavailable storage without presenting broken connect controls', () => {
        mocks.state.providers = [{ provider: 'google_drive', status: 'unavailable', configured: false, connected: false }];
        render(<CloudMediaDialog rootId="root" onAdd={vi.fn()} onClose={vi.fn()} />);
        expect(screen.getByText(/Cloud storage isn't available yet/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Connect Google/ })).not.toBeInTheDocument();
    });

    it('selects a Drive file and imports a stable reference with its resource key', async () => {
        mocks.state.providers = [connected('google_drive')];
        mocks.picker.mockResolvedValue({ data: { access_token: 'ephemeral' } });
        mocks.choose.mockResolvedValue({ id: 'drive-file', resourceKey: 'resource' });
        mocks.importFile.mockResolvedValue({ data: { id: 'asset', name: 'photo.jpg', mime_type: 'image/jpeg' } });
        const onAdd = vi.fn();
        render(<CloudMediaDialog rootId="root" onAdd={onAdd} onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Choose file' }));
        await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ asset_id: 'asset' })));
        expect(mocks.importFile).toHaveBeenCalledWith('root', 'google_drive', 'drive-file', 'resource');
    });

    it('keeps cancelled Picker selection out of the attachment list', async () => {
        mocks.state.providers = [connected('google_drive')];
        mocks.picker.mockResolvedValue({ data: {} });
        mocks.choose.mockResolvedValue(null);
        const onAdd = vi.fn();
        render(<CloudMediaDialog rootId="root" onAdd={onAdd} onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Choose file' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Choose file' })).not.toBeDisabled());
        expect(onAdd).not.toHaveBeenCalled();
    });

    it('surfaces provider failure and permits retry', async () => {
        mocks.state.providers = [connected('dropbox')];
        mocks.dropboxFiles.mockRejectedValue(new Error('Provider unavailable'));
        render(<CloudMediaDialog rootId="root" onAdd={vi.fn()} onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Choose file' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Provider unavailable');
        expect(screen.getByRole('button', { name: 'Choose file' })).not.toBeDisabled();
    });

    it('only chooses existing cloud files; device uploads live in the note', () => {
        mocks.state.providers = [connected('dropbox')];
        render(<CloudMediaDialog rootId="root" onAdd={vi.fn()} onClose={vi.fn()} />);
        expect(screen.getByRole('dialog', { name: 'Choose from cloud storage' })).toBeInTheDocument();
        expect(screen.queryByLabelText('Picture or video to upload')).not.toBeInTheDocument();
    });

    it('offers reconnect for an expired grant and leaves account management to Settings', async () => {
        mocks.state.providers = [{ provider: 'dropbox', status: 'reconnect_required', configured: true, connected: false }];
        mocks.connect.mockResolvedValue(undefined);
        render(<CloudMediaDialog rootId="root" onAdd={vi.fn()} onClose={vi.fn()} />);
        expect(screen.getByText(/Access expired/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Disconnect/ })).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Manage cloud storage' })).toHaveAttribute('href', '/?settings=storage');
        fireEvent.click(screen.getByRole('button', { name: 'Reconnect Dropbox' }));
        await waitFor(() => expect(mocks.connect).toHaveBeenCalledWith('dropbox'));
    });
});
