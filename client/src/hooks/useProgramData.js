import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';

import { flattenGoals } from '../utils/goalHelpers';
import { queryKeys } from './queryKeys';
import { useFractalTree } from './useGoalQueries';

function flattenProgramSessions(program) {
    if (!program?.blocks?.length) {
        return [];
    }

    const sessionsById = new Map();

    program.blocks.forEach((block) => {
        (block.days || []).forEach((day) => {
            (day.sessions || []).forEach((session) => {
                if (!session?.id || sessionsById.has(session.id)) {
                    return;
                }
                sessionsById.set(session.id, session);
            });
        });
    });

    return Array.from(sessionsById.values());
}

export function useProgramData(rootId, programId) {
    const queryClient = useQueryClient();

    const invalidateQueryList = useCallback((queryKeyFactories) => {
        return Promise.all(
            queryKeyFactories.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
        );
    }, [queryClient]);

    // 1. Program Query
    const programQuery = useQuery({
        queryKey: queryKeys.program(rootId, programId),
        queryFn: async () => {
            const res = await fractalApi.getProgram(rootId, programId);
            return res.data;
        },
        enabled: !!rootId && !!programId,
    });

    // 2. Goals (Tree) Query
    const goalsQuery = useFractalTree(rootId);

    // 3. Activities Query
    const activitiesQuery = useQuery({
        queryKey: queryKeys.activities(rootId),
        queryFn: async () => {
            const res = await fractalApi.getActivities(rootId);
            return res.data || [];
        },
        enabled: !!rootId,
    });

    // 4. Activity Groups Query
    const groupsQuery = useQuery({
        queryKey: queryKeys.activityGroups(rootId),
        queryFn: async () => {
            const res = await fractalApi.getActivityGroups(rootId);
            return res.data || [];
        },
        enabled: !!rootId,
    });

    // Derived State: Flattened Goals
    const flattenedGoals = useMemo(() => {
        if (!goalsQuery.data) return [];
        return flattenGoals([goalsQuery.data]);
    }, [goalsQuery.data]);

    const sessions = useMemo(() => flattenProgramSessions(programQuery.data), [programQuery.data]);

    // Aggregate Loading State
    const isLoading =
        programQuery.isLoading ||
        goalsQuery.isLoading ||
        activitiesQuery.isLoading ||
        groupsQuery.isLoading;

    const isError =
        programQuery.isError ||
        goalsQuery.isError ||
        activitiesQuery.isError ||
        groupsQuery.isError;

    // Refresh Function (invalidates all queries)
    const refreshProgramQueries = useCallback(async () => {
        await invalidateQueryList([
            queryKeys.program(rootId, programId),
            queryKeys.programs(rootId),
            queryKeys.activeProgramDays(rootId),
        ]);
    }, [invalidateQueryList, programId, rootId]);

    const refreshGoalQueries = useCallback(async () => {
        await invalidateQueryList([
            queryKeys.goalsTree(rootId),
            queryKeys.program(rootId, programId),
            queryKeys.programs(rootId),
        ]);
    }, [invalidateQueryList, programId, rootId]);

    const refreshSchedulingQueries = useCallback(async () => {
        await invalidateQueryList([
            queryKeys.program(rootId, programId),
            queryKeys.programs(rootId),
            queryKeys.sessions(rootId),
            queryKeys.sessionsAll(rootId),
            queryKeys.activeProgramDays(rootId),
        ]);
    }, [invalidateQueryList, programId, rootId]);

    const refreshData = useCallback(async () => {
        await invalidateQueryList([
            queryKeys.program(rootId, programId),
            queryKeys.programs(rootId),
            queryKeys.goalsTree(rootId),
            queryKeys.activities(rootId),
            queryKeys.activityGroups(rootId),
            queryKeys.sessions(rootId),
            queryKeys.sessionsAll(rootId),
            queryKeys.activeProgramDays(rootId),
        ]);
    }, [invalidateQueryList, rootId, programId]);

    // Helper: Get Goal Details
    const getGoalDetails = useCallback((goalId) => {
        if (!flattenedGoals) return null;
        return flattenedGoals.find(g => g.id === goalId || (g.attributes && g.attributes.id === goalId));
    }, [flattenedGoals]);

    return {
        // Data
        program: programQuery.data || null,
        goals: flattenedGoals,
        treeData: goalsQuery.data || null,
        activities: activitiesQuery.data || [],
        activityGroups: groupsQuery.data || [],
        sessions,

        // State
        loading: isLoading,
        error: isError,

        // Actions
        refreshData,
        refreshers: {
            all: refreshData,
            program: refreshProgramQueries,
            goals: refreshGoalQueries,
            programGoals: async () => Promise.all([refreshProgramQueries(), refreshGoalQueries()]),
            scheduling: refreshSchedulingQueries,
        },
        getGoalDetails,

        // Export raw queries if needed for fine-grained loading states
        queries: {
            program: programQuery,
            goals: goalsQuery,
            activities: activitiesQuery,
            groups: groupsQuery,
        },
    };
}
