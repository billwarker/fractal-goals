import { useQuery } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

// Kept apart from useActivityTags so read-only screens (Analytics) don't bundle the offline outbox.
const EMPTY_CATALOG = Object.freeze({ families: [], tags: [] });

/** The fractal's tag families and tags, already in picker order. */
export function useActivityTagCatalog(rootId, { includeArchived = true } = {}) {
    const query = useQuery({
        queryKey: [...queryKeys.activityTagCatalog(rootId), { includeArchived }],
        enabled: Boolean(rootId),
        queryFn: async () => {
            const response = await fractalApi.getActivityTagCatalog(rootId, {
                include_archived: includeArchived,
            });
            return response.data;
        },
    });
    return { ...query, data: query.data || EMPTY_CATALOG };
}
