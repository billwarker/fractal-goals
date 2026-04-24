import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { flattenGoals } from '../utils/goalHelpers';
import { queryKeys } from './queryKeys';
import { useFractalTree } from './useGoalQueries';

export function useProgramsPageData(rootId) {
    const programsQuery = useQuery({
        queryKey: queryKeys.programs(rootId),
        enabled: Boolean(rootId),
        queryFn: async () => {
            const response = await fractalApi.getPrograms(rootId);
            return response.data || [];
        },
    });

    const goalsQuery = useFractalTree(rootId);

    const goals = useMemo(() => {
        if (!goalsQuery.data) return [];
        return flattenGoals([goalsQuery.data]);
    }, [goalsQuery.data]);

    return {
        programs: programsQuery.data || [],
        goals,
        loading: programsQuery.isLoading || goalsQuery.isLoading,
        treeData: goalsQuery.data || null,
        refetchPrograms: programsQuery.refetch,
        refetchGoals: goalsQuery.refetch,
    };
}
