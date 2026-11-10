import { useQuery } from '@tanstack/react-query';

import { fractalNotesApi } from '../utils/api/fractalNotesApi';
import { queryKeys } from './queryKeys';

/**
 * How many notes deleting a session, goal (with the goals under it) or activity would take, for its
 * confirmation. `target` is { session_id } | { goal_id } | { activity_instance_id }; null while unknown,
 * so a dialog never blocks on it.
 */
export function useOwnedNoteCount(rootId, target, { enabled = true } = {}) {
    const id = target && Object.values(target)[0];
    const query = useQuery({
        queryKey: queryKeys.ownedNoteCount(rootId, target),
        queryFn: async () => (await fractalNotesApi.getOwnedNoteCount(rootId, target)).data?.count ?? 0,
        enabled: Boolean(enabled && rootId && id),
        staleTime: 10 * 1000,
    });
    return query.isSuccess ? query.data : null;
}

export default useOwnedNoteCount;
