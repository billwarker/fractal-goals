import { useEffect, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { getISOYMDInTimezone } from '../utils/dateUtils';
import { queryKeys } from './queryKeys';

const PROGRAM_DAY_READ_MODEL_SCHEMA_VERSION = 5;

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
        placeholderData: detailDate ? undefined : (previousData, previousQuery) => (
            String(previousQuery?.queryKey?.[2]) === String(programId)
                ? previousData
                : undefined
        ),
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
        const last = pages[pages.length - 1];
        return {
            ...first,
            detail: first.detail ? {
                ...first.detail,
                sessions: pages.flatMap((page) => page.detail?.sessions || []),
                sessions_page: last.detail?.sessions_page,
            } : null,
        };
    }, [query.data?.pages]);
    return { ...query, data };
}

function invalidateProgramDayDependents(queryClient, rootId, programId, { except = null } = {}) {
    const exceptHash = except ? JSON.stringify(except) : null;
    return Promise.all([
        queryClient.invalidateQueries({
            queryKey: queryKeys.programDayReadModelRoot(rootId, programId),
            ...(exceptHash ? { predicate: (query) => JSON.stringify(query.queryKey) !== exceptHash } : {}),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.programMetricsRoot(rootId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.programs(rootId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.programDayOptions(rootId) }),
    ]);
}

export function useUpdateProgramDayStatuses(rootId, programId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data) => fractalApi.updateProgramDayStatuses(rootId, programId, data),
        onSuccess: () => invalidateProgramDayDependents(queryClient, rootId, programId),
    });
}

/**
 * Credit, exclude, or restore automatic attribution of one session on one date.
 * The response carries the refreshed first detail page, which replaces the
 * cached day detail directly; every other dependent projection is invalidated.
 */
export function useSetProgramDaySessionCredit(rootId, programId, timezone) {
    const queryClient = useQueryClient();
    const zone = timezone || 'UTC';
    return useMutation({
        mutationFn: async ({ date, sessionId, disposition, templateId = null }) => {
            const response = await fractalApi.updateProgramDaySessionCredit(rootId, programId, {
                date,
                session_id: sessionId,
                disposition,
                timezone: zone,
                ...(templateId ? { template_id: templateId } : {}),
            });
            return { ...response.data, day: unwrapReadModelResponse({ data: response.data.day }) };
        },
        onSuccess: (result, { date }) => {
            const detailKey = queryKeys.programDayReadModel(rootId, programId, zone, date, date, date);
            queryClient.setQueryData(detailKey, { pages: [result.day], pageParams: [null] });
            return invalidateProgramDayDependents(queryClient, rootId, programId, { except: detailKey });
        },
    });
}
