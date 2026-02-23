import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';

import { flattenGoals } from '../utils/goalHelpers';

export function useProgramData(rootId, programId) {
    const queryClient = useQueryClient();

    // 1. Program Query
    const programQuery = useQuery({
        queryKey: ['program', rootId, programId],
        queryFn: async () => {
            const res = await fractalApi.getProgram(rootId, programId);
            return res.data;
        },
        enabled: !!rootId && !!programId,
    });

    // 2. Goals (Tree) Query
    const goalsQuery = useQuery({
        queryKey: ['goals-tree', rootId],
        queryFn: async () => {
            const res = await fractalApi.getGoal(rootId, rootId);
            return res.data;
        },
        enabled: !!rootId,
    });

    // 3. Activities Query
    const activitiesQuery = useQuery({
        queryKey: ['activities', rootId],
        queryFn: async () => {
            const res = await fractalApi.getActivities(rootId);
            return res.data || [];
        },
        enabled: !!rootId,
    });

    // 4. Activity Groups Query
    const groupsQuery = useQuery({
        queryKey: ['activity-groups', rootId],
        queryFn: async () => {
            const res = await fractalApi.getActivityGroups(rootId);
            return res.data || [];
        },
        enabled: !!rootId,
    });

    // 5. Sessions Query
    const sessionsQuery = useQuery({
        queryKey: ['sessions', rootId, 'all'], // 'all' to differentiate from paginated lists if needed
        queryFn: async () => {
            const res = await fractalApi.getSessions(rootId, { limit: 1000 });
            return res.data.sessions || res.data || [];
        },
        enabled: !!rootId,
    });

    // Derived State: Flattened Goals
    const flattenedGoals = useMemo(() => {
        if (!goalsQuery.data) return [];
        return flattenGoals([goalsQuery.data]);
    }, [goalsQuery.data]);

    // Aggregate Loading State
    const isLoading =
        programQuery.isLoading ||
        goalsQuery.isLoading ||
        activitiesQuery.isLoading ||
        groupsQuery.isLoading ||
        sessionsQuery.isLoading;

    const isError =
        programQuery.isError ||
        goalsQuery.isError ||
        activitiesQuery.isError ||
        groupsQuery.isError ||
        sessionsQuery.isError;

    // Refresh Function (invalidates all queries)
    const refreshData = useCallback(async () => {
        await Promise.all([
            queryClient.invalidateQueries(['program', rootId, programId]),
            queryClient.invalidateQueries(['goals-tree', rootId]),
            queryClient.invalidateQueries(['activities', rootId]),
            queryClient.invalidateQueries(['activity-groups', rootId]),
            queryClient.invalidateQueries(['sessions', rootId])
        ]);
    }, [queryClient, rootId, programId]);

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
        sessions: sessionsQuery.data || [],

        // State
        loading: isLoading,
        error: isError,

        // Actions
        refreshData,
        getGoalDetails,

        // Export raw queries if needed for fine-grained loading states
        queries: {
            program: programQuery,
            goals: goalsQuery,
            activities: activitiesQuery,
            groups: groupsQuery,
            sessions: sessionsQuery
        }
    };
}
