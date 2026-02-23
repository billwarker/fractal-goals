import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { flattenGoals } from '../utils/goalHelpers';

export function useProgramsPageData(rootId) {
    const programsQuery = useQuery({
        queryKey: ['programs', rootId],
        enabled: Boolean(rootId),
        queryFn: async () => {
            const response = await fractalApi.getPrograms(rootId);
            return response.data || [];
        }
    });

    const goalsQuery = useQuery({
        queryKey: ['goals-tree', rootId],
        enabled: Boolean(rootId),
        queryFn: async () => {
            const response = await fractalApi.getGoals(rootId);
            return response.data || null;
        }
    });

    const goals = useMemo(() => {
        if (!goalsQuery.data) return [];
        return flattenGoals([goalsQuery.data]);
    }, [goalsQuery.data]);

    return {
        programs: programsQuery.data || [],
        goals,
        loading: programsQuery.isLoading || goalsQuery.isLoading,
        refetchPrograms: programsQuery.refetch,
        refetchGoals: goalsQuery.refetch
    };
}
