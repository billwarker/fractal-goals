import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAnalyticsPageData } from '../useAnalyticsPageData';
import { queryKeys } from '../queryKeys';

const getSessionAnalyticsSummary = vi.fn();
const getGoalAnalytics = vi.fn();
const getActivities = vi.fn();
const getActivityGroups = vi.fn();

vi.mock('../../utils/api', () => ({
    fractalApi: {
        getSessionAnalyticsSummary: (...args) => getSessionAnalyticsSummary(...args),
        getGoalAnalytics: (...args) => getGoalAnalytics(...args),
        getActivities: (...args) => getActivities(...args),
        getActivityGroups: (...args) => getActivityGroups(...args),
    },
}));

function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });
}

function createWrapper(queryClient) {
    return function Wrapper({ children }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
}

describe('useAnalyticsPageData', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('stores analytics datasets under shared query keys and derives activity instances', async () => {
        const queryClient = createQueryClient();

        getSessionAnalyticsSummary.mockResolvedValueOnce({
            data: {
                sessions: [
                    {
                        id: 'session-1',
                        name: 'Session A',
                        session_start: '2026-03-08T10:00:00Z',
                    },
                ],
                activity_instances: {
                    'activity-1': [
                        {
                            id: 'instance-1',
                            activity_definition_id: 'activity-1',
                            session_id: 'session-1',
                            session_name: 'Session A',
                            session_date: '2026-03-08T10:00:00Z',
                        },
                    ],
                },
            },
        });
        getGoalAnalytics.mockResolvedValueOnce({ data: { totals: { complete: 3 } } });
        getActivities.mockResolvedValueOnce({ data: [{ id: 'activity-1', name: 'Scales' }] });
        getActivityGroups.mockResolvedValueOnce({ data: [{ id: 'group-1', name: 'Technique' }] });

        const { result } = renderHook(
            () => useAnalyticsPageData('root-1'),
            { wrapper: createWrapper(queryClient) }
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(queryClient.getQueryData([...queryKeys.analyticsSummary('root-1'), 'history']).pages[0]).toMatchObject({
            sessions: [{ id: 'session-1', name: 'Session A' }],
        });
        expect(queryClient.getQueryData(queryKeys.goalAnalytics('root-1'))).toEqual({ totals: { complete: 3 } });
        expect(queryClient.getQueryData(queryKeys.activities('root-1'))).toEqual([
            { id: 'activity-1', name: 'Scales' },
        ]);
        expect(queryClient.getQueryData(queryKeys.activityGroups('root-1'))).toEqual([
            { id: 'group-1', name: 'Technique' },
        ]);
        expect(result.current.activityInstances['activity-1']).toHaveLength(1);
        expect(result.current.activityInstances['activity-1'][0]).toMatchObject({
            session_id: 'session-1',
            session_name: 'Session A',
        });
        expect(result.current.activityGroups).toEqual([{ id: 'group-1', name: 'Technique' }]);
    });
    it('defers evidence then automatically loads every instance and session page', async () => {
        const queryClient = createQueryClient();
        getGoalAnalytics.mockResolvedValue({ data: { goals: [] } });
        getActivities.mockResolvedValue({ data: [] });
        getActivityGroups.mockResolvedValue({ data: [] });
        getSessionAnalyticsSummary
            .mockResolvedValueOnce({ data: { sessions: [{ id: 'recent' }], activity_instances: { a: [{ id: 'one' }] }, evidence_pagination: { next_offset: 500 } } })
            .mockResolvedValueOnce({ data: { sessions: [{ id: 'recent' }], activity_instances: { a: [{ id: 'two' }] }, evidence_pagination: { next_offset: null }, session_pagination: { next_offset: 50 } } })
            .mockResolvedValueOnce({ data: { sessions: [{ id: 'older' }], activity_instances: { a: [{ id: 'three' }] }, session_pagination: { next_offset: null } } });
        const { result, rerender } = renderHook(({ enabled }) => useAnalyticsPageData('root', { needsSessionEvidence: enabled }), {
            initialProps: { enabled: false }, wrapper: createWrapper(queryClient),
        });
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(getSessionAnalyticsSummary).not.toHaveBeenCalled();
        rerender({ enabled: true });
        await waitFor(() => expect(result.current.activityInstances.a?.map((row) => row.id)).toEqual(['one', 'two', 'three']));
        expect(getSessionAnalyticsSummary).toHaveBeenNthCalledWith(2, 'root', { limit: 200, session_offset: 0, instance_offset: 500, instance_limit: 500 });
        expect(getSessionAnalyticsSummary).toHaveBeenLastCalledWith('root', { limit: 200, session_offset: 50, instance_offset: 0, instance_limit: 500 });
        expect(result.current.sessions.map((row) => row.id)).toEqual(['recent', 'older']);
        expect(result.current.hasMoreEvidence).toBe(false);
    });

    it('preserves loaded history when a later page fails and allows retry', async () => {
        getGoalAnalytics.mockResolvedValue({ data: {} });
        getActivities.mockResolvedValue({ data: [] });
        getActivityGroups.mockResolvedValue({ data: [] });
        getSessionAnalyticsSummary
            .mockResolvedValueOnce({ data: { sessions: [{ id: 'recent' }], activity_instances: { a: [{ id: 'one' }] }, session_pagination: { next_offset: 50 } } })
            .mockRejectedValueOnce(new Error('History unavailable'))
            .mockResolvedValueOnce({ data: { sessions: [{ id: 'older' }], activity_instances: { a: [{ id: 'two' }] } } });
        const { result } = renderHook(() => useAnalyticsPageData('root'), { wrapper: createWrapper(createQueryClient()) });
        await waitFor(() => expect(result.current.evidenceError?.message).toBe('History unavailable'));
        expect(getSessionAnalyticsSummary).toHaveBeenCalledTimes(2);
        expect(result.current.activityInstances.a.map((row) => row.id)).toEqual(['one']);
        await act(async () => { await result.current.loadMoreEvidence(); });
        await waitFor(() => expect(result.current.hasMoreEvidence).toBe(false));
        expect(result.current.evidenceError).toBeNull();
        expect(result.current.sessions.map((row) => row.id)).toEqual(['recent', 'older']);
    });

});
