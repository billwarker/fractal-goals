import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import SessionNotesPanel from '../SessionNotesPanel';

vi.mock('../NoteTimeline', () => ({
    default: ({ notes }) => (
        <div>
            {notes.map((note) => (
                <div key={note.id}>{note.content}</div>
            ))}
        </div>
    ),
}));

describe('SessionNotesPanel', () => {
    it('renders current session notes', () => {
        renderWithProviders(
            <SessionNotesPanel
                sessionId="session-1"
                notes={[
                    {
                        id: 'note-1',
                        context_type: 'session',
                        content: 'Keep the wrist relaxed',
                        created_at: '2026-04-10T12:00:00.000Z',
                    },
                    {
                        id: 'note-2',
                        context_type: 'activity',
                        content: 'Activity-only note',
                        created_at: '2026-04-10T12:00:00.000Z',
                    },
                ]}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        expect(screen.getByText('Session Notes (1)')).toBeInTheDocument();
        expect(screen.getByText('Keep the wrist relaxed')).toBeInTheDocument();
        expect(screen.queryByText('Activity-only note')).not.toBeInTheDocument();
    });

    it('adds a session-scoped note', async () => {
        const addNote = vi.fn().mockResolvedValue({});
        const onNoteAdded = vi.fn();

        renderWithProviders(
            <SessionNotesPanel
                sessionId="session-1"
                notes={[]}
                addNote={addNote}
                onNoteAdded={onNoteAdded}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        fireEvent.change(screen.getByPlaceholderText('Add a session note...'), {
            target: { value: 'Right side of back tweaked today' },
        });
        fireEvent.click(screen.getByTitle('Add note (Enter, Shift+Enter for new line)'));

        await waitFor(() => {
            expect(addNote).toHaveBeenCalledWith({
                context_type: 'session',
                context_id: 'session-1',
                session_id: 'session-1',
                content: 'Right side of back tweaked today',
            });
        });
        expect(onNoteAdded).toHaveBeenCalled();
    });
});
