import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { useRootProgressSettings } from '../useRootProgressSettings';
import { queryKeys } from '../queryKeys';

const updateGoal = vi.fn();
let mockTree = null;

vi.mock('../../utils/api', () => ({
    fractalApi: {
        updateGoal: (...args) => updateGoal(...args),
    },
}));

vi.mock('../useGoalQueries', () => ({
    useFractalTree: () => ({ data: mockTree }),
}));

function createWrapper(queryClient) {
    return function Wrapper({ children }) {
        return (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
    };
}

describe('useRootProgressSettings', () => {
    it('exposes a default active window and invalidates FlowTree evidence after updates', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
            },
        });
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
        mockTree = {
            id: 'root-1',
            attributes: {
                progress_settings: {
                    active_goal_window_days: 120,
                },
            },
        };
        updateGoal.mockResolvedValueOnce({
            data: {
                attributes: {
                    progress_settings: {
                        active_goal_window_days: 14,
                    },
                },
            },
        });

        const { result } = renderHook(
            () => useRootProgressSettings('root-1'),
            { wrapper: createWrapper(queryClient) }
        );

        expect(result.current.activeGoalWindowDays).toBe(90);

        await result.current.updateProgressSettings({ active_goal_window_days: 14 });

        await waitFor(() => {
            expect(updateGoal).toHaveBeenCalledWith('root-1', 'root-1', {
                progress_settings: { active_goal_window_days: 14 },
            });
        });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.sessionsEvidenceGoalsRoot('root-1') });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.sessionsFlowtreeMetricsRoot('root-1') });
    });
});
