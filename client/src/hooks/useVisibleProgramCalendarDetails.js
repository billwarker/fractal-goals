import { useMemo } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { mergeCompletedSessionDays } from '../utils/programDayState';
import { queryKeys } from './queryKeys';

function getVisibleMonthRange(visibleMonth) {
    if (!visibleMonth) return null;
    const [year, month] = visibleMonth.slice(0, 7).split('-').map(Number);
    if (!year || !month) return null;
    const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return { start: `${visibleMonth.slice(0, 7)}-01`, end: lastDay };
}

function overlapsVisibleMonth(program, range) {
    const start = String(program.start_date || '').slice(0, 10);
    const end = String(program.end_date || '').slice(0, 10);
    return Boolean(start && end && start <= range.end && end >= range.start);
}

/** Load full program projections only for the focused program and visible month. */
export function useVisibleProgramCalendarDetails(rootId, programs = [], visibleMonth, selectedProgramId, timezone) {
    const queryClient = useQueryClient();
    const candidates = useMemo(() => {
        const range = getVisibleMonthRange(visibleMonth);
        return programs.filter((program) => (
            String(program.id) === String(selectedProgramId)
            || (range && overlapsVisibleMonth(program, range))
        ));
    }, [programs, selectedProgramId, visibleMonth]);
    const queries = useQueries({
        queries: candidates.map((program) => ({
            queryKey: queryKeys.program(rootId, program.id, timezone || 'UTC'),
            queryFn: async () => {
                const response = await fractalApi.getProgram(rootId, program.id, {
                    timezone: timezone || 'UTC',
                });
                return response.data;
            },
            enabled: Boolean(rootId && program.id),
            staleTime: 5 * 60 * 1000,
            gcTime: Infinity,
            refetchOnWindowFocus: false,
        })),
    });
    const dayQueries = useQueries({
        queries: candidates.map((program) => {
            const range = getVisibleMonthRange(visibleMonth);
            return {
                queryKey: queryKeys.programDayReadModel(
                    rootId, program.id, timezone || 'UTC', range?.start, range?.end, null,
                ),
                queryFn: async () => {
                    const response = await fractalApi.getProgramDayReadModel(rootId, program.id, {
                        range_start: range.start,
                        range_end: range.end,
                        timezone: timezone || 'UTC',
                    });
                    if (response.data?.schema_version !== 6) {
                        throw new Error('Unsupported program day data version. Refresh and try again.');
                    }
                    return response.data;
                },
                enabled: Boolean(rootId && program.id && range),
                staleTime: 60 * 1000,
                refetchOnWindowFocus: false,
            };
        }),
    });

    return useMemo(() => {
        const details = new Map();
        const currentDetails = new Map();
        queries.forEach((query, index) => {
            if (query.data) currentDetails.set(candidates[index].id, query.data);
        });
        programs.forEach((program) => {
            const queryKey = queryKeys.program(rootId, program.id, timezone || 'UTC');
            const data = currentDetails.get(program.id) || queryClient.getQueryData(queryKey);
            if (data) details.set(program.id, data);
        });
        const completedSessionDays = mergeCompletedSessionDays(
            dayQueries.map((query) => query.data?.days || []),
        );
        return { details, completedSessionDays };
    }, [candidates, dayQueries, programs, queryClient, queries, rootId, timezone]);
}
