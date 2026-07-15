import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useTargetAchievements } from './useTargetAchievements';
import { useActivities, useActivityGroups } from './useActivityQueries';
import { queryKeys } from './queryKeys';
import { fractalApi } from '../utils/api';
import { flattenSessionGoalsViewGoals } from '../utils/goalNodeModel';
import { normalizeSectionActivityIds } from '../utils/sessionSection';

export function useSessionDetailData({ rootId, sessionId, isDeletingSession }) {
    const sessionKey = queryKeys.session(rootId, sessionId);
    const sessionActivitiesKey = queryKeys.sessionActivities(rootId, sessionId);
    const sessionGoalsViewKey = queryKeys.sessionGoalsView(rootId, sessionId);

    const {
        data: session,
        isLoading: sessionLoading,
        isError: sessionError,
        refetch: refreshSession,
    } = useQuery({
        queryKey: sessionKey,
        queryFn: async () => {
            try {
                const response = await fractalApi.getSession(rootId, sessionId);
                return response.data;
            } catch (error) {
                if (error?.response?.status === 404) return null;
                throw error;
            }
        },
        enabled: Boolean(rootId && sessionId && !isDeletingSession),
    });

    const {
        data: activityInstances = [],
        isLoading: instancesLoading,
        refetch: refreshInstances,
    } = useQuery({
        queryKey: sessionActivitiesKey,
        queryFn: async () => {
            try {
                const response = await fractalApi.getSessionActivities(rootId, sessionId);
                return response.data || [];
            } catch (error) {
                if (error?.response?.status === 404) return [];
                throw error;
            }
        },
        enabled: Boolean(rootId && sessionId && !isDeletingSession),
    });

    const { activities = [], isLoading: activitiesLoading } = useActivities(rootId);
    const { activityGroups = [] } = useActivityGroups(rootId);

    const {
        data: sessionGoalsView = null,
        isLoading: sessionGoalsViewLoading,
    } = useQuery({
        queryKey: sessionGoalsViewKey,
        queryFn: async () => {
            const response = await fractalApi.getSessionGoalsView(rootId, sessionId);
            return response.data || null;
        },
        enabled: Boolean(rootId && sessionId),
    });


    const normalizedSessionData = useMemo(() => {
        if (!session) return null;
        const baseData = session.attributes?.session_data || { sections: [] };
        return normalizeSectionActivityIds(baseData, activityInstances);
    }, [activityInstances, session]);

    const groupMap = useMemo(() => {
        if (!Array.isArray(activityGroups)) return { ungrouped: { id: 'ungrouped', name: 'Ungrouped' } };
        return activityGroups.reduce((acc, group) => {
            acc[group.id] = group;
            return acc;
        }, { ungrouped: { id: 'ungrouped', name: 'Ungrouped' } });
    }, [activityGroups]);

    const groupedActivities = useMemo(() => {
        if (!Array.isArray(activities)) return {};
        return activities.reduce((acc, activity) => {
            const groupId = activity.group_id || 'ungrouped';
            if (!acc[groupId]) acc[groupId] = [];
            acc[groupId].push(activity);
            return acc;
        }, {});
    }, [activities]);

    const allGoalsForTargets = useMemo(
        () => flattenSessionGoalsViewGoals(sessionGoalsView),
        [sessionGoalsView]
    );

    const {
        targetAchievements,
        achievedTargetIds,
        goalAchievements,
    } = useTargetAchievements(activityInstances, allGoalsForTargets, sessionId);

    return {
        session,
        sessionLoading,
        sessionError,
        refreshSession,
        activityInstances,
        instancesLoading,
        refreshInstances,
        activities,
        activitiesLoading,
        activityGroups,
        sessionGoalsView,
        sessionGoalsViewLoading,
        normalizedSessionData,
        groupMap,
        groupedActivities,
        targetAchievements,
        achievedTargetIds,
        goalAchievements,
        loading: sessionLoading || (session && !normalizedSessionData),
    };
}

export default useSessionDetailData;
