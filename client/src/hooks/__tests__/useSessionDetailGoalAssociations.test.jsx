import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryKeys } from '../queryKeys';
import { useSessionDetailGoalAssociations } from '../useSessionDetailGoalAssociations';

const {
    setActivityGoals,
    notify,
    useGoalsForSelection,
} = vi.hoisted(() => ({
    setActivityGoals: vi.fn(),
    notify: {
        success: vi.fn(),
        error: vi.fn(),
    },
    useGoalsForSelection: vi.fn(),
}));

vi.mock('../../utils/api', () => ({
    fractalApi: {
        setActivityGoals: (...args) => setActivityGoals(...args),
    },
}));

vi.mock('../../utils/notify', () => ({
    default: notify,
}));

vi.mock('../useGoalQueries', () => ({
    useGoalsForSelection: (...args) => useGoalsForSelection(...args),
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

describe('useSessionDetailGoalAssociations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useGoalsForSelection.mockReturnValue({
            goals: [
                {
                    id: 'short-1',
                    name: 'Short Goal',
                    type: 'ShortTermGoal',
                    immediateGoals: [
                        {
                            id: 'immediate-1',
                            name: 'Immediate Goal',
                            type: 'ImmediateGoal',
                        },
                    ],
                },
            ],
        });
    });

    it('updates canonical activity/session-goals caches and exposes flattened available goals', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
            },
        });
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
        queryClient.setQueryData(queryKeys.activities('root-1'), [
            { id: 'activity-1', associated_goal_ids: ['goal-old'] },
        ]);
        queryClient.setQueryData(queryKeys.sessionGoalsView('root-1', 'session-1'), {
            micro_goals: [
                { id: 'micro-1', name: 'Micro Goal', type: 'MicroGoal', parent_id: 'immediate-1' },
            ],
            activity_goal_ids_by_activity: {
                'activity-1': ['goal-old'],
            },
        });

        const associationContext = {
            activityDefinition: {
                id: 'activity-1',
                name: 'Activity One',
            },
            initialSelectedGoalIds: ['goal-old'],
        };
        let latestAssociationContext = associationContext;
        const setAssociationContext = vi.fn((updater) => {
            latestAssociationContext = typeof updater === 'function'
                ? updater(latestAssociationContext)
                : updater;
        });

        setActivityGoals.mockResolvedValueOnce({ data: { ok: true } });

        const { result } = renderHook(
            () => useSessionDetailGoalAssociations({
                rootId: 'root-1',
                sessionId: 'session-1',
                sessionGoalsView: queryClient.getQueryData(queryKeys.sessionGoalsView('root-1', 'session-1')),
                showAssociationModal: true,
                associationContext: latestAssociationContext,
                setAssociationContext,
            }),
            { wrapper: createWrapper(queryClient) }
        );

        expect(result.current.allAvailableGoals.map((goal) => goal.id)).toEqual([
            'short-1',
            'immediate-1',
            'micro-1',
        ]);

        let saved;
        await act(async () => {
            saved = await result.current.handleAssociateActivity(['goal-new']);
        });

        expect(saved).toBe(true);
        expect(setActivityGoals).toHaveBeenCalledWith('root-1', 'activity-1', ['goal-new']);
        expect(queryClient.getQueryData(queryKeys.activities('root-1'))).toEqual([
            { id: 'activity-1', associated_goal_ids: ['goal-new'] },
        ]);
        expect(queryClient.getQueryData(queryKeys.sessionGoalsView('root-1', 'session-1'))).toMatchObject({
            activity_goal_ids_by_activity: {
                'activity-1': ['goal-new'],
            },
        });
        expect(latestAssociationContext.initialSelectedGoalIds).toEqual(['goal-new']);
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.activities('root-1') });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.sessionGoalsView('root-1', 'session-1') });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.fractalTree('root-1') });
        expect(notify.success).toHaveBeenCalledWith('Activity associated successfully');
    });
});
