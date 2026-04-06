import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';

function getErrorMessage(error, fallbackMessage) {
    return error?.response?.data?.error
        || error?.response?.data?.message
        || fallbackMessage;
}

export function useAnalyticsViews(rootId) {
    const queryClient = useQueryClient();
    const queryKey = queryKeys.analyticsViews(rootId);

    const query = useQuery({
        queryKey,
        queryFn: async () => {
            const response = await fractalApi.getAnalyticsViews(rootId);
            return response.data?.data || [];
        },
        enabled: Boolean(rootId),
        staleTime: 30 * 1000,
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey });
    };

    const createMutation = useMutation({
        mutationFn: (data) => fractalApi.createAnalyticsView(rootId, data),
        onSuccess: invalidate,
        onError: (error) => notify.error(getErrorMessage(error, 'Failed to create analytics view')),
    });

    const updateMutation = useMutation({
        mutationFn: ({ dashboardId, ...data }) => fractalApi.updateAnalyticsView(rootId, dashboardId, data),
        onSuccess: invalidate,
        onError: (error) => notify.error(getErrorMessage(error, 'Failed to update analytics view')),
    });

    const deleteMutation = useMutation({
        mutationFn: (dashboardId) => fractalApi.deleteAnalyticsView(rootId, dashboardId),
        onSuccess: invalidate,
        onError: (error) => notify.error(getErrorMessage(error, 'Failed to delete analytics view')),
    });

    return {
        analyticsViews: query.data || [],
        isLoading: query.isLoading,
        error: query.error,
        createAnalyticsView: async (data) => {
            const response = await createMutation.mutateAsync(data);
            return response.data?.data || null;
        },
        updateAnalyticsView: async ({ dashboardId, ...data }) => {
            const response = await updateMutation.mutateAsync({ dashboardId, ...data });
            return response.data?.data || null;
        },
        deleteAnalyticsView: async (dashboardId) => {
            await deleteMutation.mutateAsync(dashboardId);
        },
    };
}

export const useDashboards = useAnalyticsViews;
