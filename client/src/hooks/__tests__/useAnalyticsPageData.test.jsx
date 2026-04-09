import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAnalyticsPageData } from '../useAnalyticsPageData';
import { queryKeys } from '../queryKeys';

const getSessions = vi.fn();
const getGoalAnalytics = vi.fn();
const getActivities = vi.fn();
const getActivityGroups = vi.fn();

vi.mock('../../utils/api', () => ({
    fractalApi: {
        getSessions: (...args) => getSessions(...args),
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

        getSessions.mockResolvedValueOnce({
            data: {
                sessions: [
                    {
                        id: 'session-1',
                        name: 'Session A',
                        session_start: '2026-03-08T10:00:00Z',
                        attributes: {
                            session_data: {
                                sections: [
                                    {
                                        exercises: [
                                            { type: 'activity', activity_id: 'activity-1', instance_id: 'instance-1' },
                                        ],
                                    },
                                ],
                            },
                        },
                    },
                ],
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

        expect(queryClient.getQueryData(queryKeys.analyticsSessions('root-1'))).toHaveLength(1);
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
});
