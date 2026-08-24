import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { flattenGoals } from '../utils/goalHelpers';
import { buildProgramBlockLabels, buildProgramsCalendarEvents } from '../utils/programViewModel';
import { queryKeys } from './queryKeys';
import { useFractalTree } from './useGoalQueries';
import { fetchPrograms } from './useProgramQueries';

export function useProgramsCalendarData(rootId, {
    getGoalColor,
    getGoalTextColor,
    getGoalSecondaryColor,
    getGoalIcon,
    timezone,
} = {}) {
    const programsQuery = useQuery({
        queryKey: queryKeys.programs(rootId, timezone || 'UTC'),
        enabled: Boolean(rootId),
        queryFn: () => fetchPrograms(rootId, timezone || 'UTC'),
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

    const calendarEvents = useMemo(() => buildProgramsCalendarEvents(
        sortedPrograms,
        goals,
        getGoalColor || (() => '#3A86FF'),
        getGoalTextColor || (() => '#ffffff'),
        timezone,
        { getGoalSecondaryColor, getGoalIcon },
    ), [getGoalColor, getGoalIcon, getGoalSecondaryColor, getGoalTextColor, goals, sortedPrograms, timezone]);

    const blockLabels = useMemo(
        () => sortedPrograms.flatMap((program, programIndex) => buildProgramBlockLabels({
            program,
            includeProgramId: true,
            programIndex,
        })),
        [sortedPrograms],
    );

    return {
        programs: sortedPrograms,
        goals,
        calendarEvents,
        blockLabels,
        loading: programsQuery.isLoading || goalsQuery.isLoading,
        treeData: goalsQuery.data || null,
        refetchPrograms: programsQuery.refetch,
        refetchGoals: goalsQuery.refetch,
    };
}
