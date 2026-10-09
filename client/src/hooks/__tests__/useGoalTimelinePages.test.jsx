import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGoalTimelinePages } from '../useGoalTimelinePages';
import { queryKeys } from '../queryKeys';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../../utils/api', () => ({ fractalApi: { getGoalActivityHeatmap: api } }));

it('appends cursor pages, recovers a failed load-more, and resets scope without mixing entries', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const options = { includeChildren: true, timezone: 'UTC', metric: 'activities', date: null, calendarDate: '2026-10-09' };
    let failNext = true;
    api.mockImplementation(async (root, goal, params) => {
        if (params.cursor && failNext) { failNext = false; throw new Error('Temporary outage'); }
        return { data: { entries: [{ id: params.metric === 'events' ? 'event' : params.cursor ? 'older' : 'latest' }], pagination: { total: 2, next_cursor: params.cursor || params.metric === 'events' ? null : 'next' } } };
    });
    function Wrapper({ children }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
    const view = renderHook(({ metric }) => useGoalTimelinePages('root', 'goal', { ...options, metric }), { wrapper: Wrapper, initialProps: { metric: 'activities' } });
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    await act(async () => { await view.result.current.fetchNextPage(); });
    await waitFor(() => expect(view.result.current.isFetchNextPageError).toBe(true));
    expect(view.result.current.data.pages.flatMap((page) => page.entries).map((entry) => entry.id)).toEqual(['latest']);
    await act(async () => { await view.result.current.fetchNextPage(); });
    await waitFor(() => expect(view.result.current.hasNextPage).toBe(false));
    expect(view.result.current.data.pages.flatMap((page) => page.entries).map((entry) => entry.id)).toEqual(['latest', 'older']);
    view.rerender({ metric: 'events' });
    await waitFor(() => expect(view.result.current.data.pages[0].entries[0].id).toBe('event'));
    expect(view.result.current.data.pages).toHaveLength(1);
    api.mockClear();
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.goalTimelinesRoot('root') }); });
    expect(api).toHaveBeenCalledWith('root', 'goal', expect.objectContaining({ view: 'entries', metric: 'events', cursor: null, limit: 20 }));
    view.unmount();
    client.clear();
});
