import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

const PROGRAM_METRICS_CALCULATION_VERSION = 6;

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
    const selectedDates = range?.dates?.length ? [...new Set(range.dates)].sort().join(',') : null;
    const queryKey = useMemo(
        () => queryKeys.programMetrics(rootId, programId, timezone || 'UTC', rangeStart, rangeEnd, selectedDates),
        [programId, rangeEnd, rangeStart, rootId, selectedDates, timezone],
    );
    const query = useQuery({
        queryKey,
        queryFn: async () => {
            const response = await fractalApi.getProgramMetrics(rootId, programId, {
                timezone: timezone || 'UTC',
                ...(selectedDates ? { dates: selectedDates } : (
                    rangeStart && rangeEnd ? { range_start: rangeStart, range_end: rangeEnd } : {}
                )),
            });
            if (response.data?.calculation_version !== PROGRAM_METRICS_CALCULATION_VERSION) {
                throw new Error('Unsupported program metrics version. Refresh and try again.');
            }
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
