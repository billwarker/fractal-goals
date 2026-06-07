import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { queryKeys } from '../queryKeys';
import {
    useCreateFractalMetric,
    useDeleteFractalMetric,
    useUpdateFractalMetric,
} from '../useActivityQueries';

const {
    createFractalMetric,
    updateFractalMetric,
    deleteFractalMetric,
} = vi.hoisted(() => ({
    createFractalMetric: vi.fn(),
    updateFractalMetric: vi.fn(),
    deleteFractalMetric: vi.fn(),
}));

vi.mock('../../utils/api', () => ({
    fractalApi: {
        createFractalMetric: (...args) => createFractalMetric(...args),
        updateFractalMetric: (...args) => updateFractalMetric(...args),
        deleteFractalMetric: (...args) => deleteFractalMetric(...args),
    },
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

describe('fractal metric mutations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('writes created and updated metrics into cache before background validation', async () => {
        const queryClient = createQueryClient();
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
        const metricsKey = queryKeys.fractalMetrics('root-1');

        queryClient.setQueryData(metricsKey, [
            { id: 'metric-1', name: 'Reps', unit: 'reps' },
        ]);

        createFractalMetric.mockResolvedValueOnce({
            data: { id: 'metric-2', name: 'Weight', unit: 'lbs' },
        });
        updateFractalMetric.mockResolvedValueOnce({
            data: { id: 'metric-1', name: 'Strict Reps', unit: 'reps' },
        });

        const createHook = renderHook(
            () => useCreateFractalMetric('root-1'),
            { wrapper: createWrapper(queryClient) }
        );
        const updateHook = renderHook(
            () => useUpdateFractalMetric('root-1'),
            { wrapper: createWrapper(queryClient) }
        );

        await act(async () => {
            await createHook.result.current.mutateAsync({ name: 'Weight', unit: 'lbs' });
            await updateHook.result.current.mutateAsync({
                metricId: 'metric-1',
                name: 'Strict Reps',
                unit: 'reps',
            });
        });

        expect(queryClient.getQueryData(metricsKey)).toEqual([
            { id: 'metric-1', name: 'Strict Reps', unit: 'reps' },
            { id: 'metric-2', name: 'Weight', unit: 'lbs' },
        ]);
        expect(invalidateQueries).toHaveBeenCalledWith({
            queryKey: metricsKey,
            refetchType: 'inactive',
        });
    });

    it('removes deleted metrics from cache immediately', async () => {
        const queryClient = createQueryClient();
        const metricsKey = queryKeys.fractalMetrics('root-1');
        queryClient.setQueryData(metricsKey, [
            { id: 'metric-1', name: 'Reps', unit: 'reps' },
            { id: 'metric-2', name: 'Weight', unit: 'lbs' },
        ]);
        deleteFractalMetric.mockResolvedValueOnce({ data: { message: 'Metric deleted' } });

        const { result } = renderHook(
            () => useDeleteFractalMetric('root-1'),
            { wrapper: createWrapper(queryClient) }
        );

        await act(async () => {
            await result.current.mutateAsync('metric-1');
        });

        expect(queryClient.getQueryData(metricsKey)).toEqual([
            { id: 'metric-2', name: 'Weight', unit: 'lbs' },
        ]);
    });
});
