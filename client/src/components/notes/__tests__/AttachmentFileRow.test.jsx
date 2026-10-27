import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AttachmentFileRow from '../AttachmentFileRow';

const item = { key: 'asset', asset_id: 'asset', name: 'Pasted image 2026-10-27.png', provider: 'google_drive', status: 'ready' };
const draftWith = (overrides = {}) => ({
    renameFile: vi.fn().mockResolvedValue({ name: 'Handstand form.png' }),
    fileUsage: vi.fn().mockResolvedValue({ notes: 3, provider: 'google_drive' }),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn(),
    ...overrides,
});
const renderRow = (draft) => render(<ul><AttachmentFileRow item={item} draft={draft} /></ul>);

describe('AttachmentFileRow', () => {
    it('renames the original while keeping its extension', async () => {
        const draft = draftWith();
        const { rerender } = renderRow(draft);
        const field = screen.getByLabelText('File name in Google Drive');
        expect(field).toHaveValue('Pasted image 2026-10-27');
        expect(screen.getByText('.png')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
        fireEvent.change(field, { target: { value: 'Handstand form' } });
        fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
        await waitFor(() => expect(draft.renameFile).toHaveBeenCalledWith('asset', 'Handstand form.png'));
        // The draft updates the item's name after a successful rename.
        rerender(<ul><AttachmentFileRow item={{ ...item, name: 'Handstand form.png' }} draft={draft} /></ul>);
        expect(screen.getByLabelText('File name in Google Drive')).toHaveValue('Handstand form');
        expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
    });

    it('removes from the note without touching storage', () => {
        const draft = draftWith();
        renderRow(draft);
        fireEvent.click(screen.getByRole('button', { name: 'Remove from note' }));
        expect(draft.remove).toHaveBeenCalledWith('asset');
        expect(draft.deleteFile).not.toHaveBeenCalled();
    });

    it('confirms with the number of affected notes before deleting from storage', async () => {
        const draft = draftWith();
        renderRow(draft);
        fireEvent.click(screen.getByRole('button', { name: 'Delete from Google Drive…' }));
        const confirm = await screen.findByRole('group', { name: `Confirm deleting ${item.name}` });
        expect(confirm).toHaveTextContent('Move Pasted image 2026-10-27.png to the Google Drive trash? It will be removed from 3 notes.');
        expect(draft.deleteFile).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Delete file' }));
        await waitFor(() => expect(draft.deleteFile).toHaveBeenCalledWith('asset'));
    });

    it('explains a provider refusal and keeps the attachment', async () => {
        const draft = draftWith({ deleteFile: vi.fn().mockRejectedValue({ response: { data: { error: 'Only the file’s owner can delete it from Google Drive.' } } }) });
        renderRow(draft);
        fireEvent.click(screen.getByRole('button', { name: 'Delete from Google Drive…' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Delete file' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Only the file’s owner can delete it');
    });
});
