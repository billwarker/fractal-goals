import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import ProgramDateNotes from '../ProgramDateNotes';
import { queryKeys } from '../../../hooks/queryKeys';

const api = vi.hoisted(() => ({ createNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn(), pinNote: vi.fn(), unpinNote: vi.fn() }));
vi.mock('../../../utils/api/fractalNotesApi', () => ({ fractalNotesApi: api }));
vi.mock('../../../hooks/useStorageConnections', () => ({ useStorageConnections: () => ({ providers: [], limits: null }) }));
vi.mock('../../notes', () => ({
    NoteTimeline: ({ notes }) => <ul>{notes.map((note) => <li key={note.id}>{note.content}</li>)}</ul>,
}));

function renderNotes(props = {}) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    render(
        <QueryClientProvider client={queryClient}>
            <ProgramDateNotes rootId="root" programId="program" date="2026-11-12" {...props} />
        </QueryClientProvider>,
    );
    return { invalidate };
}

describe('ProgramDateNotes', () => {
    it('lists the date notes under a counted heading', () => {
        renderNotes({ notes: [{ id: 'n1', content: 'Slept badly' }] });
        expect(screen.getByRole('region', { name: 'Notes (1)' })).toBeInTheDocument();
        expect(screen.getByText('Slept badly')).toBeInTheDocument();
    });

    it('writes a note on the calendar date and refreshes the day and the Notes feed', async () => {
        api.createNote.mockResolvedValue({ data: { id: 'n2' } });
        const { invalidate } = renderNotes();

        const input = screen.getByPlaceholderText('Add a note for Nov 12…');
        fireEvent.change(input, { target: { value: 'Kept it light' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() => expect(api.createNote).toHaveBeenCalledWith('root', {
            content: 'Kept it light',
            attachments: [],
            context_type: 'program_date',
            context_id: 'program',
            calendar_date: '2026-11-12',
        }));
        await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.programDayReadModelRoot('root', 'program') }));
        expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.allNotesRoot('root') });
    });
});
