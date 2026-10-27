import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import NoteComposer from '../NoteComposer';

vi.mock('../ComposeLinkPanel', () => ({ default: () => null }));
vi.mock('../../../hooks/useStorageConnections', () => ({ useStorageConnections: () => ({ providers: [], limits: null }) }));

const attachment = { id: 'asset', name: 'Practice.mp4', alt_text: 'Practice' };

describe('NoteComposer save recovery', () => {
    it('preserves text and attachments after a rejected save, then allows retry', async () => {
        const submit = vi.fn().mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce(true);
        render(<NoteComposer rootId="root" initialContent="Evidence" initialAttachments={[attachment]} onSubmit={submit} />);
        fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
        await screen.findByRole('alert');
        expect(screen.getByRole('textbox', { name: '' })).toHaveValue('Evidence');
        expect(screen.getByDisplayValue('Practice')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
        await waitFor(() => expect(screen.queryByText('Practice.mp4')).not.toBeInTheDocument());
        expect(submit).toHaveBeenLastCalledWith('Evidence', null, null, [{ asset_id: 'asset', alt_text: 'Practice' }]);
    });

    it('preserves the draft when the caller reports an unsuccessful save', async () => {
        render(<NoteComposer rootId="root" initialContent="Keep me" onSubmit={vi.fn().mockResolvedValue(false)} />);
        fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
        await screen.findByRole('alert');
        expect(screen.getByRole('textbox')).toHaveValue('Keep me');
    });
});
