import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { storageApi } from '../utils/api/storageApi';
import { queryKeys } from './queryKeys';
import { useAttachmentDraft } from './useAttachmentDraft';

/**
 * Media on a goal's description, loaded on demand (goal trees don't carry it) into an
 * editable draft. `loaded` stays false until the saved list arrives, so a save never
 * overwrites attachments it hasn't seen.
 */
export function useGoalDescriptionAttachments(rootId, goalId, enabled) {
    const client = useQueryClient();
    const queryKey = queryKeys.goalAttachments(rootId, goalId);
    const query = useQuery({
        queryKey,
        queryFn: async () => (await storageApi.goalAttachments(rootId, goalId)).data,
        enabled: Boolean(enabled && rootId && goalId),
        staleTime: Infinity,
        refetchOnWindowFocus: false,  // Don't replace edits in progress.
    });
    const draft = useAttachmentDraft(rootId);
    const { reset } = draft;
    const { data, dataUpdatedAt } = query;
    const loadedRef = useRef(null);
    useEffect(() => {
        // Reset only when a new response arrives, not on every render.
        if (!data || loadedRef.current === dataUpdatedAt) return;
        loadedRef.current = dataUpdatedAt;
        reset(data);
    }, [data, dataUpdatedAt, reset]);
    return {
        draft,
        loaded: query.isSuccess,
        refresh: () => client.invalidateQueries({ queryKey }),
    };
}
