import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { flattenGoals } from '../utils/goalHelpers';
import { queryKeys } from './queryKeys';

function dedupeProgramDays(programDays) {
    const seenKeys = new Set();

    return programDays
        .sort((a, b) => {
            if (!a.date && b.date) return -1;
            if (a.date && !b.date) return 1;
            return 0;
        })
        .filter((day) => {
            const templateIds = (day.sessions || []).map((session) => session.template_id).sort().join(',');
            const key = `${day.program_id}-${day.block_id}-${day.day_name}-${templateIds}`;
            if (seenKeys.has(key)) return false;
            seenKeys.add(key);
            return true;
        });
}

function groupProgramDaysByName(programDays) {
    return programDays.reduce((grouped, day) => {
        const programName = day.program_name;
        if (!grouped[programName]) {
            grouped[programName] = {
                program_id: day.program_id,
                program_name: programName,
                days: [],
            };
        }
        grouped[programName].days.push(day);
        return grouped;
    }, {});
}

export function useCreateSessionPageData(rootId) {
    const results = useQueries({
        queries: [
            {
                queryKey: queryKeys.sessionTemplates(rootId),
                queryFn: async () => {
                    const response = await fractalApi.getSessionTemplates(rootId);
                    return response.data || [];
                },
                enabled: Boolean(rootId),
            },
            {
                queryKey: queryKeys.goalsForSelection(rootId),
                queryFn: async () => {
                    const response = await fractalApi.getGoalsForSelection(rootId);
                    return response.data || [];
                },
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
                queryKey: queryKeys.activeProgramDays(rootId),
                queryFn: async () => {
                    const response = await fractalApi.getActiveProgramDays(rootId);
                    return response.data || [];
                },
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
        goalsQuery,
        goalTreeQuery,
        programDaysQuery,
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

    const programsByName = useMemo(
        () => groupProgramDaysByName(programDays),
        [programDays]
    );

    return {
        templates: templatesQuery.data || [],
        goals: goalsQuery.data || [],
        allGoals,
        programDays,
        programsByName,
        activityDefinitions: activitiesQuery.data || [],
        activityGroups: activityGroupsQuery.data || [],
        loading: results.some((result) => result.isLoading),
        error: results.find((result) => result.error)?.error || null,
    };
}
