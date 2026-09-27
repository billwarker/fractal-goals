import { useCallback, useEffect, useMemo } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { chunkRange, monthChunksForRange, overscanChunks } from '../utils/calendarChunks';
import { mergeCalendarFeedChunks, PROGRAM_CALENDAR_FEED_SCHEMA_VERSION } from '../utils/programCalendarFeed';
import { queryKeys } from './queryKeys';
import { useLocalDateRollover } from './useProgramDayReadModel';

const FEED_STALE_TIME = 60 * 1000;
const FEED_GC_TIME = 10 * 60 * 1000;
const OVERSCAN_MONTHS = 1;

function scheduleIdle(callback) {
    if (typeof window.requestIdleCallback === 'function') {
        const handle = window.requestIdleCallback(callback, { timeout: 1500 });
        return () => window.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(callback, 200);
    return () => window.clearTimeout(handle);
}

/**
 * Viewport-driven calendar data. Every month the visible rows touch loads as its
 * own cached chunk; one month either side prefetches while the browser is idle,
 * so scrolling into it needs no request. A chunk that is still loading never
 * hides data from chunks that already arrived.
 */
export function useProgramCalendarFeed(rootId, timezone, visibleRange, { enabled = true } = {}) {
    const queryClient = useQueryClient();
    const zone = timezone || 'UTC';
    const active = Boolean(rootId && enabled);
    const months = useMemo(
        () => monthChunksForRange(visibleRange?.start, visibleRange?.end),
        [visibleRange?.end, visibleRange?.start],
    );

    const chunkQuery = useCallback((month) => ({
        queryKey: queryKeys.programCalendarFeed(rootId, zone, month),
        queryFn: async () => {
            const { start, end } = chunkRange(month);
            const response = await fractalApi.getProgramCalendarFeed(rootId, {
                range_start: start,
                range_end: end,
                timezone: zone,
            });
            if (response.data?.schema_version !== PROGRAM_CALENDAR_FEED_SCHEMA_VERSION) {
                throw new Error('Unsupported calendar data version. Refresh and try again.');
            }
            return response.data;
        },
        staleTime: FEED_STALE_TIME,
        gcTime: FEED_GC_TIME,
    }), [rootId, zone]);

    const combine = useCallback((results) => ({
        chunks: results.map((result) => result.data),
        pendingFlags: results.map((result) => result.isPending),
        isError: results.some((result) => result.isError),
        error: results.find((result) => result.error)?.error || null,
    }), []);

    const { chunks, pendingFlags, isError, error } = useQueries({
        queries: months.map((month) => ({ ...chunkQuery(month), enabled: active })),
        combine,
    });

    useEffect(() => {
        if (!active || !months.length) return undefined;
        return scheduleIdle(() => {
            overscanChunks(months, OVERSCAN_MONTHS).forEach((month) => {
                queryClient.prefetchQuery(chunkQuery(month));
            });
        });
    }, [active, chunkQuery, months, queryClient]);

    useLocalDateRollover(zone, () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.programCalendarFeedRoot(rootId) });
    }, active);

    const feed = useMemo(() => mergeCalendarFeedChunks(chunks), [chunks]);
    const loadingMonths = useMemo(
        () => new Set(months.filter((_month, index) => active && pendingFlags[index])),
        [active, months, pendingFlags],
    );

    return {
        feed,
        loadingMonths,
        isInitialLoading: active && pendingFlags.length > 0 && pendingFlags.every(Boolean),
        isError,
        error,
    };
}
