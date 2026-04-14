import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';
import { useFractalTree } from './useGoalQueries';

/**
 * Read and write progress_settings for the active root goal.
 *
 * progressSettings shape: { enabled: bool, default_aggregation: string|null }
 * null means "use defaults" (enabled=true, no default aggregation).
 */
export function useRootProgressSettings(rootId) {
    const queryClient = useQueryClient();
    const { data: tree } = useFractalTree(rootId, { enabled: Boolean(rootId) });

    // The fractal tree root is the top-level goal object
    const progressSettings = tree?.attributes?.progress_settings ?? null;

    const mutation = useMutation({
        mutationFn: async (newSettings) => {
            const res = await fractalApi.updateGoal(rootId, rootId, {
                progress_settings: newSettings,
            });
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.fractalTree(rootId) });
        },
    });

    return {
        progressSettings,
        updateProgressSettings: (settings) => mutation.mutateAsync(settings),
        isUpdating: mutation.isPending,
    };
}
