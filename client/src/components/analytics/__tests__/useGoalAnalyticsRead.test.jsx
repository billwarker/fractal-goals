import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import useGoalAnalyticsRead from '../useGoalAnalyticsRead';

const getGoalAnalytics = vi.fn();
vi.mock('../../../utils/api', () => ({ fractalApi: { getGoalAnalytics: (...args) => getGoalAnalytics(...args) } }));

function wrapper({ children }) {
    return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}
const base = {
    rootId: 'root', selectedCategory: 'goals', selectedVisualization: 'goalDetail',
    selectedGoal: { id: 'goal' }, resolvedGlobalFilters: { hasGoalFilter: false, hasActivityFilter: false },
    goalAnalytics: { metadata: { aggregated: true } }, effectiveDateRange: null, hasActiveDateRange: false,
};

beforeEach(() => { getGoalAnalytics.mockReset(); });

it('fetches bounded evidence for the selected goal chart', async () => {
    getGoalAnalytics.mockResolvedValue({ data: { goals: [{ id: 'goal', total_duration_seconds: 900 }] } });
    const { result } = renderHook(() => useGoalAnalyticsRead(base), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getGoalAnalytics).toHaveBeenCalledWith('root', expect.objectContaining({ charts: 'true', chart_goal_id: 'goal' }));
    expect(result.current.data.goals[0].total_duration_seconds).toBe(900);
});

it('an explicitly empty activity filter remains empty in the server request', async () => {
    getGoalAnalytics.mockResolvedValue({ data: { goals: [] } });
    const { result } = renderHook(() => useGoalAnalyticsRead({ ...base, selectedVisualization: 'summary',
        resolvedGlobalFilters: { hasGoalFilter: false, hasActivityFilter: true, activityIds: new Set() },
    }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getGoalAnalytics).toHaveBeenCalledWith('root', expect.objectContaining({ activity_filter: 'true', activity_ids: [] }));
});

it('embedded legacy examples do not request authenticated chart reads', () => {
    renderHook(() => useGoalAnalyticsRead({ ...base, goalAnalytics: { goals: [] } }), { wrapper });
    expect(getGoalAnalytics).not.toHaveBeenCalled();
});
