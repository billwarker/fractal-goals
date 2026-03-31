import { useQuery } from '@tanstack/react-query';
import { fractalGoalsApi } from '../utils/api/fractalGoalsApi';
import { queryKeys } from './queryKeys';

export function useEligibleMoveParents(rootId, goalId, search, enabled = true) {
    return useQuery({
        queryKey: [...queryKeys.eligibleMoveParents(rootId, goalId), search],
        queryFn: () => fractalGoalsApi.getEligibleMoveParents(rootId, goalId, search),
        enabled: enabled && !!rootId && !!goalId,
        staleTime: 30_000,
    });
}
