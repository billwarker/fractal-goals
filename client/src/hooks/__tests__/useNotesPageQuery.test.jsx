import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useNotesPageQuery } from '../useNotesPageQuery';

const {
    getAllNotes,
    createNote,
    updateNote,
    deleteNote,
    pinNote,
    unpinNote,
    notify,
} = vi.hoisted(() => ({
    getAllNotes: vi.fn(),
    createNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
    pinNote: vi.fn(),
    unpinNote: vi.fn(),
    notify: {
        error: vi.fn(),
    },
}));

vi.mock('../../utils/api/fractalNotesApi', () => ({
    fractalNotesApi: {
        getAllNotes: (...args) => getAllNotes(...args),
        createNote: (...args) => createNote(...args),
        updateNote: (...args) => updateNote(...args),
        deleteNote: (...args) => deleteNote(...args),
        pinNote: (...args) => pinNote(...args),
        unpinNote: (...args) => unpinNote(...args),
    },
}));

vi.mock('../../utils/notify', () => ({
    default: notify,
}));

function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
}

function createWrapper(queryClient) {
    return function Wrapper({ children }) {
        return (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
    };
}

describe('useNotesPageQuery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        createNote.mockResolvedValue({ data: {} });
        updateNote.mockResolvedValue({ data: {} });
        deleteNote.mockResolvedValue({ data: {} });
        pinNote.mockResolvedValue({ data: {} });
        unpinNote.mockResolvedValue({ data: {} });
    });

    it('appends additional pages instead of replacing the current notes list', async () => {
        const queryClient = createQueryClient();

        getAllNotes
            .mockResolvedValueOnce({
                data: {
                    notes: [{ id: 'note-1', content: 'First page' }],
                    total: 2,
                    page: 0,
                    page_size: 25,
                    has_more: true,
                },
            })
            .mockResolvedValueOnce({
                data: {
                    notes: [{ id: 'note-2', content: 'Second page' }],
                    total: 2,
                    page: 1,
                    page_size: 25,
                    has_more: false,
                },
            });

        const { result } = renderHook(
            () => useNotesPageQuery('root-1', { search: 'focus' }),
            { wrapper: createWrapper(queryClient) }
        );

        await waitFor(() => {
            expect(result.current.notes).toEqual([{ id: 'note-1', content: 'First page' }]);
        });

        await act(async () => {
            await result.current.loadNextPage();
        });

        await waitFor(() => {
            expect(result.current.notes).toEqual([
                { id: 'note-1', content: 'First page' },
                { id: 'note-2', content: 'Second page' },
            ]);
        });

        expect(getAllNotes).toHaveBeenNthCalledWith(1, 'root-1', {
            search: 'focus',
            page: 0,
            page_size: 25,
        });
        expect(getAllNotes).toHaveBeenNthCalledWith(2, 'root-1', {
            search: 'focus',
            page: 1,
            page_size: 25,
        });
    });
});
