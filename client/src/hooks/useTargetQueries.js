import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { formatError } from '../utils/mutationNotify';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';

/**
 * Analytics read model for a single target: the target, its activity definition,
 * the contributing activity instances since the target's start, and a progress
 * summary against each metric condition.
 */
export function useTargetAnalytics(rootId, targetId, options = {}) {
    const since = options.since === 'all' ? 'all' : 'creation';
    const enabled = (options.enabled ?? true) && Boolean(rootId && targetId);

    return useQuery({
        queryKey: queryKeys.targetAnalytics(rootId, targetId, since),
        queryFn: async () => {
            const res = await fractalApi.getTargetAnalytics(rootId, targetId, since);
            return res.data || null;
        },
        enabled,
        staleTime: 60 * 1000,
    });
}

/**
 * Instances + activity definition for a goal/activity pair (no saved target).
 * Powers the live graph preview while creating or editing a target.
 */
export function useGoalActivityInstances(rootId, goalId, activityId, options = {}) {
    const enabled = (options.enabled ?? true) && Boolean(rootId && goalId && activityId);

    return useQuery({
        queryKey: queryKeys.goalActivityInstances(rootId, goalId, activityId),
        queryFn: async () => {
            const res = await fractalApi.getGoalActivityInstances(rootId, goalId, activityId);
            return res.data || null;
        },
        enabled,
        staleTime: 60 * 1000,
    });
}

/**
 * Create / update / delete a single target directly against the per-target API,
 * persisting immediately without requiring a full goal save. Mirrors the goal
 * options mutation invalidation set so the tree, metrics, and timeline refresh.
 */
export function useTargetMutations(rootId, goalId) {
    const queryClient = useQueryClient();

    const invalidateTargetQueries = useMemo(() => async (targetId) => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.fractalTree(rootId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.goals(rootId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.goalsForSelection(rootId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.goalMetrics(goalId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.goalTimelineRoot(rootId, goalId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.goalActivityInstancesRoot(rootId, goalId) }),
            targetId
                ? queryClient.invalidateQueries({ queryKey: queryKeys.targetAnalyticsRoot(rootId, targetId) })
                : Promise.resolve(),
        ]);
    }, [goalId, queryClient, rootId]);

    const createMutation = useMutation({
        mutationFn: async (data) => {
            const response = await fractalApi.createGoalTarget(goalId, data);
            return response.data;
        },
        onSuccess: async () => {
            await invalidateTargetQueries();
            notify.success('Target created');
        },
        onError: (error) => notify.error(`Failed to create target: ${formatError(error)}`),
    });

    const updateMutation = useMutation({
        mutationFn: async ({ targetId, data }) => {
            const response = await fractalApi.updateGoalTarget(goalId, targetId, data);
            return response.data;
        },
        onSuccess: async (_data, variables) => {
            await invalidateTargetQueries(variables?.targetId);
            notify.success('Target updated');
        },
        onError: (error) => notify.error(`Failed to update target: ${formatError(error)}`),
    });

    const deleteMutation = useMutation({
        mutationFn: async (targetId) => {
            const response = await fractalApi.deleteGoalTarget(goalId, targetId);
            return response.data;
        },
        onSuccess: async (_data, targetId) => {
            await invalidateTargetQueries(targetId);
            notify.success('Target deleted');
        },
        onError: (error) => notify.error(`Failed to delete target: ${formatError(error)}`),
    });

    return {
        isLoading: createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
        createTarget: (data) => createMutation.mutateAsync(data),
        updateTarget: (targetId, data) => updateMutation.mutateAsync({ targetId, data }),
        deleteTarget: (targetId) => deleteMutation.mutateAsync(targetId),
    };
}

export default useTargetMutations;
