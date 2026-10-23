import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useGoalChartData } from '../useGoalCharts';

const getSessionAnalyticsSummary = vi.fn();

vi.mock('../../utils/api', () => ({
    fractalApi: {
        getSessionAnalyticsSummary: (...args) => getSessionAnalyticsSummary(...args),
        getActivities: async () => ({ data: [{ id: 'handstand', name: 'Handstand' }] }),
        getActivityGroups: async () => ({ data: [] }),
    },
}));

const instance = (id, sessionId) => ({ id, activity_definition_id: 'handstand', session_id: sessionId, completed: true });

function wrapper({ children }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useGoalChartData', () => {
    beforeEach(() => vi.clearAllMocks());

    it('charts a cross-activity view from the whole history, like the Analytics page', async () => {
        getSessionAnalyticsSummary
            .mockResolvedValueOnce({ data: {
                sessions: [{ id: 's1' }],
                activity_instances: { handstand: [instance('i1', 's1')] },
                session_pagination: { next_offset: 50 },
            } })
            .mockResolvedValueOnce({ data: {
                sessions: [{ id: 's2' }],
                activity_instances: { handstand: [instance('i2', 's2')] },
            } });
        const saved = { category: 'activities', windowState: { selectedCategory: 'activities' } };

        const { result } = renderHook(() => useGoalChartData('root', saved), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(getSessionAnalyticsSummary).toHaveBeenCalledTimes(2);
        expect(result.current.data.sessions.map((session) => session.id)).toEqual(['s1', 's2']);
        expect(result.current.data.activityInstances.handstand.map((row) => row.id)).toEqual(['i1', 'i2']);
    });

    it('charts a session view from the whole history, with a duration formatter', async () => {
        getSessionAnalyticsSummary
            .mockResolvedValueOnce({ data: { sessions: [{ id: 's1' }], activity_instances: {}, session_pagination: { next_offset: 50 } } })
            .mockResolvedValueOnce({ data: { sessions: [{ id: 's2' }], activity_instances: {} } });
        const saved = { category: 'sessions', windowState: { selectedCategory: 'sessions', selectedVisualization: 'sessionTrends' } };

        const { result } = renderHook(() => useGoalChartData('root', saved), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.data.sessions.map((session) => session.id)).toEqual(['s1', 's2']);
        expect(result.current.data.formatDuration(3600)).toBeTruthy();
    });
});
