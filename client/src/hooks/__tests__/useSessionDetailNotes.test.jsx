import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSessionDetailNotes } from '../useSessionDetailNotes';

const {
    sessionNotesMock,
} = vi.hoisted(() => ({
    sessionNotesMock: vi.fn(),
}));

vi.mock('../useSessionNotes', () => ({
    default: (...args) => sessionNotesMock(...args),
}));

function createWrapper(queryClient) {
    return function Wrapper({ children }) {
        return (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
    };
}

describe('useSessionDetailNotes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionNotesMock.mockReturnValue({
            notes: [
                {
                    id: 'note-1',
                    content: 'A note',
                },
            ],
            previousNotes: [],
            previousSessionNotes: [],
            addNote: vi.fn(),
            updateNote: vi.fn(),
            deleteNote: vi.fn(() => Promise.resolve()),
            refreshNotes: vi.fn(),
        });
    });

    it('delegates note operations to useSessionNotes', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
            },
        });

        const { result } = renderHook(
            () => useSessionDetailNotes({
                rootId: 'root-1',
                sessionId: 'session-1',
                selectedActivity: { activity_definition_id: 'activity-1' },
            }),
            { wrapper: createWrapper(queryClient) }
        );

        expect(result.current.notes).toHaveLength(1);
        expect(result.current.notes[0].content).toBe('A note');

        await act(async () => {
            await result.current.deleteNote('note-1');
        });

        expect(sessionNotesMock.mock.results[0].value.deleteNote).toHaveBeenCalledWith('note-1');
    });
});
