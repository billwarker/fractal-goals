import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGoalActivityHeatmap } from '../useGoalActivityHeatmap';
import { queryKeys } from '../queryKeys';

const { getGoalActivityHeatmap } = vi.hoisted(() => ({ getGoalActivityHeatmap: vi.fn() }));
vi.mock('../../utils/api', () => ({ fractalApi: { getGoalActivityHeatmap } }));

it('refreshes summaries and day evidence through the canonical timeline invalidation root', async () => {
    getGoalActivityHeatmap.mockResolvedValue({ data: { total_activities: 1, entries: [] } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Wrapper({ children }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
    const { result } = renderHook(() => {
        const summary = useGoalActivityHeatmap('root', 'goal', { timezone: 'UTC' });
        const day = useGoalActivityHeatmap('root', 'goal', { timezone: 'UTC', date: '2026-07-01' });
        return { summary, day };
    }, { wrapper: Wrapper });
    await waitFor(() => expect(result.current.summary.isSuccess && result.current.day.isSuccess).toBe(true));
    expect(getGoalActivityHeatmap).toHaveBeenCalledTimes(2);
    await client.invalidateQueries({ queryKey: queryKeys.goalTimelinesRoot('root') });
    expect(getGoalActivityHeatmap).toHaveBeenCalledTimes(4);
    client.clear();
});


it('extends an open calendar across local midnight without polling unchanged dates', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-02T03:59:30Z')); // July 1, 23:59:30 in Toronto.
    getGoalActivityHeatmap.mockClear();
    getGoalActivityHeatmap.mockResolvedValue({ data: { total_activities: 0 } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Wrapper({ children }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
    const view = renderHook(() => useGoalActivityHeatmap('root', 'goal', { timezone: 'America/Toronto' }), { wrapper: Wrapper });
    try {
        await act(async () => { await vi.advanceTimersByTimeAsync(10); });
        expect(getGoalActivityHeatmap).toHaveBeenCalledTimes(1);
        await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
        expect(getGoalActivityHeatmap).toHaveBeenCalledTimes(2);
        await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
        expect(getGoalActivityHeatmap).toHaveBeenCalledTimes(2);
    } finally {
        view.unmount();
        client.clear();
        vi.useRealTimers();
    }
});
