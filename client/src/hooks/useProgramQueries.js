import { useQuery } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

export async function fetchPrograms(rootId, timezone = null) {
    const response = await fractalApi.getPrograms(rootId, timezone ? { timezone } : undefined);
    return response.data || [];
}

export function usePrograms(rootId, timezone = null) {
    const isReady = Boolean(rootId);

    const { data: programs = [], isLoading, error } = useQuery({
        queryKey: queryKeys.programs(rootId, timezone),
        queryFn: () => fetchPrograms(rootId, timezone),
        enabled: isReady,
        staleTime: 5 * 60 * 1000,
    });

    return { programs, isLoading, error };
}
