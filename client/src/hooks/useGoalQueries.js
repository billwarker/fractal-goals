import { useQuery } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

export function useFractalTree(rootId, options = {}) {
    const isReady = Boolean(rootId);
    const enabled = options.enabled ?? true;
    const staleTime = options.staleTime ?? 5 * 60 * 1000;

    return useQuery({
        queryKey: queryKeys.fractalTree(rootId),
        queryFn: async () => {
            const res = await fractalApi.getGoals(rootId);
            return res.data;
        },
        enabled: isReady && enabled,
        staleTime,
    });
}

export function useGoalAssociations(rootId, goalId) {
    const isReady = Boolean(rootId && goalId);

    const { data: activities = [], isLoading: isLoadingActivities } = useQuery({
        queryKey: queryKeys.goalActivities(rootId, goalId),
        queryFn: async () => {
            const res = await fractalApi.getGoalActivities(rootId, goalId);
            return res.data || [];
        },
        enabled: isReady,
        staleTime: 5 * 60 * 1000, // 5 minutes cache
    });

    const { data: groups = [], isLoading: isLoadingGroups } = useQuery({
        queryKey: queryKeys.goalActivityGroups(rootId, goalId),
        queryFn: async () => {
            const res = await fractalApi.getGoalActivityGroups(rootId, goalId);
            return res.data || [];
        },
        enabled: isReady,
        staleTime: 5 * 60 * 1000,
    });

    return {
        activities,
        groups,
        isLoading: isLoadingActivities || isLoadingGroups,
    };
}

export function useGoalMetrics(goalId) {
    const isReady = Boolean(goalId);

    const { data: metrics = null, isLoading } = useQuery({
        queryKey: queryKeys.goalMetrics(goalId),
        queryFn: async () => {
            const res = await fractalApi.getGoalMetrics(goalId);
            return res.data || null;
        },
        enabled: isReady,
        staleTime: 2 * 60 * 1000,
    });

    return { metrics, isLoading };
}

export function useGoalDailyDurations(goalId, enabled = false) {
    return useQuery({
        queryKey: queryKeys.goalDailyDurations(goalId),
        queryFn: async () => {
            const res = await fractalApi.getGoalDailyDurations(goalId);
            return res.data || { points: [] };
        },
        enabled: Boolean(goalId && enabled),
        staleTime: 5 * 60 * 1000,
    });
}

export function useGoalsForSelection(rootId, options = {}) {
    const isReady = Boolean(rootId);
    const enabled = options.enabled ?? true;
    const staleTime = options.staleTime ?? 5 * 60 * 1000;

    const { data: goals = [], isLoading, error } = useQuery({
        queryKey: queryKeys.goalsForSelection(rootId),
        queryFn: async () => {
            const res = await fractalApi.getGoalsForSelection(rootId);
            return res.data || [];
        },
        enabled: isReady && enabled,
        staleTime,
    });

    return { goals, isLoading, error };
}
