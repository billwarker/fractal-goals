import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';

import AnnotatedChartWrapper from '../AnnotatedChartWrapper';
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

describe('AnnotatedChartWrapper', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('stores fetched annotations under the shared annotations query key', async () => {
        const queryClient = createQueryClient();
        getAnnotations.mockResolvedValueOnce({
            data: {
                data: [{ id: 'annotation-1', content: 'Useful note', selected_points: [] }],
            },
        });

        render(
            <QueryClientProvider client={queryClient}>
                <AnnotatedChartWrapper
                    rootId="root-1"
                    visualizationType="scatter"
                    context={{ activity_id: 'activity-1' }}
                    chartRef={{ current: null }}
                >
                    <div>Chart</div>
                </AnnotatedChartWrapper>
            </QueryClientProvider>
        );

        await waitFor(() => {
            expect(
                queryClient.getQueryData(queryKeys.annotations('root-1', 'scatter', JSON.stringify({ activity_id: 'activity-1' })))
            ).toEqual([
                { id: 'annotation-1', content: 'Useful note', selected_points: [] },
            ]);
        });
    });
});
