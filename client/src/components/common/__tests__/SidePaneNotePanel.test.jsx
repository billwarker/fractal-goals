import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SidePaneNotePanel from '../SidePaneNotePanel';

const mocks = vi.hoisted(() => ({ startUpload: vi.fn(), uploadChunk: vi.fn(), cancelUpload: vi.fn() }));
vi.mock('../../../utils/api/storageApi', () => ({ storageApi: mocks }));
vi.mock('../../../hooks/useStorageConnections', () => ({
    useStorageConnections: () => ({
        providers: [{ provider: 'google_drive', configured: true, connected: true, status: 'active' }],
        uploadDestination: 'google_drive',
        limits: { max_file_bytes: 100 * 1024 * 1024, max_attachments: 8 },
    }),
}));
vi.mock('../../notes/CloudMediaDialog', () => ({
    default: ({ onAdd }) => (
        <button type="button" onClick={() => onAdd({ id: 'asset-1', asset_id: 'asset-1', name: 'practice.mp4', alt_text: '' })}>
            Pick practice.mp4
        </button>
    ),
}));

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'image.png', { type: 'image/png' });

beforeEach(() => {
    vi.clearAllMocks();
    mocks.startUpload.mockImplementation((root, provider, file) => Promise.resolve({ data: { id: 'upload', offset: 0, chunk_bytes: 1048576, size_bytes: file.size } }));
    mocks.uploadChunk.mockResolvedValue({ data: { id: 'upload', offset: 4, size_bytes: 4, asset: { id: 'pasted-asset', name: 'Pasted image.png' } } });
});

describe('SidePaneNotePanel quick composer', () => {
    it('offers this device and cloud storage from a single paperclip before the add-note button', () => {
        render(<SidePaneNotePanel composerOnly rootId="root" onSubmit={vi.fn()} />);
        expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label')))
            .toEqual(['Attach pictures or video', 'Add note']);
        const paperclip = screen.getByRole('button', { name: 'Attach pictures or video' });
        fireEvent.click(paperclip);
        expect(paperclip).toHaveAttribute('aria-expanded', 'true');
        const menu = screen.getByRole('menu', { name: 'Attach from' });
        expect(screen.getAllByRole('menuitem').map((item) => item.textContent))
            .toEqual(['From this deviceSaved to Google Drive', 'From cloud storage']);
        expect(screen.getAllByRole('menuitem')[0]).toHaveFocus();
        fireEvent.keyDown(document, { key: 'ArrowDown' });
        expect(screen.getAllByRole('menuitem')[1]).toHaveFocus();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(menu).not.toBeInTheDocument();
        expect(paperclip).toHaveFocus();
    });

    it('opens the device file picker from the menu and closes on outside click', () => {
        render(<SidePaneNotePanel composerOnly rootId="root" onSubmit={vi.fn()} />);
        const input = document.querySelector('input[type="file"]');
        const click = vi.spyOn(input, 'click');
        fireEvent.click(screen.getByRole('button', { name: 'Attach pictures or video' }));
        fireEvent.click(screen.getByRole('menuitem', { name: /From this device/ }));
        expect(click).toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Attach pictures or video' }));
        fireEvent.pointerDown(document.body);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('uploads a pasted picture into cloud storage and submits it with the note', async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        render(<SidePaneNotePanel composerOnly rootId="root" onSubmit={onSubmit} />);
        const textbox = screen.getByRole('textbox');
        fireEvent.paste(textbox, { clipboardData: { files: [png()], getData: () => '' } });
        expect(mocks.startUpload).toHaveBeenCalledWith('root', 'google_drive', expect.any(File));
        expect(mocks.startUpload.mock.calls[0][2].name).toMatch(/^Pasted image \d{4}-\d{2}-\d{2} [\d.]+\.png$/);
        fireEvent.change(textbox, { target: { value: 'Screenshot of the run' } });
        await waitFor(() => expect(screen.getByRole('button', { name: 'Add note' })).not.toBeDisabled());
        fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Screenshot of the run', [{ asset_id: 'pasted-asset', alt_text: '' }]));
    });

    it('holds the note while an upload is running and lets a failed one be removed', async () => {
        mocks.uploadChunk.mockRejectedValue(new Error('Network unavailable'));
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        render(<SidePaneNotePanel composerOnly rootId="root" onSubmit={onSubmit} />);
        const input = document.querySelector('input[type="file"]');
        fireEvent.change(input, { target: { files: [new File(['jpeg'], 'Lesson.JPG', { type: 'image/jpeg' })] } });
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Lesson notes' } });
        expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
        expect(screen.getByRole('button', { name: 'Add note' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Remove Lesson.JPG' }));
        await waitFor(() => expect(mocks.cancelUpload).toHaveBeenCalledWith('root', 'upload'));
        fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Lesson notes', []));
    });

    it('adds an existing cloud file', async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        render(<SidePaneNotePanel composerOnly rootId="root" onSubmit={onSubmit} />);
        fireEvent.click(screen.getByRole('button', { name: 'Attach pictures or video' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'From cloud storage' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Pick practice.mp4' }));
        expect(screen.getByRole('list', { name: 'Attachments for this note' })).toHaveTextContent('practice.mp4');
    });

    it('leaves plain text paste alone and hides attach buttons without a fractal', () => {
        render(<SidePaneNotePanel composerOnly onSubmit={vi.fn()} />);
        expect(screen.queryByRole('button', { name: /Attach/ })).not.toBeInTheDocument();
    });
});
