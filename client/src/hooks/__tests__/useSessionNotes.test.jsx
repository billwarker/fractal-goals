import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import useSessionNotes from '../useSessionNotes';
import { queryKeys } from '../queryKeys';

const {
    getSessionNotes,
    getPreviousSessionNotes,
    getActivityDefinitionNotes,
    createNote,
    updateNote,
    deleteNote,
    notify,
} = vi.hoisted(() => ({
    getSessionNotes: vi.fn(),
    getPreviousSessionNotes: vi.fn(),
    getActivityDefinitionNotes: vi.fn(),
    createNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
    notify: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('../../utils/api', () => ({
    fractalApi: {
        getSessionNotes: (...args) => getSessionNotes(...args),
        getPreviousSessionNotes: (...args) => getPreviousSessionNotes(...args),
        getActivityDefinitionNotes: (...args) => getActivityDefinitionNotes(...args),
        createNote: (...args) => createNote(...args),
        updateNote: (...args) => updateNote(...args),
        deleteNote: (...args) => deleteNote(...args),
    }
}));

vi.mock('../../utils/notify', () => ({
    default: notify,
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

function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        }
    });
}

describe('useSessionNotes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getPreviousSessionNotes.mockResolvedValue({ data: [] });
        getActivityDefinitionNotes.mockResolvedValue({ data: [] });
    });

    it('keeps the session-notes cache coherent after adding a note', async () => {
        const queryClient = createQueryClient();
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

        getSessionNotes
            .mockResolvedValueOnce({ data: [{ id: 'note-1', content: 'Existing note', session_id: 'session-1' }] })
            .mockResolvedValueOnce({
                data: [
                    { id: 'note-2', content: 'New note', session_id: 'session-1' },
                    { id: 'note-1', content: 'Existing note', session_id: 'session-1' },
                ]
            });
        createNote.mockResolvedValue({
            data: { id: 'note-2', content: 'New note', session_id: 'session-1' }
        });

        const { result } = renderHook(
            () => useSessionNotes('root-1', 'session-1', 'activity-1'),
            { wrapper: createWrapper(queryClient) }
        );

        await waitFor(() => {
            expect(result.current.notes).toHaveLength(1);
        });

        await act(async () => {
            await result.current.addNote({ session_id: 'session-1', content: 'New note' });
        });

        await waitFor(() => {
            expect(queryClient.getQueryData(queryKeys.sessionNotes('root-1', 'session-1'))).toEqual([
                { id: 'note-2', content: 'New note', session_id: 'session-1' },
                { id: 'note-1', content: 'Existing note', session_id: 'session-1' },
            ]);
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.sessionNotes('root-1', 'session-1')
        });
        expect(notify.success).toHaveBeenCalledWith('Note added');
    });

    it('updates the cached session note in place after editing', async () => {
        const queryClient = createQueryClient();
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

        getSessionNotes
            .mockResolvedValueOnce({ data: [{ id: 'note-1', content: 'Existing note', session_id: 'session-1' }] })
            .mockResolvedValueOnce({ data: [{ id: 'note-1', content: 'Edited note', session_id: 'session-1' }] });
        updateNote.mockResolvedValue({
            data: { id: 'note-1', content: 'Edited note', session_id: 'session-1' }
        });

        const { result } = renderHook(
            () => useSessionNotes('root-1', 'session-1', 'activity-1'),
            { wrapper: createWrapper(queryClient) }
        );

        await waitFor(() => {
            expect(result.current.notes[0]?.content).toBe('Existing note');
        });

        await act(async () => {
            await result.current.updateNote('note-1', 'Edited note');
        });

        await waitFor(() => {
            expect(queryClient.getQueryData(queryKeys.sessionNotes('root-1', 'session-1'))).toEqual([
                { id: 'note-1', content: 'Edited note', session_id: 'session-1' }
            ]);
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.sessionNotes('root-1', 'session-1')
        });
        expect(notify.success).toHaveBeenCalledWith('Note updated');
    });

    it('removes the deleted note from the shared session-notes cache', async () => {
        const queryClient = createQueryClient();
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

        getSessionNotes
            .mockResolvedValueOnce({ data: [{ id: 'note-1', content: 'Existing note', session_id: 'session-1' }] })
            .mockResolvedValueOnce({ data: [] });
        deleteNote.mockResolvedValue({ data: { ok: true } });

        const { result } = renderHook(
            () => useSessionNotes('root-1', 'session-1', 'activity-1'),
            { wrapper: createWrapper(queryClient) }
        );

        await waitFor(() => {
            expect(result.current.notes).toHaveLength(1);
        });

        await act(async () => {
            await result.current.deleteNote('note-1');
        });

        await waitFor(() => {
            expect(queryClient.getQueryData(queryKeys.sessionNotes('root-1', 'session-1'))).toEqual([]);
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.sessionNotes('root-1', 'session-1')
        });
        expect(notify.success).toHaveBeenCalledWith('Note deleted');
    });

});
