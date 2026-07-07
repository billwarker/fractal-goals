/**
 * useInstagramOembed — fetch official Instagram oEmbed HTML through the backend
 * proxy. When the backend has no Meta token configured it returns
 * { configured: false } and the caller should fall back to the /embed iframe.
 * Disabled unless a permalink is provided.
 */

import { useQuery } from '@tanstack/react-query';
import { fractalNotesApi } from '../utils/api/fractalNotesApi';
import { queryKeys } from './queryKeys';

export function useInstagramOembed(permalink, enabled = true) {
    return useQuery({
        queryKey: queryKeys.instagramOembed(permalink),
        queryFn: async () => {
            const res = await fractalNotesApi.getInstagramOembed(permalink);
            return res.data;
        },
        enabled: Boolean(permalink) && enabled,
        staleTime: 60 * 60 * 1000, // 1h — oEmbed HTML changes rarely
        retry: false,
    });
}

export default useInstagramOembed;
