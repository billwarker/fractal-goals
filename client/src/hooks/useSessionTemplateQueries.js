import { useQuery } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

export async function fetchSessionTemplates(rootId) {
    const response = await fractalApi.getSessionTemplates(rootId);
    return response.data || [];
}

export function useSessionTemplates(rootId) {
    const isReady = Boolean(rootId);

    const { data: sessionTemplates = [], isLoading, error } = useQuery({
        queryKey: queryKeys.sessionTemplates(rootId),
        queryFn: () => fetchSessionTemplates(rootId),
        enabled: isReady,
        staleTime: 5 * 60 * 1000,
    });

    return { sessionTemplates, isLoading, error };
}
