import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';

export function useActivities(rootId) {
    const isReady = Boolean(rootId);

    const { data: activities = [], isLoading, error } = useQuery({
        queryKey: ['activities', rootId],
        queryFn: async () => {
            const res = await fractalApi.getActivities(rootId);
            return res.data || [];
        },
        enabled: isReady,
        staleTime: 5 * 60 * 1000,
    });

    return { activities, isLoading, error };
}

export function useCreateActivity(rootId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload) => fractalApi.createActivity(rootId, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['activities', rootId] });
        }
    });
}

export function useDeleteActivity(rootId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (activityId) => fractalApi.deleteActivity(rootId, activityId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['activities', rootId] });
        }
    });
}
