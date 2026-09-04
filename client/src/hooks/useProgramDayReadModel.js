import { useEffect, useMemo } from 'react';
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { getISOYMDInTimezone } from '../utils/dateUtils';
import { queryKeys } from './queryKeys';

const PROGRAM_DAY_READ_MODEL_SCHEMA_VERSION = 2;

function unwrapReadModelResponse(response) {
    const payload = response.data;
    if (payload?.schema_version !== PROGRAM_DAY_READ_MODEL_SCHEMA_VERSION) {
        throw new Error('Unsupported program day data version. Refresh and try again.');
    }
    return payload;
}

function useMidnightInvalidation(rootId, programId, timezone) {
    const queryClient = useQueryClient();
    useEffect(() => {
        if (!rootId || !programId) return undefined;
        let currentDate = getISOYMDInTimezone(new Date(), timezone || 'UTC');
        const timer = window.setInterval(() => {
            const nextDate = getISOYMDInTimezone(new Date(), timezone || 'UTC');
            if (nextDate === currentDate) return;
            currentDate = nextDate;
            queryClient.invalidateQueries({ queryKey: queryKeys.programDayReadModelRoot(rootId, programId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.programMetricsRoot(rootId) });
        }, 60 * 1000);
        return () => window.clearInterval(timer);
    }, [programId, queryClient, rootId, timezone]);
}

function useReadModel(rootId, programId, timezone, rangeStart, rangeEnd, detailDate = null) {
    useMidnightInvalidation(rootId, programId, timezone);
    return useQuery({
        queryKey: queryKeys.programDayReadModel(
            rootId, programId, timezone || 'UTC', rangeStart, rangeEnd, detailDate,
        ),
        queryFn: async () => unwrapReadModelResponse(await fractalApi.getProgramDayReadModel(rootId, programId, {
            range_start: rangeStart,
            range_end: rangeEnd,
            timezone: timezone || 'UTC',
            ...(detailDate ? { detail_date: detailDate } : {}),
        })),
        enabled: Boolean(rootId && programId && rangeStart && rangeEnd),
        placeholderData: detailDate ? undefined : keepPreviousData,
        staleTime: 60 * 1000,
    });
}

export function useProgramDayRange(rootId, programId, timezone, visibleRange) {
    return useReadModel(
        rootId, programId, timezone,
        visibleRange?.start || null, visibleRange?.end || null,
    );
}

export function useProgramDayDetail(rootId, programId, timezone, date) {
    useMidnightInvalidation(rootId, programId, timezone);
    const query = useInfiniteQuery({
        queryKey: queryKeys.programDayReadModel(
            rootId, programId, timezone || 'UTC', date, date, date,
        ),
        queryFn: async ({ pageParam }) => unwrapReadModelResponse(await fractalApi.getProgramDayReadModel(rootId, programId, {
            range_start: date,
            range_end: date,
            detail_date: date,
            timezone: timezone || 'UTC',
            session_limit: 20,
            ...(pageParam ? { session_cursor: pageParam } : {}),
        })),
        initialPageParam: null,
        getNextPageParam: (page) => page.detail?.sessions_page?.next_cursor || undefined,
        enabled: Boolean(rootId && programId && date),
        staleTime: 60 * 1000,
    });
    const data = useMemo(() => {
        const pages = query.data?.pages || [];
        const first = pages[0];
        if (!first) return undefined;
        const occurrences = (first.detail?.occurrences || []).map((occurrence) => ({
            ...occurrence,
            sessions: pages.flatMap((page) => (
                page.detail?.occurrences?.find((item) => item.occurrence_key === occurrence.occurrence_key)?.sessions || []
            )),
        }));
        const last = pages[pages.length - 1];
        return {
            ...first,
            detail: first.detail ? {
                ...first.detail,
                occurrences,
                other_sessions: pages.flatMap((page) => page.detail?.other_sessions || []),
                sessions_page: last.detail?.sessions_page,
            } : null,
        };
    }, [query.data?.pages]);
    return { ...query, data };
}
