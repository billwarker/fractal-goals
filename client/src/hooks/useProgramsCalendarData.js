import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { flattenGoals } from '../utils/goalHelpers';
import { buildProgramSummaryLabels } from '../utils/programViewModel';
import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';
import { useFractalTree } from './useGoalQueries';

export function useProgramsCalendarData(rootId, { timezone, visibleRange } = {}) {
    const rangeStart = visibleRange?.start || null;
    const rangeEnd = visibleRange?.end || null;
    const programsQuery = useQuery({
        queryKey: queryKeys.programCalendar(rootId, timezone || 'UTC', rangeStart, rangeEnd),
        enabled: Boolean(rootId),
        staleTime: 5 * 60 * 1000,
        placeholderData: (previousData, previousQuery) => (
            String(previousQuery?.queryKey?.[1]) === String(rootId) ? previousData : undefined
        ),
        queryFn: async () => {
            const response = await fractalApi.getProgramSummaries(rootId, {
                timezone: timezone || 'UTC',
                ...(rangeStart && rangeEnd ? {
                    range_start: rangeStart,
                    range_end: rangeEnd,
                } : {}),
            });
            return response.data || [];
        },
    });

    const goalsQuery = useFractalTree(rootId);

    const goals = useMemo(() => {
        if (!goalsQuery.data) return [];
        return flattenGoals([goalsQuery.data]);
    }, [goalsQuery.data]);

    const sortedPrograms = useMemo(() => {
        return [...(programsQuery.data || [])].sort((left, right) => {
            if (!left.start_date) return 1;
            if (!right.start_date) return -1;
            return new Date(left.start_date) - new Date(right.start_date);
        });
    }, [programsQuery.data]);

    const programLabels = useMemo(() => buildProgramSummaryLabels(sortedPrograms), [sortedPrograms]);

    return {
        programs: sortedPrograms,
        goals,
        programLabels,
        loading: programsQuery.isLoading || goalsQuery.isLoading,
        calendarProjectionReady: Boolean(
            rangeStart && rangeEnd && !programsQuery.isPlaceholderData && programsQuery.data,
        ),
        treeData: goalsQuery.data || null,
        refetchPrograms: programsQuery.refetch,
        refetchGoals: goalsQuery.refetch,
    };
}
