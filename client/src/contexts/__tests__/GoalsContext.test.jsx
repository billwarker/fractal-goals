import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GoalsProvider, useGoals } from '../GoalsContext';
import { queryKeys } from '../../hooks/queryKeys';

const {
    createGoal,
    updateGoal,
    deleteGoal,
    toggleGoalCompletion,
    notify,
} = vi.hoisted(() => ({
    createGoal: vi.fn(),
    updateGoal: vi.fn(),
    deleteGoal: vi.fn(),
    toggleGoalCompletion: vi.fn(),
    notify: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('../../utils/api', () => ({
    fractalApi: {
        createGoal: (...args) => createGoal(...args),
        updateGoal: (...args) => updateGoal(...args),
        deleteGoal: (...args) => deleteGoal(...args),
        toggleGoalCompletion: (...args) => toggleGoalCompletion(...args),
    },
}));

vi.mock('../../utils/notify', () => ({
    default: notify,
}));

function createWrapper(queryClient) {
    return function Wrapper({ children }) {
        return (
            <QueryClientProvider client={queryClient}>
                <GoalsProvider>{children}</GoalsProvider>
            </QueryClientProvider>
        );
    };
}

describe('GoalsContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows create success and error toasts', async () => {
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
        createGoal.mockResolvedValueOnce({ data: { id: 'goal-1' } });
        createGoal.mockRejectedValueOnce(new Error('Nope'));

        const { result } = renderHook(() => useGoals(), {
            wrapper: createWrapper(queryClient),
        });

        await act(async () => {
            await result.current.createGoal('root-1', { name: 'Goal' });
        });

        await expect(result.current.createGoal('root-1', { name: 'Goal' })).rejects.toThrow('Nope');

        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.fractalTree('root-1') });
        expect(notify.success).toHaveBeenCalledWith('Goal created');
        expect(notify.error).toHaveBeenCalledWith('Failed to create goal: Nope');
    });

    it('keeps update success silent but shows errors', async () => {
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
        updateGoal.mockResolvedValueOnce({ data: { id: 'goal-1' } });
        updateGoal.mockRejectedValueOnce(new Error('Update failed'));

        const { result } = renderHook(() => useGoals(), {
            wrapper: createWrapper(queryClient),
        });

        await act(async () => {
            await result.current.updateGoal('root-1', 'goal-1', { name: 'Updated' });
        });

        await expect(result.current.updateGoal('root-1', 'goal-1', { name: 'Updated' })).rejects.toThrow('Update failed');

        expect(notify.success).not.toHaveBeenCalled();
        expect(notify.error).toHaveBeenCalledWith('Failed to update goal: Update failed');
    });

    it('shows toggle completion success and error toasts', async () => {
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
        toggleGoalCompletion.mockResolvedValueOnce({
            data: { id: 'goal-1', name: 'Finish plan', type: 'ShortTermGoal' },
        });
        toggleGoalCompletion.mockRejectedValueOnce(new Error('Toggle failed'));

        const { result } = renderHook(() => useGoals(), {
            wrapper: createWrapper(queryClient),
        });

        await act(async () => {
            await result.current.toggleGoalCompletion('root-1', 'goal-1', true);
        });

        await expect(result.current.toggleGoalCompletion('root-1', 'goal-1', false)).rejects.toThrow('Toggle failed');

        expect(notify.success).toHaveBeenCalledWith('Short Term Goal Completed: Finish plan');
        expect(notify.error).toHaveBeenCalledWith('Failed to toggle goal: Toggle failed');
    });
});
