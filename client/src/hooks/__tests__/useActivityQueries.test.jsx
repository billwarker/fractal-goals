import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { queryKeys } from '../queryKeys';
import {
    useCreateFractalMetric,
    useDeleteFractalMetric,
    useUpdateFractalMetric,
    useActivities,
} from '../useActivityQueries';
import { useCircuits } from '../useCircuitQueries';

const {
    createFractalMetric,
    updateFractalMetric,
    deleteFractalMetric,
    getActivities,
    getCircuits,
} = vi.hoisted(() => ({
    createFractalMetric: vi.fn(),
    updateFractalMetric: vi.fn(),
    deleteFractalMetric: vi.fn(),
    getActivities: vi.fn(),
    getCircuits: vi.fn(),
}));

vi.mock('../../utils/api', () => ({
    fractalApi: {
        createFractalMetric: (...args) => createFractalMetric(...args),
        updateFractalMetric: (...args) => updateFractalMetric(...args),
        deleteFractalMetric: (...args) => deleteFractalMetric(...args),
        getActivities: (...args) => getActivities(...args),
        getCircuits: (...args) => getCircuits(...args),
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

    it('refreshes mounted activity and circuit consumers, marks inactive data stale, and isolates roots', async () => {
        const queryClient = createQueryClient();
        const wrapper = createWrapper(queryClient);
        const activityKey = queryKeys.activities('root-1');
        const inactiveCircuits = queryKeys.circuits('root-1', true);
        const otherActivities = queryKeys.activities('root-2');
        const otherCircuits = queryKeys.circuits('root-2');
        const definitions = (input_type, precision) => [{
            id: 'activity-1',
            metric_definitions: [{ id: 'binding-1', fractal_metric_id: 'metric-1', input_type, precision }],
        }];
        queryClient.setQueryData(activityKey, definitions('number', 2));
        queryClient.setQueryData(inactiveCircuits, []);
        queryClient.setQueryData(otherActivities, definitions('number', 2));
        queryClient.setQueryData(otherCircuits, []);

        getCircuits.mockResolvedValue({ data: [{ id: 'circuit-1', slots: [{ activity: definitions('number', 2)[0] }] }] });
        const activities = renderHook(() => useActivities('root-1'), { wrapper });
        const circuits = renderHook(() => useCircuits('root-1'), { wrapper });
        const update = renderHook(() => useUpdateFractalMetric('root-1'), { wrapper });
        await waitFor(() => expect(circuits.result.current.data).toHaveLength(1));

        for (const [input_type, precision] of [['integer', 0], ['number', 3]]) {
            getActivities.mockResolvedValue({ data: definitions(input_type, precision) });
            getCircuits.mockResolvedValue({ data: [{ id: 'circuit-1', slots: [{ activity: definitions(input_type, precision)[0] }] }] });
            updateFractalMetric.mockResolvedValue({ data: { id: 'metric-1', input_type, precision } });
            await act(async () => {
                await update.result.current.mutateAsync({ metricId: 'metric-1', input_type, precision });
            });
            await waitFor(() => {
                expect(activities.result.current.activities).toEqual(definitions(input_type, precision));
                expect(circuits.result.current.data[0].slots[0].activity).toEqual(definitions(input_type, precision)[0]);
            });
        }

        expect(queryClient.getQueryState(inactiveCircuits).isInvalidated).toBe(true);
        expect(queryClient.getQueryState(otherActivities).isInvalidated).toBe(false);
        expect(queryClient.getQueryState(otherCircuits).isInvalidated).toBe(false);
        activities.unmount();
        circuits.unmount();
        update.unmount();
        queryClient.clear();
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
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.activities('root-1') });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['circuits', 'root-1'] });
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
