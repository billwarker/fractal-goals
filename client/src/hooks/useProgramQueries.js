import { useQuery } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

export async function fetchPrograms(rootId) {
    const response = await fractalApi.getPrograms(rootId);
    return response.data || [];
}

export function usePrograms(rootId) {
    const isReady = Boolean(rootId);

    const { data: programs = [], isLoading, error } = useQuery({
        queryKey: queryKeys.programs(rootId),
        queryFn: () => fetchPrograms(rootId),
        enabled: isReady,
        staleTime: 5 * 60 * 1000,
    });

    return { programs, isLoading, error };
}
