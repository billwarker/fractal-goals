import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import NoteQuickAdd from '../NoteQuickAdd';

const mocks = vi.hoisted(() => ({ startUpload: vi.fn(), uploadChunk: vi.fn(), cancelUpload: vi.fn() }));
vi.mock('../../../utils/api/storageApi', () => ({ storageApi: mocks }));
vi.mock('../../../hooks/useStorageConnections', () => ({
    useStorageConnections: () => ({
        providers: [{ provider: 'dropbox', configured: true, connected: true, status: 'active' }],
        uploadDestination: 'dropbox', limits: { max_file_bytes: 1048576, max_attachments: 8 },
    }),
}));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.startUpload.mockResolvedValue({ data: { id: 'upload', offset: 0, chunk_bytes: 1048576, size_bytes: 4 } });
    mocks.uploadChunk.mockResolvedValue({ data: { id: 'upload', offset: 4, size_bytes: 4, asset: {
        id: 'asset', name: 'Pasted image.png', mime_type: 'image/png', provider: 'dropbox', available: true,
    } } });
});

describe('NoteQuickAdd attachments', () => {
    it('uploads a pasted picture and submits it in the serialized attachment shape', async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        render(<NoteQuickAdd rootId="root" onSubmit={onSubmit} placeholder="Add a session note..." />);
        const textbox = screen.getByPlaceholderText('Add a session note...');
        fireEvent.paste(textbox, { clipboardData: { files: [new File(['png'], 'image.png', { type: 'image/png' })], getData: () => '' } });
        expect(mocks.startUpload).toHaveBeenCalledWith('root', 'dropbox', expect.any(File));
        fireEvent.change(textbox, { target: { value: 'Form check' } });
        await waitFor(() => expect(screen.getByRole('button', { name: 'Add note' })).not.toBeDisabled());
        fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Form check', [{
            id: 'asset', asset_id: 'asset', name: 'Pasted image.png', mime_type: 'image/png', provider: 'dropbox', available: true, alt_text: '',
        }]));
    });

    it('stays text-only without a fractal', () => {
        render(<NoteQuickAdd onSubmit={vi.fn()} />);
        expect(screen.queryByRole('button', { name: 'Attach pictures or video' })).not.toBeInTheDocument();
    });
});
