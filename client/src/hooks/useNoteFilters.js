import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fractalNotesApi } from '../utils/api/fractalNotesApi';
import { queryKeys } from './queryKeys';

/** Saved, clickable Notes page filters for one fractal. */
export function useNoteFilters(rootId) {
    const client = useQueryClient();
    const query = useQuery({
        queryKey: queryKeys.noteFilters(rootId),
        queryFn: async () => (await fractalNotesApi.listNoteFilters(rootId)).data,
        enabled: Boolean(rootId),
        staleTime: 60000,
    });
    const refresh = () => {
        void client.invalidateQueries({ queryKey: queryKeys.noteFilters(rootId) });
        // A saved filter's spec changes which notes match wherever it is selected.
        void client.invalidateQueries({ queryKey: queryKeys.allNotesRoot(rootId) });
    };
    const create = useMutation({
        mutationFn: async (data) => (await fractalNotesApi.createNoteFilter(rootId, data)).data,
        onSuccess: refresh,
    });
    const update = useMutation({
        mutationFn: async ({ id, ...data }) => (await fractalNotesApi.updateNoteFilter(rootId, id, data)).data,
        onSuccess: refresh,
    });
    const remove = useMutation({
        mutationFn: (id) => fractalNotesApi.deleteNoteFilter(rootId, id),
        onSuccess: refresh,
    });
    return {
        savedFilters: query.data || [],
        isLoading: query.isLoading,
        createFilter: create.mutateAsync,
        updateFilter: update.mutateAsync,
        deleteFilter: remove.mutateAsync,
    };
}
