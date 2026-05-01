import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { formatError } from '../utils/mutationNotify';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';

export function useGoalOptionsMutations(rootId, goalId) {
    const queryClient = useQueryClient();

    const invalidateGoalQueries = useMemo(() => async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.fractalTree(rootId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.goals(rootId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.goalsForSelection(rootId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.goalMetrics(goalId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.eligibleMoveParents(rootId, goalId) }),
        ]);
    }, [goalId, queryClient, rootId]);

    const copyMutation = useMutation({
        mutationFn: async () => {
            const response = await fractalApi.copyGoal(rootId, goalId);
            return response.data;
        },
        onSuccess: async () => {
            await invalidateGoalQueries();
        },
        onError: (error) => notify.error(`Failed to copy goal: ${formatError(error)}`),
    });

    const pauseMutation = useMutation({
        mutationFn: async (paused) => {
            const response = await fractalApi.pauseGoal(rootId, goalId, paused);
            return response.data;
        },
        onSuccess: async (_goal, paused) => {
            await invalidateGoalQueries();
            notify.success(paused ? 'Goal paused' : 'Goal resumed');
        },
        onError: (error, paused) => notify.error(
            `Failed to ${paused ? 'pause' : 'resume'} goal: ${formatError(error)}`
        ),
    });

    const moveMutation = useMutation({
        mutationFn: async (newParentId) => {
            const response = await fractalApi.moveGoal(rootId, goalId, newParentId);
            return response.data;
        },
        onSuccess: async () => {
            await invalidateGoalQueries();
            notify.success('Goal moved');
        },
        onError: (error) => notify.error(`Failed to move goal: ${formatError(error)}`),
    });

    const convertLevelMutation = useMutation({
        mutationFn: async (levelId) => {
            const response = await fractalApi.convertGoalLevel(rootId, goalId, levelId);
            return response.data;
        },
        onSuccess: async () => {
            await invalidateGoalQueries();
            notify.success('Goal level converted');
        },
        onError: (error) => notify.error(`Failed to convert level: ${formatError(error)}`),
    });

    return {
        isLoading: copyMutation.isPending
            || pauseMutation.isPending
            || moveMutation.isPending
            || convertLevelMutation.isPending,
        copyGoal: () => copyMutation.mutateAsync(),
        pauseGoal: (paused) => pauseMutation.mutateAsync(paused),
        freezeGoal: (frozen) => pauseMutation.mutateAsync(frozen),
        moveGoal: (newParentId) => moveMutation.mutateAsync(newParentId),
        convertGoalLevel: (levelId) => convertLevelMutation.mutateAsync(levelId),
    };
}

export default useGoalOptionsMutations;
