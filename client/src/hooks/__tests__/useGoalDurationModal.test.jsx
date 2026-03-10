import { act, renderHook, waitFor } from '@testing-library/react';

import useGoalDurationModal from '../useGoalDurationModal';

const useGoalDailyDurations = vi.fn();

vi.mock('../useGoalQueries', () => ({
    useGoalDailyDurations: (...args) => useGoalDailyDurations(...args),
}));

describe('useGoalDurationModal', () => {
    it('builds graph modal config from fetched duration points', async () => {
        useGoalDailyDurations.mockImplementation((goalId, enabled) => ({
            data: enabled
                ? {
                    points: [
                        { date: '2026-03-01', activity_duration: 600 },
                        { date: '2026-03-02', activity_duration: 1200 },
                    ]
                }
                : null,
            isSuccess: enabled,
        }));

        const { result } = renderHook(() => useGoalDurationModal({
            goalId: 'goal-1',
            goalName: 'Deep Work',
            fallbackName: 'Fallback',
            goalType: 'ShortTermGoal',
            goalColor: '#22d3ee',
            goalIcon: 'diamond',
            goalSecondaryColor: '#0f172a',
            isSmart: true,
        }));

        act(() => {
            result.current.openDurationModal();
        });

        await waitFor(() => {
            expect(result.current.graphModalConfig?.title).toBe('Deep Work');
        });

        expect(result.current.graphModalConfig?.graphData.datasets[0].data).toEqual([10, 20]);
        expect(result.current.graphModalConfig?.goalType).toBe('ShortTermGoal');
        expect(result.current.graphModalConfig?.goalIcon).toBe('diamond');
        expect(result.current.graphModalConfig?.goalSecondaryColor).toBe('#0f172a');
        expect(result.current.graphModalConfig?.isSmart).toBe(true);
        expect(result.current.graphModalConfig?.type).toBe('bar');
    });
});
