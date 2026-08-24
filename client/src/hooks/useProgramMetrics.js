import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

const millisecondsUntilNextLocalMidnight = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 50);
    return Math.max(50, next.getTime() - now.getTime());
};

export function useProgramMetrics(rootId, programId, timezone, range = {}) {
    const queryClient = useQueryClient();
    const rangeStart = range?.start || null;
    const rangeEnd = range?.end || null;
    const queryKey = useMemo(
        () => queryKeys.programMetrics(rootId, programId, timezone || 'UTC', rangeStart, rangeEnd),
        [programId, rangeEnd, rangeStart, rootId, timezone],
    );
    const query = useQuery({
        queryKey,
        queryFn: async () => {
            const response = await fractalApi.getProgramMetrics(rootId, programId, {
                timezone: timezone || 'UTC',
                ...(rangeStart && rangeEnd ? { range_start: rangeStart, range_end: rangeEnd } : {}),
            });
            return response.data;
        },
        enabled: Boolean(rootId && programId),
        staleTime: 60 * 1000,
    });

    useEffect(() => {
        if (!rootId || !programId) return undefined;
        const timer = window.setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.programMetricsRoot(rootId) });
        }, millisecondsUntilNextLocalMidnight());
        return () => window.clearTimeout(timer);
    }, [programId, queryClient, rootId, timezone]);

    return query;
}

export function useProgramMetricsComparison(rootId, anchorProgramId, timezone, enabled = false) {
    return useQuery({
        queryKey: queryKeys.programMetricsComparison(rootId, anchorProgramId, timezone || 'UTC', 5),
        queryFn: async () => {
            const response = await fractalApi.getProgramMetricsComparison(rootId, {
                anchor_program_id: anchorProgramId,
                timezone: timezone || 'UTC',
                limit: 5,
            });
            return response.data;
        },
        enabled: Boolean(enabled && rootId && anchorProgramId),
        staleTime: 5 * 60 * 1000,
    });
}
