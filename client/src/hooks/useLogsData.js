import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

export function useLogsData(rootId, { page, pageSize, eventType, startDate, endDate }) {
    const queryClient = useQueryClient();

    const logsQuery = useQuery({
        queryKey: queryKeys.logs(rootId, page, pageSize, eventType, startDate, endDate),
        enabled: Boolean(rootId),
        queryFn: async () => {
            const offset = (page - 1) * pageSize;
            const response = await fractalApi.getLogs(rootId, {
                limit: pageSize,
                offset,
                event_type: eventType !== 'all' ? eventType : undefined,
                start_date: startDate || undefined,
                end_date: endDate || undefined,
            });
            return response.data;
        },
        staleTime: 60 * 1000,
        placeholderData: (previousData) => previousData,
    });

    const clearLogsMutation = useMutation({
        mutationFn: async () => fractalApi.clearLogs(rootId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.logs(rootId) });
            queryClient.removeQueries({ queryKey: ['logs', rootId, 'infinite'] });
        }
    });

    return {
        logs: logsQuery.data?.logs || [],
        total: logsQuery.data?.pagination?.total || 0,
        eventTypes: logsQuery.data?.event_types || [],
        isLoading: logsQuery.isLoading,
        isFetching: logsQuery.isFetching,
        refetch: logsQuery.refetch,
        clearLogs: clearLogsMutation.mutateAsync,
        isClearing: clearLogsMutation.isPending
    };
}
