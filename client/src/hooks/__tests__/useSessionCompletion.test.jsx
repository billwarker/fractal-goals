import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

import { queryKeys } from '../queryKeys';
import { useSessionCompletion } from '../useSessionCompletion';

const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('../../utils/notify', () => ({ default: notify }));


it('aligns every activity and circuit control after completing the session', async () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const activitiesKey = queryKeys.sessionActivities('root-1', 'session-1');
    const circuitsKey = queryKeys.sessionCircuitRuns('root-1', 'session-1');
    queryClient.setQueryData(activitiesKey, [
        { id: 'inst-1', completed: false, time_start: '2026-08-25T10:00:00Z' },
        { id: 'inst-unstarted', completed: false, time_start: null },
        { id: 'inst-2', completed: true },
    ]);
    queryClient.setQueryData(circuitsKey, [
        { id: 'run-1', status: 'active' },
        { id: 'run-2', status: 'planned' },
    ]);
    const updateSession = vi.fn().mockResolvedValue({ data: { completed: true } });
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSessionCompletion({
        rootId: 'root-1',
        sessionId: 'session-1',
        session: { id: 'session-1', completed: false },
        sessionActivitiesKey: activitiesKey,
        queryClient,
        updateSession,
    }), { wrapper });

    await act(async () => result.current());

    expect(updateSession).toHaveBeenCalledWith({ completed: true });
    expect(queryClient.getQueryData(activitiesKey)).toEqual([
        { id: 'inst-1', completed: true, time_start: '2026-08-25T10:00:00Z' },
        { id: 'inst-unstarted', completed: false, time_start: null },
        { id: 'inst-2', completed: true },
    ]);
    expect(queryClient.getQueryData(circuitsKey)).toEqual([
        { id: 'run-1', status: 'completed' },
        { id: 'run-2', status: 'planned' },
    ]);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: activitiesKey });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: circuitsKey });
    expect(notify.success).toHaveBeenCalledWith('Session completed!');
});

it('lets the server choose the end time and reports a paused completion', async () => {
    notify.success.mockClear();
    const queryClient = new QueryClient();
    const updateSession = vi.fn().mockResolvedValue({
        data: { completed: true, session_end: '2026-10-01T16:53:44Z' },
    });
    const wrapper = ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSessionCompletion({
        rootId: 'root-1',
        sessionId: 'session-1',
        session: {
            id: 'session-1',
            completed: false,
            is_paused: true,
            last_paused_at: '2026-10-01T16:53:44Z',
        },
        sessionActivitiesKey: queryKeys.sessionActivities('root-1', 'session-1'),
        queryClient,
        updateSession,
    }), { wrapper });

    await act(async () => result.current());

    expect(updateSession).toHaveBeenCalledWith({ completed: true });
    expect(notify.success).toHaveBeenCalledWith(
        expect.stringMatching(/^Session completed — ended at \d{1,2}:53 (AM|PM) when paused$/),
    );
});
