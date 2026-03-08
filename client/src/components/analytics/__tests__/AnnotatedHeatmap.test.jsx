import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';

import AnnotatedHeatmap from '../AnnotatedHeatmap';
import { queryKeys } from '../../../hooks/queryKeys';

const getAnnotations = vi.fn();

vi.mock('../../../utils/api', () => ({
    fractalApi: {
        getAnnotations: (...args) => getAnnotations(...args),
        createAnnotation: vi.fn(),
    },
}));

vi.mock('../../../hooks/useIsMobile', () => ({
    default: () => false,
}));

vi.mock('../AnnotationModal', () => ({
    default: () => null,
}));

function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
}

describe('AnnotatedHeatmap', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('stores fetched annotations under the shared annotations query key', async () => {
        const queryClient = createQueryClient();
        getAnnotations.mockResolvedValueOnce({
            data: {
                data: [{ id: 'annotation-1', content: 'Useful note', selected_points: ['2026-03-01'] }],
            },
        });

        render(
            <QueryClientProvider client={queryClient}>
                <AnnotatedHeatmap rootId="root-1" sessions={[]} months={6} />
            </QueryClientProvider>
        );

        await waitFor(() => {
            expect(queryClient.getQueryData(queryKeys.annotations('root-1', 'heatmap', JSON.stringify({ time_range: 6 })))).toEqual([
                { id: 'annotation-1', content: 'Useful note', selected_points: ['2026-03-01'] },
            ]);
        });
    });
});
