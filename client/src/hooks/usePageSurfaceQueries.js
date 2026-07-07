import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';

function getErrorMessage(error, fallbackMessage) {
    return error?.response?.data?.error
        || error?.response?.data?.message
        || fallbackMessage;
}

/**
 * CRUD hook for user-configurable page surface layouts. Mirrors
 * useAnalyticsViews: query-first reads, mutations invalidate the family.
 */
export function usePageSurfaces(rootId, page = 'goals', options = {}) {
    const queryClient = useQueryClient();
    const queryKey = queryKeys.pageSurfaces(rootId, page);

    const query = useQuery({
        queryKey,
        queryFn: async () => {
            const response = await fractalApi.getPageSurfaces(rootId, page);
            return response.data?.data || [];
        },
        enabled: Boolean(rootId) && options.enabled !== false,
        staleTime: 30 * 1000,
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey });
    };

    const createMutation = useMutation({
        mutationFn: (data) => fractalApi.createPageSurface(rootId, { page, ...data }),
        onSuccess: invalidate,
        onError: (error) => notify.error(getErrorMessage(error, 'Failed to save surface layout')),
    });

    const updateMutation = useMutation({
        mutationFn: ({ layoutId, ...data }) => fractalApi.updatePageSurface(rootId, layoutId, data),
        onSuccess: invalidate,
        onError: (error) => notify.error(getErrorMessage(error, 'Failed to update surface layout')),
    });

    const setDefaultMutation = useMutation({
        mutationFn: (layoutId) => fractalApi.setDefaultPageSurface(rootId, layoutId),
        onSuccess: invalidate,
        onError: (error) => notify.error(getErrorMessage(error, 'Failed to set default surface layout')),
    });

    const deleteMutation = useMutation({
        mutationFn: (layoutId) => fractalApi.deletePageSurface(rootId, layoutId),
        onSuccess: invalidate,
        onError: (error) => notify.error(getErrorMessage(error, 'Failed to delete surface layout')),
    });

    return {
        surfaces: query.data || [],
        isLoading: query.isLoading,
        error: query.error,
        createSurface: async (data) => {
            const response = await createMutation.mutateAsync(data);
            return response.data?.data || null;
        },
        updateSurface: async ({ layoutId, ...data }) => {
            const response = await updateMutation.mutateAsync({ layoutId, ...data });
            return response.data?.data || null;
        },
        setDefaultSurface: async (layoutId) => {
            const response = await setDefaultMutation.mutateAsync(layoutId);
            return response.data?.data || null;
        },
        deleteSurface: async (layoutId) => {
            await deleteMutation.mutateAsync(layoutId);
        },
    };
}
