import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSessionNotes } from '../useSessionQueries';

const getSessionNotes = vi.fn();

vi.mock('../../utils/api', () => ({
    fractalApi: {
        getSessionNotes: (...args) => getSessionNotes(...args),
    }
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

describe('useSessionNotes', () => {
    it('stores fetched notes under the shared session-notes query key', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                }
            }
        });

        getSessionNotes.mockResolvedValueOnce({
            data: [{ id: 'note-1', content: 'Session note' }]
        });

        const { result } = renderHook(
            () => useSessionNotes('root-1', 'session-1'),
            { wrapper: createWrapper(queryClient) }
        );

        await waitFor(() => {
            expect(result.current.notes).toEqual([{ id: 'note-1', content: 'Session note' }]);
        });

        expect(queryClient.getQueryData(['session-notes', 'root-1', 'session-1'])).toEqual([
            { id: 'note-1', content: 'Session note' }
        ]);
    });
});
