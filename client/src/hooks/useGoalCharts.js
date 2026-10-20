import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { sanitizeDashboardLayoutPayload } from '../components/analytics/dashboardState';
import { fractalApi } from '../utils/api';
import { formatError } from '../utils/mutationNotify';
import { useSessionEvidenceHistory } from './useAnalyticsPageData';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';

/** Chart categories a goal can show; session views stay on the Analytics page. */
export const ATTACHABLE_CATEGORIES = new Set(['activities', 'goals']);

/** A saved view's single window state and filters, from its stored layout. */
export function readSavedView(layout) {
    const sanitized = sanitizeDashboardLayoutPayload(layout);
    if (!sanitized) return null;
    const windowState = sanitized.windowStates?.[sanitized.selectedWindowId] || {};
    return { windowState, globalFilters: sanitized.globalFilters, category: windowState.selectedCategory || null };
}

/** Why a saved view can't be shown on a goal, or null when it can. */
export function viewAttachProblem(view) {
    if (!view) return 'View not found';
    if ((view.kind || 'dashboard') !== 'view') return 'Only single-chart views can be added to goals';
    const saved = readSavedView(view.layout);
    if (!saved?.windowState?.selectedVisualization) return 'This view has no chart yet';
    if (!ATTACHABLE_CATEGORIES.has(saved.category)) return 'Session charts stay in Analytics';
    return null;
}

/** The goal's default chart (if any) and its attached views, in order. */
export function useGoalCharts(rootId, goalId, { enabled = true } = {}) {
    return useQuery({
        queryKey: queryKeys.goalCharts(rootId, goalId),
        queryFn: async () => (await fractalApi.getGoalCharts(rootId, goalId)).data,
        enabled: Boolean(rootId && goalId && enabled),
        staleTime: 30 * 1000,
    });
}

function useRefreshGoalCharts(rootId) {
    const queryClient = useQueryClient();
    return useCallback(() => queryClient.invalidateQueries({ queryKey: queryKeys.goalChartsRoot(rootId) }), [queryClient, rootId]);
}

/** Attach or remove a saved view on one goal. */
export function useGoalChartMutations(rootId, goalId) {
    const refresh = useRefreshGoalCharts(rootId);
    const [isSaving, setIsSaving] = useState(false);
    const run = useCallback(async (request, failure) => {
        setIsSaving(true);
        try {
            await request();
            await refresh();
            return true;
        } catch (error) {
            notify.error(`${failure}: ${formatError(error)}`);
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [refresh]);
    return {
        isSaving,
        attach: (dashboardId) => run(() => fractalApi.attachGoalChart(rootId, goalId, dashboardId), 'Couldn’t add the chart'),
        detach: (dashboardId) => run(() => fractalApi.detachGoalChart(rootId, goalId, dashboardId), 'Couldn’t remove the chart'),
    };
}

/** The goals a saved view shows on, and setting them (Analytics' "Add to goal…"). */
export function useViewGoals(rootId, dashboardId, { enabled = true } = {}) {
    const refresh = useRefreshGoalCharts(rootId);
    const query = useQuery({
        queryKey: queryKeys.analyticsViewGoals(rootId, dashboardId),
        queryFn: async () => (await fractalApi.getAnalyticsViewGoals(rootId, dashboardId)).data,
        enabled: Boolean(rootId && dashboardId && enabled),
    });
    const setGoals = useCallback(async (goalIds) => {
        try {
            await fractalApi.setAnalyticsViewGoals(rootId, dashboardId, goalIds);
            await refresh();
            return true;
        } catch (error) {
            notify.error(`Couldn’t update the view’s goals: ${formatError(error)}`);
            return false;
        }
    }, [dashboardId, refresh, rootId]);
    return { ...query, setGoals };
}

function useCachedList(queryKey, load, enabled) {
    return useQuery({ queryKey, queryFn: async () => (await load()).data || [], enabled, staleTime: 5 * 60 * 1000 });
}

/**
 * Data for one saved view on a goal. A view about one activity reads that activity's recent
 * evidence; other activity views read the same full session history as the Analytics page (so
 * totals match it); goal views read the (cached) goal analytics.
 */
export function useGoalChartData(rootId, saved) {
    const category = saved?.category;
    const activityId = saved?.windowState?.selectedActivity?.id || null;
    const isActivity = category === 'activities';
    const activities = useCachedList(queryKeys.activities(rootId), () => fractalApi.getActivities(rootId), Boolean(rootId && isActivity));
    const activityGroups = useCachedList(queryKeys.activityGroups(rootId), () => fractalApi.getActivityGroups(rootId), Boolean(rootId && isActivity));
    const evidence = useQuery({
        queryKey: queryKeys.goalChartEvidence(rootId, activityId),
        queryFn: async () => (await fractalApi.getActivityAnalyticsEvidence(rootId, activityId)).data,
        enabled: Boolean(rootId && isActivity && activityId),
        staleTime: 60 * 1000,
    });
    const history = useSessionEvidenceHistory(rootId, { enabled: Boolean(isActivity && !activityId) });
    // Charted only once every page has arrived, so totals don't grow on screen.
    const historyLoading = !history.isComplete && !history.query.isError;
    const goalAnalytics = useQuery({
        queryKey: queryKeys.goalAnalytics(rootId),
        queryFn: async () => (await fractalApi.getGoalAnalytics(rootId)).data || null,
        enabled: Boolean(rootId && category === 'goals'),
    });

    const data = useMemo(() => {
        if (category === 'goals') {
            return { rootId, goalAnalytics: goalAnalytics.data || null, sessions: [], activities: [], activityGroups: [], activityInstances: {} };
        }
        const definition = evidence.data?.activity_definition;
        const knownActivities = activities.data || [];
        // The evidence carries the full definition (metrics, splits) the charts need.
        const mergedActivities = definition
            ? [...knownActivities.filter((activity) => activity.id !== definition.id), { ...knownActivities.find((activity) => activity.id === definition.id), ...definition }]
            : knownActivities;
        return {
            rootId,
            goalAnalytics: null,
            sessions: activityId ? [] : history.sessions,
            activities: mergedActivities,
            activityGroups: activityGroups.data || [],
            activityInstances: activityId ? { [activityId]: evidence.data?.instances || [] } : history.activityInstances,
        };
    }, [activities.data, activityGroups.data, activityId, category, evidence.data, goalAnalytics.data, history.activityInstances, history.sessions, rootId]);

    const sources = category === 'goals' ? [goalAnalytics] : [activities, activityGroups, activityId ? evidence : history.query];
    return {
        data,
        isLoading: sources.some((query) => query.isLoading) || (isActivity && !activityId && historyLoading),
        isError: sources.some((query) => query.isError),
        retry: () => sources.forEach((query) => query.refetch()),
        truncated: Boolean(evidence.data?.truncated),
    };
}
