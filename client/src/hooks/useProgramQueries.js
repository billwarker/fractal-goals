import { useQuery } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';

export function usePrograms(rootId) {
    const isReady = Boolean(rootId);

    const { data: programs = [], isLoading, error } = useQuery({
        queryKey: ['programs', rootId],
        queryFn: async () => {
            const res = await fractalApi.getPrograms(rootId);
            return res.data || [];
        },
        enabled: isReady,
        staleTime: 5 * 60 * 1000,
    });

    return { programs, isLoading, error };
}
