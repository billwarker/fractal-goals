import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { flattenGoals } from '../utils/goalHelpers';
import { getActivePrograms } from '../utils/programGoalWindow';
import { queryKeys } from './queryKeys';
import { fetchPrograms } from './useProgramQueries';
import { fetchSessionTemplates } from './useSessionTemplateQueries';

function dedupeProgramDays(programDays) {
    const seenKeys = new Set();

    return programDays
        .sort((a, b) => {
            if (!a.date && b.date) return -1;
            if (a.date && !b.date) return 1;
            return 0;
        })
        .filter((day) => {
            const key = day.day_id;
            if (seenKeys.has(key)) return false;
            seenKeys.add(key);
            return true;
        });
}

function groupProgramDaysById(programDays) {
    return programDays.reduce((grouped, day) => {
        const programId = String(day.program_id);
        if (!grouped[programId]) {
            grouped[programId] = {
                program_id: day.program_id,
                program_name: day.program_name,
                program_color: day.program_color,
                days: [],
            };
        }
        grouped[programId].days.push(day);
        return grouped;
    }, {});
}

export function useCreateSessionPageData(rootId, todayISO) {
    const results = useQueries({
        queries: [
            {
                queryKey: queryKeys.sessionTemplates(rootId),
                queryFn: () => fetchSessionTemplates(rootId),
                enabled: Boolean(rootId),
            },
            {
                queryKey: queryKeys.goalsTree(rootId),
                queryFn: async () => {
                    const response = await fractalApi.getGoals(rootId);
                    return response.data || null;
                },
                enabled: Boolean(rootId),
            },
            {
                queryKey: queryKeys.activeProgramDays(rootId, todayISO),
                queryFn: async () => {
                    const response = await fractalApi.getActiveProgramDays(rootId, todayISO);
                    return response.data || [];
                },
                enabled: Boolean(rootId),
            },
            {
                queryKey: queryKeys.programs(rootId),
                queryFn: () => fetchPrograms(rootId),
                enabled: Boolean(rootId),
            },
            {
                queryKey: queryKeys.activities(rootId),
                queryFn: async () => {
                    const response = await fractalApi.getActivities(rootId);
                    return response.data || [];
                },
                enabled: Boolean(rootId),
            },
            {
                queryKey: queryKeys.activityGroups(rootId),
                queryFn: async () => {
                    const response = await fractalApi.getActivityGroups(rootId);
                    return response.data || [];
                },
                enabled: Boolean(rootId),
            },
        ],
    });

    const [
        templatesQuery,
        goalTreeQuery,
        programDaysQuery,
        programsQuery,
        activitiesQuery,
        activityGroupsQuery,
    ] = results;

    const allGoals = useMemo(() => {
        if (!goalTreeQuery.data) return [];
        return flattenGoals([goalTreeQuery.data]);
    }, [goalTreeQuery.data]);

    const programDays = useMemo(
        () => dedupeProgramDays(programDaysQuery.data || []),
        [programDaysQuery.data]
    );

    const programsById = useMemo(
        () => groupProgramDaysById(programDays),
        [programDays]
    );
    const activeProgram = useMemo(
        () => getActivePrograms(programsQuery.data || [], todayISO)[0] || null,
        [programsQuery.data, todayISO]
    );

    return {
        templates: templatesQuery.data || [],
        goalTree: goalTreeQuery.data || null,
        allGoals,
        programDays,
        programsById,
        activeProgram,
        activityDefinitions: activitiesQuery.data || [],
        activityGroups: activityGroupsQuery.data || [],
        loading: results.some((result) => result.isLoading),
        error: results.find((result) => result.error)?.error || null,
    };
}
