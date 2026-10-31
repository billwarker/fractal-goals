import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

const MAX_PROGRESS_GOALS = 200;

/**
 * Derived completion progress for a set of goals, keyed by goal id.
 * Progress is computed on the server from canonical evidence on every read.
 */
export function useGoalConditionProgress(rootId, goalIds, options = {}) {
    const ids = useMemo(
        () => [...new Set((goalIds || []).filter(Boolean).map(String))].sort().slice(0, MAX_PROGRESS_GOALS),
        [goalIds],
    );
    const enabled = (options.enabled ?? true) && Boolean(rootId) && ids.length > 0;
    const query = useQuery({
        queryKey: queryKeys.goalConditionProgress(rootId, ids),
        queryFn: async () => {
            const res = await fractalApi.getGoalConditionProgress(rootId, ids);
            return res.data?.goals || {};
        },
        enabled,
        staleTime: 30 * 1000,
    });
    return { progressByGoalId: query.data || {}, isLoading: enabled && query.isLoading, error: query.error };
}

/**
 * Contributing evidence for a goal's condition (or, with `activityId`, for an unsaved draft).
 */
export function useGoalConditionEvidence(rootId, goalId, { since = 'active', activityId = null, enabled = true } = {}) {
    const isEnabled = enabled && Boolean(rootId && goalId);
    return useQuery({
        queryKey: queryKeys.goalConditionEvidence(rootId, goalId, since, activityId),
        queryFn: async () => {
            const res = await fractalApi.getGoalConditionEvidence(rootId, goalId, { since, activityId });
            return res.data || null;
        },
        enabled: isEnabled,
        staleTime: 60 * 1000,
    });
}

const PREVIEW_DEBOUNCE_MS = 400;

/**
 * An unsaved threshold evaluated against the goal's evidence, once edits pause. `condition` is
 * a valid API payload, or null while the draft cannot be evaluated. Writes nothing.
 */
export function useGoalConditionPreview(rootId, goalId, condition) {
    const serialized = condition ? JSON.stringify(condition) : null;
    const [settled, setSettled] = useState(serialized);
    useEffect(() => {
        const timer = setTimeout(() => setSettled(serialized), PREVIEW_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [serialized]);
    const enabled = Boolean(rootId && goalId && settled);
    const query = useQuery({
        queryKey: queryKeys.goalConditionPreview(rootId, goalId, settled),
        queryFn: async () => {
            const res = await fractalApi.previewGoalCondition(rootId, goalId, JSON.parse(settled));
            return res.data?.progress || null;
        },
        enabled,
        staleTime: 30 * 1000,
        placeholderData: (previous) => previous,
        retry: false,
    });
    return { progress: enabled ? query.data || null : null, isPending: serialized !== settled || query.isFetching };
}
