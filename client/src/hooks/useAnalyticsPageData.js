import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

function buildActivityInstancesMap(sessions) {
    const instancesMap = {};

    sessions.forEach((session) => {
        const sessionData = session.attributes?.session_data;
        if (!sessionData?.sections) {
            return;
        }

        sessionData.sections.forEach((section) => {
            if (!section.exercises) {
                return;
            }

            section.exercises.forEach((exercise) => {
                if (exercise.type !== 'activity' || !exercise.activity_id) {
                    return;
                }

                if (!instancesMap[exercise.activity_id]) {
                    instancesMap[exercise.activity_id] = [];
                }

                const sessionStart =
                    session.session_start
                    || session.attributes?.session_data?.session_start
                    || session.attributes?.created_at;

                instancesMap[exercise.activity_id].push({
                    ...exercise,
                    session_id: session.id,
                    session_name: session.name,
                    session_date: sessionStart,
                });
            });
        });
    });

    return instancesMap;
}

export function useAnalyticsPageData(rootId) {
    const [sessionsQuery, goalAnalyticsQuery, activitiesQuery] = useQueries({
        queries: [
            {
                queryKey: queryKeys.analyticsSessions(rootId),
                queryFn: async () => {
                    const response = await fractalApi.getSessions(rootId, { limit: 50 });
                    return response.data.sessions || response.data || [];
                },
                enabled: Boolean(rootId),
            },
            {
                queryKey: queryKeys.goalAnalytics(rootId),
                queryFn: async () => {
                    const response = await fractalApi.getGoalAnalytics(rootId);
                    return response.data || null;
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
        ],
    });

    const activityInstances = useMemo(
        () => buildActivityInstancesMap(sessionsQuery.data || []),
        [sessionsQuery.data]
    );

    return {
        sessions: sessionsQuery.data || [],
        goalAnalytics: goalAnalyticsQuery.data || null,
        activities: activitiesQuery.data || [],
        activityInstances,
        loading: sessionsQuery.isLoading || goalAnalyticsQuery.isLoading || activitiesQuery.isLoading,
        error: sessionsQuery.error || goalAnalyticsQuery.error || activitiesQuery.error || null,
    };
}
