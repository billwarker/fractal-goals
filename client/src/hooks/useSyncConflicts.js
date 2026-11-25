import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { isDemoMode } from '../demo/demoMode';
import { syncApi } from '../utils/api/syncApi';
import { queryKeys } from './queryKeys';

const EMPTY = [];

/** Fields edited on two devices at once, with the value that was set aside. */
export function useSyncConflicts() {
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: queryKeys.syncConflicts(),
        queryFn: async () => (await syncApi.getConflicts()).data.conflicts,
        enabled: !isDemoMode(),
        retry: false,
    });

    const settle = () => queryClient.invalidateQueries({ queryKey: queryKeys.syncConflicts() });
    const dismiss = useMutation({
        mutationFn: ({ id }) => syncApi.resolveConflict(id),
        onSuccess: settle,
    });
    const restore = useMutation({
        mutationFn: async (conflict) => {
            await syncApi.restoreConflict(conflict);
            await syncApi.resolveConflict(conflict.id);
        },
        onSuccess: (_result, { root_id: rootId }) => {
            void queryClient.invalidateQueries({ predicate: ({ queryKey }) => queryKey.includes(rootId) });
            return settle();
        },
    });

    return {
        conflicts: query.data ?? EMPTY,
        isLoading: query.isLoading,
        dismiss: dismiss.mutateAsync,
        restore: restore.mutateAsync,
        isSaving: dismiss.isPending || restore.isPending,
    };
}
