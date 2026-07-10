import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { invalidateOnboardingProgress } from '../utils/queryInvalidation';
import { queryKeys } from './queryKeys';

export function useActivities(rootId, options = {}) {
    const isReady = Boolean(rootId);
    const enabled = options.enabled ?? true;

    const { data: activities = [], isLoading, error } = useQuery({
        queryKey: queryKeys.activities(rootId),
        queryFn: async () => {
            const res = await fractalApi.getActivities(rootId);
            return res.data || [];
        },
        enabled: isReady && enabled,
        staleTime: 5 * 60 * 1000,
    });

    return { activities, isLoading, error };
}

export function useActivityGroups(rootId, options = {}) {
    const isReady = Boolean(rootId);
    const enabled = options.enabled ?? true;

    const { data: activityGroups = [], isLoading, error } = useQuery({
        queryKey: queryKeys.activityGroups(rootId),
        queryFn: async () => {
            const res = await fractalApi.getActivityGroups(rootId);
            return res.data || [];
        },
        enabled: isReady && enabled,
        staleTime: 5 * 60 * 1000,
    });

    return { activityGroups, isLoading, error };
}

export function useCreateActivity(rootId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload) => fractalApi.createActivity(rootId, payload),
        onSuccess: async () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.activities(rootId) });
            await invalidateOnboardingProgress(queryClient, queryKeys);
        }
    });
}

export function useDeleteActivity(rootId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (activityId) => fractalApi.deleteActivity(rootId, activityId),
        onSuccess: async () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.activities(rootId) });
            await invalidateOnboardingProgress(queryClient, queryKeys);
        }
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

function upsertFractalMetric(metrics = [], metric) {
    if (!metric?.id) return metrics;
    const existingIndex = metrics.findIndex((item) => item.id === metric.id);
    if (existingIndex === -1) {
        return [...metrics, metric];
    }
    return metrics.map((item) => (item.id === metric.id ? metric : item));
}

export function useCreateFractalMetric(rootId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload) => fractalApi.createFractalMetric(rootId, payload),
        onSuccess: (response) => {
            queryClient.setQueryData(
                queryKeys.fractalMetrics(rootId),
                (current = []) => upsertFractalMetric(current, response?.data)
            );
            queryClient.invalidateQueries({ queryKey: queryKeys.fractalMetrics(rootId), refetchType: 'inactive' });
        },
    });
}

export function useUpdateFractalMetric(rootId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ metricId, ...payload }) => fractalApi.updateFractalMetric(rootId, metricId, payload),
        onSuccess: (response) => {
            queryClient.setQueryData(
                queryKeys.fractalMetrics(rootId),
                (current = []) => upsertFractalMetric(current, response?.data)
            );
            queryClient.invalidateQueries({ queryKey: queryKeys.fractalMetrics(rootId), refetchType: 'inactive' });
        },
    });
}

export function useDeleteFractalMetric(rootId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (metricId) => fractalApi.deleteFractalMetric(rootId, metricId),
        onSuccess: (_response, metricId) => {
            queryClient.setQueryData(
                queryKeys.fractalMetrics(rootId),
                (current = []) => current.filter((metric) => metric.id !== metricId)
            );
            queryClient.invalidateQueries({ queryKey: queryKeys.fractalMetrics(rootId), refetchType: 'inactive' });
            queryClient.invalidateQueries({ queryKey: queryKeys.activities(rootId) });
        },
    });
}
