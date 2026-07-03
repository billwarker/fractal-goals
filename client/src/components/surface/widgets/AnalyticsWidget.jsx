import React, { useMemo, useRef } from 'react';

import {
    getVisualization,
    getVisualizationDefaultState,
} from '../../analytics/visualizations/registry';
import { sanitizeDashboardLayoutPayload } from '../../analytics/dashboardState';
import { useAnalyticsViews } from '../../../hooks/useDashboardQueries';
import { useAnalyticsPageData } from '../../../hooks/useAnalyticsPageData';

const EMPTY = [];

function useSavedAnalyticsViewName(state, sharedData) {
    const rootId = sharedData?.rootId;
    const { analyticsViewItems } = useAnalyticsViews(rootId);
    const savedViewId = state?.savedViewId || '';

    return useMemo(() => {
        if (!savedViewId) return '';
        const view = (analyticsViewItems || []).find((item) => item.id === savedViewId);
        return view?.name || '';
    }, [analyticsViewItems, savedViewId]);
}

export function AnalyticsWidgetHeaderTitle({ baseTitle, state, sharedData }) {
    const savedViewName = useSavedAnalyticsViewName(state, sharedData);

    if (!savedViewName) {
        return baseTitle;
    }

    return (
        <>
            {baseTitle}
            <span className="surface-widget-title-detail"> - {savedViewName}</span>
        </>
    );
}

export function AnalyticsWidgetHeaderControls({ state, onStateChange, sharedData }) {
    const rootId = sharedData?.rootId;
    const { analyticsViewItems } = useAnalyticsViews(rootId);
    const savedViewId = state?.savedViewId || '';

    return (
        <label className="surface-analytics-header-picker" data-no-panel-drag="true">
            <span>Saved view</span>
            <span className="surface-analytics-header-select-wrap">
                <select
                    className="surface-analytics-header-select"
                    aria-label="Saved analytics view"
                    value={savedViewId}
                    onMouseDown={(event) => event.stopPropagation()}
                    onChange={(event) => onStateChange?.({
                        savedViewId: event.target.value || null,
                        category: null,
                        visualization: null,
                    })}
                >
                    <option value="">Choose view</option>
                    {(analyticsViewItems || []).map((view) => (
                        <option key={view.id} value={view.id}>{view.name}</option>
                    ))}
                </select>
            </span>
        </label>
    );
}

/**
 * Renders a saved analytics view's primary visualization, or a category +
 * visualization the user selects inline. The chart context is assembled from
 * the goals page's shared data so the widget needs no analytics page state.
 */
export default function AnalyticsWidget({ state, sharedData, viewMode = 'overview' }) {
    const rootId = sharedData?.rootId;
    const chartRef = useRef(null);
    const { analyticsViewItems } = useAnalyticsViews(rootId);
    const analyticsData = useAnalyticsPageData(rootId);

    const savedViewId = state?.savedViewId || null;
    const category = state?.category || null;
    const visualizationId = state?.visualization || null;

    // Resolve the effective visualization + persisted state, preferring a saved
    // view's first window selection when one is chosen.
    const resolved = useMemo(() => {
        if (savedViewId) {
            const view = (analyticsViewItems || []).find((v) => v.id === savedViewId);
            const sanitized = sanitizeDashboardLayoutPayload(view?.layout);
            const firstWindowId = sanitized?.selectedWindowId || Object.keys(sanitized?.windowStates || {})[0];
            const ws = sanitized?.windowStates?.[firstWindowId] || {};
            const viz = getVisualization(ws.selectedCategory, ws.selectedVisualization);
            return {
                viz,
                vizState: ws.visualizationState || (viz ? getVisualizationDefaultState(ws.selectedCategory, ws.selectedVisualization) : {}),
                label: view?.name,
                queryProfileView: ws.selectedCategory === 'query' ? ws : null,
            };
        }
        const viz = getVisualization(category, visualizationId);
        return {
            viz,
            vizState: viz ? getVisualizationDefaultState(category, visualizationId) : {},
            label: viz?.name,
            queryProfileView: null,
        };
    }, [savedViewId, analyticsViewItems, category, visualizationId]);

    const scopedGoalIds = useMemo(() => (
        viewMode === 'scoped' && sharedData?.visibleGoalIds
            ? new Set(sharedData.visibleGoalIds)
            : null
    ), [sharedData?.visibleGoalIds, viewMode]);

    const goalAnalytics = useMemo(() => {
        const raw = analyticsData.goalAnalytics || {};
        if (!scopedGoalIds) return raw;
        const goals = (raw.goals || []).filter((goal) => scopedGoalIds.has(goal.id));
        return {
            ...raw,
            goals,
            summary: {
                ...(raw.summary || {}),
                total_goals: goals.length,
                completed_goals: goals.filter((goal) => goal.completed).length,
            },
        };
    }, [analyticsData.goalAnalytics, scopedGoalIds]);

    const effectiveSharedData = useMemo(() => ({
        ...sharedData,
        sessions: analyticsData.sessions || EMPTY,
        activities: analyticsData.activities || EMPTY,
        activityGroups: analyticsData.activityGroups || EMPTY,
        activityInstances: analyticsData.activityInstances || {},
        goalAnalytics,
        formatDuration: sharedData?.formatDuration || ((seconds = 0) => {
            const minutes = Math.round((seconds || 0) / 60);
            return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
        }),
    }), [analyticsData, goalAnalytics, sharedData]);

    const context = useMemo(() => ({
        data: effectiveSharedData || {},
        scopedData: {
            activities: effectiveSharedData?.activities || EMPTY,
            activityInstances: effectiveSharedData?.activityInstances || {},
            goals: effectiveSharedData?.goalAnalytics?.goals || EMPTY,
            goalSummary: effectiveSharedData?.goalAnalytics?.summary || null,
            sessions: effectiveSharedData?.sessions || EMPTY,
        },
        globalFilters: {},
        dateRange: { start: null, end: null },
        windowState: {},
        updateWindowState: () => {},
        visualization: resolved.viz,
        visualizationState: resolved.vizState,
        updateVisualizationState: () => {},
        chartRef,
        effectiveSelectedActivity: null,
        effectiveSelectedGoal: null,
        getGoalTypeColor: effectiveSharedData?.getGoalTypeColor,
        onGlobalDateRangeChange: () => {},
    }), [effectiveSharedData, resolved]);

    const Chart = resolved.viz?.Chart;

    const renderQueryProfileView = () => (
        <div className="surface-analytics-query-view">
            <strong>{resolved.label || 'SQL analytics view'}</strong>
            <span>{resolved.queryProfileView?.visualizationState?.suggestion?.label || 'Saved SQL visualization'}</span>
            <small>{viewMode === 'scoped' ? 'Scoped to selected subtree when compatible.' : 'Whole-fractal context.'}</small>
        </div>
    );

    return (
        <div className="surface-analytics" data-no-panel-drag="true">
            {resolved.queryProfileView ? (
                renderQueryProfileView()
            ) : Chart ? (
                <div className="surface-analytics-chart">
                    <Chart context={context} />
                </div>
            ) : (
                <div className="surface-widget-empty">Choose an analytics view in configure mode.</div>
            )}
        </div>
    );
}
