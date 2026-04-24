import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useTargetAchievements } from './useTargetAchievements';
import { useActivities, useActivityGroups } from './useActivityQueries';
import { queryKeys } from './queryKeys';
import { fractalApi } from '../utils/api';
import { flattenSessionGoalsViewGoals } from '../utils/goalNodeModel';

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

    const idsByDef = new Map();
    const allInstanceIds = [];
    const allInstanceIdSet = new Set();

    (instances || []).forEach((instance) => {
        const definitionId = instance?.activity_definition_id;
        const instanceId = instance?.id;
        if (!definitionId || !instanceId) return;
        const normalizedDefinitionId = String(definitionId);
        if (!idsByDef.has(normalizedDefinitionId)) idsByDef.set(normalizedDefinitionId, []);
        idsByDef.get(normalizedDefinitionId).push(instanceId);
        allInstanceIds.push(instanceId);
        allInstanceIdSet.add(instanceId);
    });

    const used = new Set();

    const normalizedSections = sections.map((section) => {
        if (!section || typeof section !== 'object') return section;

        const existing = Array.isArray(section.activity_ids)
            ? section.activity_ids.filter((id) => allInstanceIdSet.has(id) && !used.has(id))
            : [];

        let activityIds = [...existing];
        const sectionActivityIdSet = new Set(activityIds);

        if (activityIds.length === 0) {
            const rawItems = section.exercises || section.activities || [];

            for (const item of rawItems) {
                if (!item || typeof item !== 'object') continue;
                const instanceId = item.instance_id;
                if (instanceId && allInstanceIdSet.has(instanceId) && !used.has(instanceId) && !sectionActivityIdSet.has(instanceId)) {
                    activityIds.push(instanceId);
                    sectionActivityIdSet.add(instanceId);
                }
            }

            if (activityIds.length === 0) {
                for (const item of rawItems) {
                    const definitionId = extractDefinitionId(item);
                    if (!definitionId) continue;
                    const candidates = idsByDef.get(String(definitionId)) || [];
                    const candidate = candidates.find((id) => !used.has(id) && !sectionActivityIdSet.has(id));
                    if (candidate) {
                        activityIds.push(candidate);
                        sectionActivityIdSet.add(candidate);
                    }
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

    const parentGoals = useMemo(() => session?.short_term_goals || [], [session]);
    const immediateGoals = useMemo(() => session?.immediate_goals || [], [session]);
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
        parentGoals,
        immediateGoals,
        targetAchievements,
        achievedTargetIds,
        goalAchievements,
        loading: sessionLoading || (session && !normalizedSessionData),
    };
}

export default useSessionDetailData;
