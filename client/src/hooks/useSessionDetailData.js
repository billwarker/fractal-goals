import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useTargetAchievements } from './useTargetAchievements';
import { queryKeys } from './queryKeys';
import { fractalApi } from '../utils/api';

function extractDefinitionId(item) {
    if (typeof item === 'string') return item;
    if (!item || typeof item !== 'object') return null;
    const direct = item.activity_id || item.activity_definition_id || item.activityId || item.activityDefinitionId || item.definition_id || item.id;
    if (direct) return direct;
    if (item.activity && typeof item.activity === 'object') {
        return item.activity.id || item.activity.activity_id || item.activity.activity_definition_id || null;
    }
    return null;
}

export function normalizeSectionActivityIds(data, instances) {
    if (!data || typeof data !== 'object') return data;
    const sections = Array.isArray(data.sections) ? data.sections : [];
    if (sections.length === 0) return data;

    const idsByDef = (instances || []).reduce((acc, instance) => {
        const definitionId = instance?.activity_definition_id;
        if (!definitionId || !instance?.id) return acc;
        if (!acc[definitionId]) acc[definitionId] = [];
        acc[definitionId].push(instance.id);
        return acc;
    }, {});

    const allInstanceIds = (instances || []).map((instance) => instance.id).filter(Boolean);
    const used = new Set();

    const normalizedSections = sections.map((section) => {
        if (!section || typeof section !== 'object') return section;

        const existing = Array.isArray(section.activity_ids)
            ? section.activity_ids.filter((id) => allInstanceIds.includes(id) && !used.has(id))
            : [];

        let activityIds = [...existing];

        if (activityIds.length === 0) {
            const rawItems = section.exercises || section.activities || [];

            for (const item of rawItems) {
                if (!item || typeof item !== 'object') continue;
                const instanceId = item.instance_id;
                if (instanceId && allInstanceIds.includes(instanceId) && !used.has(instanceId) && !activityIds.includes(instanceId)) {
                    activityIds.push(instanceId);
                }
            }

            if (activityIds.length === 0) {
                for (const item of rawItems) {
                    const definitionId = extractDefinitionId(item);
                    if (!definitionId) continue;
                    const candidates = idsByDef[definitionId] || [];
                    const candidate = candidates.find((id) => !used.has(id) && !activityIds.includes(id));
                    if (candidate) activityIds.push(candidate);
                }
            }
        }

        activityIds.forEach((id) => used.add(id));
        return {
            ...section,
            activity_ids: activityIds,
        };
    });

    if (normalizedSections.length === 1 && (!normalizedSections[0].activity_ids || normalizedSections[0].activity_ids.length === 0)) {
        normalizedSections[0] = {
            ...normalizedSections[0],
            activity_ids: allInstanceIds
        };
    }

    return {
        ...data,
        sections: normalizedSections,
    };
}

export function useSessionDetailData({ rootId, sessionId, isDeletingSession }) {
    const sessionKey = queryKeys.session(rootId, sessionId);
    const sessionActivitiesKey = queryKeys.sessionActivities(rootId, sessionId);
    const sessionGoalsViewKey = queryKeys.sessionGoalsView(rootId, sessionId);
    const activitiesKey = queryKeys.activities(rootId);
    const activityGroupsKey = queryKeys.activityGroups(rootId);

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

    const {
        data: activities = [],
        isLoading: activitiesLoading,
    } = useQuery({
        queryKey: activitiesKey,
        queryFn: async () => {
            const response = await fractalApi.getActivities(rootId);
            return response.data || [];
        },
        enabled: Boolean(rootId),
        staleTime: 60 * 1000,
    });

    const { data: activityGroups = [] } = useQuery({
        queryKey: activityGroupsKey,
        queryFn: async () => {
            const response = await fractalApi.getActivityGroups(rootId);
            return response.data || [];
        },
        enabled: Boolean(rootId),
    });

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

    const microGoals = useMemo(() => sessionGoalsView?.micro_goals || [], [sessionGoalsView]);

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

    const parentGoals = useMemo(() => session?.short_term_goals || [], [session]);
    const immediateGoals = useMemo(() => session?.immediate_goals || [], [session]);
    const allGoalsForTargets = useMemo(() => {
        return [...parentGoals, ...immediateGoals, ...microGoals];
    }, [immediateGoals, microGoals, parentGoals]);

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
        microGoals,
        normalizedSessionData,
        groupMap,
        groupedActivities,
        parentGoals,
        immediateGoals,
        targetAchievements,
        achievedTargetIds,
        goalAchievements,
        loading: sessionLoading || (session && !normalizedSessionData),
    };
}

export default useSessionDetailData;
