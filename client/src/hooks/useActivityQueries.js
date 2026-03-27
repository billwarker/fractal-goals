import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

export function useActivities(rootId) {
    const isReady = Boolean(rootId);

    const { data: activities = [], isLoading, error } = useQuery({
        queryKey: queryKeys.activities(rootId),
        queryFn: async () => {
            const res = await fractalApi.getActivities(rootId);
            return res.data || [];
        },
        enabled: isReady,
        staleTime: 5 * 60 * 1000,
    });

    return { activities, isLoading, error };
}

export function useActivityGroups(rootId) {
    const isReady = Boolean(rootId);

    const { data: activityGroups = [], isLoading, error } = useQuery({
        queryKey: queryKeys.activityGroups(rootId),
        queryFn: async () => {
            const res = await fractalApi.getActivityGroups(rootId);
            return res.data || [];
        },
        enabled: isReady,
        staleTime: 5 * 60 * 1000,
    });

    return { activityGroups, isLoading, error };
}

export function useActivityModes(rootId) {
    const isReady = Boolean(rootId);

    const { data: activityModes = [], isLoading, error } = useQuery({
        queryKey: queryKeys.activityModes(rootId),
        queryFn: async () => {
            const res = await fractalApi.getActivityModes(rootId);
            return res.data || [];
        },
        enabled: isReady,
        staleTime: 5 * 60 * 1000,
    });

    return { activityModes, isLoading, error };
}

export function useCreateActivity(rootId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload) => fractalApi.createActivity(rootId, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.activities(rootId) });
        }
    });
}

export function useDeleteActivity(rootId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (activityId) => fractalApi.deleteActivity(rootId, activityId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.activities(rootId) });
        }
    });
}

export function useCreateActivityMode(rootId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload) => fractalApi.createActivityMode(rootId, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.activityModes(rootId) });
        },
    });
}

export function useUpdateActivityMode(rootId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ modeId, ...payload }) => fractalApi.updateActivityMode(rootId, modeId, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.activityModes(rootId) });
        },
    });
}

export function useDeleteActivityMode(rootId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (modeId) => fractalApi.deleteActivityMode(rootId, modeId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.activityModes(rootId) });
            queryClient.invalidateQueries({ queryKey: ['session-activities', rootId] });
            queryClient.invalidateQueries({ queryKey: ['analytics-sessions', rootId] });
        },
    });
}

export function useFractalMetrics(rootId) {
    const isReady = Boolean(rootId);

    const { data: fractalMetrics = [], isLoading, error } = useQuery({
        queryKey: queryKeys.fractalMetrics(rootId),
        queryFn: async () => {
            const res = await fractalApi.getFractalMetrics(rootId);
            return res.data || [];
        },
        enabled: isReady,
        staleTime: 5 * 60 * 1000,
    });

    return { fractalMetrics, isLoading, error };
}

export function useCreateFractalMetric(rootId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload) => fractalApi.createFractalMetric(rootId, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.fractalMetrics(rootId) });
        },
    });
}

export function useUpdateFractalMetric(rootId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ metricId, ...payload }) => fractalApi.updateFractalMetric(rootId, metricId, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.fractalMetrics(rootId) });
        },
    });
}

export function useDeleteFractalMetric(rootId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (metricId) => fractalApi.deleteFractalMetric(rootId, metricId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.fractalMetrics(rootId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.activities(rootId) });
        },
    });
}
