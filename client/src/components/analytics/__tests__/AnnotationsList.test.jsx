import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import AnnotationsList from '../AnnotationsList';
import { queryKeys } from '../../../hooks/queryKeys';

const getAnnotations = vi.fn();
const deleteAnnotation = vi.fn();

vi.mock('../../../utils/api', () => ({
    fractalApi: {
        getAnnotations: (...args) => getAnnotations(...args),
        deleteAnnotation: (...args) => deleteAnnotation(...args),
    },
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
        },
    });
}

describe('AnnotationsList', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('stores annotations under the shared annotations query key', async () => {
        const queryClient = createQueryClient();
        getAnnotations.mockResolvedValueOnce({
            data: {
                data: [{ id: 'annotation-1', content: 'Useful note', created_at: '2026-03-01T12:00:00Z', selected_points: [] }],
            },
        });

        render(
            <AnnotationsList
                rootId="root-1"
                visualizationType="timeline"
                context={{ goal_id: 'goal-1' }}
            />,
            { wrapper: createWrapper(queryClient) }
        );

        await waitFor(() => {
            expect(screen.getByText('Useful note')).toBeInTheDocument();
        });

        expect(
            queryClient.getQueryData(queryKeys.annotations('root-1', 'timeline', JSON.stringify({ goal_id: 'goal-1' })))
        ).toEqual([
            { id: 'annotation-1', content: 'Useful note', created_at: '2026-03-01T12:00:00Z', selected_points: [] },
        ]);
    });

    it('updates cached annotations after deletion', async () => {
        const queryClient = createQueryClient();
        getAnnotations.mockResolvedValueOnce({
            data: {
                data: [{ id: 'annotation-1', content: 'Delete me', created_at: '2026-03-01T12:00:00Z', selected_points: [] }],
            },
        });
        deleteAnnotation.mockResolvedValueOnce({ data: { ok: true } });

        render(
            <AnnotationsList
                rootId="root-1"
                visualizationType="timeline"
                context={{}}
            />,
            { wrapper: createWrapper(queryClient) }
        );

        await waitFor(() => {
            expect(screen.getByText('Delete me')).toBeInTheDocument();
        });

        fireEvent.mouseEnter(screen.getByText('Delete me').closest('div'));
        fireEvent.click(screen.getByText('Delete'));

        await waitFor(() => {
            expect(
                queryClient.getQueryData(queryKeys.annotations('root-1', 'timeline', JSON.stringify({})))
            ).toEqual([]);
        });
    });
});
