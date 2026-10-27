import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { usageText } from '../../notes/AttachmentFileRow';
import GoalCompletionModal from '../GoalCompletionModal';
import GoalDescriptionMedia from '../GoalDescriptionMedia';

vi.mock('../../notes/MediaAttachment', () => ({ default: ({ asset }) => <figure>{asset.name}:{asset.id}</figure> }));

const draft = (items = []) => ({
    items, dropProps: {}, handlePaste: vi.fn(), canAdd: true, notice: '', destinationLabel: 'Dropbox', rootId: 'root',
    remove: vi.fn(), retry: vi.fn(),
});

describe('goal completion and description media', () => {
    it('puts the quick-note paperclip beside the completion note, with compact chips and paste', () => {
        const attachmentDraft = draft([{ key: 'a', asset_id: 'a', name: 'run.mp4', status: 'ready' }]);
        render(<GoalCompletionModal attachmentDraft={attachmentDraft} completionNote="" onCompletionNoteChange={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'Attach pictures or video' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Upload from device' })).not.toBeInTheDocument();
        expect(screen.getByRole('list', { name: 'Attachments for this completion note' })).toHaveTextContent('run.mp4');
        fireEvent.click(screen.getByRole('button', { name: 'Attach pictures or video' }));
        expect(screen.getByRole('menu', { name: 'Attach from' })).toBeInTheDocument();
        fireEvent.paste(screen.getByLabelText('Goal Completion Note (optional):'));
        expect(attachmentDraft.handlePaste).toHaveBeenCalled();
    });

    it('stays text-only without a fractal', () => {
        render(<GoalCompletionModal completionNote="" onCompletionNoteChange={vi.fn()} />);
        expect(screen.queryByRole('button', { name: 'Attach pictures or video' })).not.toBeInTheDocument();
    });

    it('previews only finished description media', () => {
        render(<GoalDescriptionMedia rootId="root" draft={draft([
            { key: 'a', asset_id: 'a', name: 'form.png', status: 'ready' },
            { key: 'u', name: 'uploading.mp4', status: 'uploading' },
        ])} />);
        expect(screen.getByText('form.png:a')).toBeInTheDocument();
        expect(screen.queryByText(/uploading.mp4/)).not.toBeInTheDocument();
    });

    it('describes where a deleted file is removed from', () => {
        expect(usageText({ notes: 1, goals: 0 })).toBe('It will be removed from where it’s attached.');
        expect(usageText({ notes: 3 })).toBe('It will be removed from 3 notes.');
        expect(usageText({ notes: 2, goals: 1 })).toBe('It will be removed from 2 notes and 1 goal description.');
    });
});
