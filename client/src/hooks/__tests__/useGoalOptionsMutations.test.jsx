import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useGoalOptionsMutations } from '../useGoalOptionsMutations';
import { queryKeys } from '../queryKeys';

const copyGoal = vi.fn();
const freezeGoal = vi.fn();
const moveGoal = vi.fn();
const convertGoalLevel = vi.fn();
const notifySuccess = vi.fn();
const notifyError = vi.fn();

vi.mock('../../utils/api', () => ({
    fractalApi: {
        copyGoal: (...args) => copyGoal(...args),
        freezeGoal: (...args) => freezeGoal(...args),
        moveGoal: (...args) => moveGoal(...args),
        convertGoalLevel: (...args) => convertGoalLevel(...args),
    },
}));

vi.mock('../../utils/notify', () => ({
    default: {
        success: (...args) => notifySuccess(...args),
        error: (...args) => notifyError(...args),
    },
}));

function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
}

function createWrapper(queryClient) {
    return function Wrapper({ children }) {
        return (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
    };
}

describe('useGoalOptionsMutations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('copies a goal and invalidates the shared goal query families', async () => {
        const queryClient = createQueryClient();
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
        copyGoal.mockResolvedValueOnce({ data: { id: 'goal-2', name: 'Copied Goal' } });

        const { result } = renderHook(
            () => useGoalOptionsMutations('root-1', 'goal-1'),
            { wrapper: createWrapper(queryClient) }
        );

        let copiedGoal;
        await act(async () => {
            copiedGoal = await result.current.copyGoal();
        });

        expect(copiedGoal).toEqual({ id: 'goal-2', name: 'Copied Goal' });
        expect(copyGoal).toHaveBeenCalledWith('root-1', 'goal-1');
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.fractalTree('root-1') });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.goals('root-1') });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.goalsForSelection('root-1') });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.goalMetrics('goal-1') });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.eligibleMoveParents('root-1', 'goal-1') });
    });

    it('shows success feedback for freeze, move, and convert mutations', async () => {
        const queryClient = createQueryClient();
        vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
        freezeGoal.mockResolvedValueOnce({ data: { id: 'goal-1', frozen: true } });
        moveGoal.mockResolvedValueOnce({ data: { id: 'goal-1', parent_id: 'parent-2' } });
        convertGoalLevel.mockResolvedValueOnce({ data: { id: 'goal-1', level_id: 'level-2' } });

        const { result } = renderHook(
            () => useGoalOptionsMutations('root-1', 'goal-1'),
            { wrapper: createWrapper(queryClient) }
        );

        await act(async () => {
            await result.current.freezeGoal(true);
            await result.current.moveGoal('parent-2');
            await result.current.convertGoalLevel('level-2');
        });

        await waitFor(() => {
            expect(notifySuccess).toHaveBeenCalledWith('Goal frozen');
            expect(notifySuccess).toHaveBeenCalledWith('Goal moved');
            expect(notifySuccess).toHaveBeenCalledWith('Goal level converted');
        });
    });
});
