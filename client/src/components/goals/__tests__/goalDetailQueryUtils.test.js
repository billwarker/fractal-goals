import { QueryClient } from '@tanstack/react-query';

import { invalidateGoalAssociationQueries, invalidateGoalSessionQueries } from '../goalDetailQueryUtils';
import { queryKeys } from '../../../hooks/queryKeys';

function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        }
    });
}

describe('goalDetailQueryUtils', () => {
    it('invalidates all goal association caches together', async () => {
        const queryClient = createQueryClient();
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

        await invalidateGoalAssociationQueries(queryClient, 'root-1', 'goal-1');

        expect(invalidateSpy).toHaveBeenCalledTimes(4);
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.goalActivities('root-1', 'goal-1') });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.goalActivityGroups('root-1', 'goal-1') });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.goalMetrics('goal-1') });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.activities('root-1') });
    });

    it('invalidates session-derived goal caches together', async () => {
        const queryClient = createQueryClient();
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

        await invalidateGoalSessionQueries(queryClient, 'root-1', 'session-1');

        expect(invalidateSpy).toHaveBeenCalledTimes(3);
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.session('root-1', 'session-1') });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.sessionGoalsView('root-1', 'session-1') });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.fractalTree('root-1') });
    });
});
