import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { globalApi } from '../utils/api';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';


function getErrorMessage(error, fallbackMessage) {
    return error?.response?.data?.error
        || error?.response?.data?.message
        || fallbackMessage;
}


export function useAnalyticsEngine() {
    const queryClient = useQueryClient();

    const catalogQuery = useQuery({
        queryKey: queryKeys.analyticsCatalog(),
        queryFn: async () => {
            const response = await globalApi.getAnalyticsCatalog();
            return response.data || { datasets: [], operators: [], aggregations: [] };
        },
        staleTime: 5 * 60 * 1000,
    });

    const profilesQuery = useQuery({
        queryKey: queryKeys.analyticsQueryProfiles(),
        queryFn: async () => {
            const response = await globalApi.getAnalyticsQueryProfiles();
            return response.data?.data || [];
        },
        staleTime: 30 * 1000,
    });

    const runMutation = useMutation({
        mutationFn: (querySpec) => globalApi.runAnalyticsQuery(querySpec),
        onError: (error) => notify.error(getErrorMessage(error, 'Failed to run analytics query')),
    });

    const createProfileMutation = useMutation({
        mutationFn: (data) => globalApi.createAnalyticsQueryProfile(data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.analyticsQueryProfiles() }),
        onError: (error) => notify.error(getErrorMessage(error, 'Failed to save analytics query profile')),
    });

    const updateProfileMutation = useMutation({
        mutationFn: ({ profileId, ...data }) => globalApi.updateAnalyticsQueryProfile(profileId, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.analyticsQueryProfiles() }),
        onError: (error) => notify.error(getErrorMessage(error, 'Failed to update analytics query profile')),
    });

    const deleteProfileMutation = useMutation({
        mutationFn: (profileId) => globalApi.deleteAnalyticsQueryProfile(profileId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.analyticsQueryProfiles() }),
        onError: (error) => notify.error(getErrorMessage(error, 'Failed to delete analytics query profile')),
    });

    return {
        catalog: catalogQuery.data || { datasets: [], operators: [], aggregations: [] },
        catalogLoading: catalogQuery.isLoading,
        catalogError: catalogQuery.error,
        refetchCatalog: catalogQuery.refetch,
        profiles: profilesQuery.data || [],
        profilesLoading: profilesQuery.isLoading,
        runQuery: async (querySpec) => {
            const response = await runMutation.mutateAsync(querySpec);
            return response.data;
        },
        isRunning: runMutation.isPending,
        createProfile: async (data) => {
            const response = await createProfileMutation.mutateAsync(data);
            return response.data?.data || null;
        },
        updateProfile: async ({ profileId, ...data }) => {
            const response = await updateProfileMutation.mutateAsync({ profileId, ...data });
            return response.data?.data || null;
        },
        deleteProfile: async (profileId) => {
            await deleteProfileMutation.mutateAsync(profileId);
        },
    };
}
