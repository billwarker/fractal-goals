import React, { useMemo, useRef } from 'react';

import {
    VISUALIZATION_CATEGORIES,
    getVisualization,
    getVisualizationDefaultState,
    getVisualizationsByCategory,
} from '../../analytics/visualizations/registry';
import { sanitizeDashboardLayoutPayload } from '../../analytics/dashboardState';
import { useAnalyticsViews } from '../../../hooks/useDashboardQueries';
import { useAnalyticsPageData } from '../../../hooks/useAnalyticsPageData';

const EMPTY = [];

/**
 * Renders a saved analytics view's primary visualization, or a category +
 * visualization the user selects inline. The chart context is assembled from
 * the goals page's shared data so the widget needs no analytics page state.
 */
export default function AnalyticsWidget({ state, onStateChange, sharedData, viewMode = 'overview', configureMode }) {
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

    // Picker (shown when nothing resolved, or always available in configure mode)
    const renderPicker = () => (
        <div className="surface-analytics-picker">
            <label className="surface-analytics-picker-row">
                <span>Saved view</span>
                <select
                    value={savedViewId || ''}
                    onChange={(e) => onStateChange?.({ savedViewId: e.target.value || null, category: null, visualization: null })}
                >
                    <option value="">— choose —</option>
                    {(analyticsViewItems || []).map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                </select>
            </label>
            {!savedViewId && (
                <>
                    <label className="surface-analytics-picker-row">
                        <span>Category</span>
                        <select
                            value={category || ''}
                            onChange={(e) => onStateChange?.({ category: e.target.value || null, visualization: null })}
                        >
                            <option value="">— choose —</option>
                            {VISUALIZATION_CATEGORIES.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </label>
                    {category && (
                        <label className="surface-analytics-picker-row">
                            <span>Chart</span>
                            <select
                                value={visualizationId || ''}
                                onChange={(e) => onStateChange?.({ visualization: e.target.value || null })}
                            >
                                <option value="">— choose —</option>
                                {getVisualizationsByCategory(category).map((v) => (
                                    <option key={v.id} value={v.id}>{v.name}</option>
                                ))}
                            </select>
                        </label>
                    )}
                </>
            )}
        </div>
    );

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
            {configureMode && renderPicker()}
            {resolved.queryProfileView ? (
                renderQueryProfileView()
            ) : Chart ? (
                <div className="surface-analytics-chart">
                    <Chart context={context} />
                </div>
            ) : (
                !configureMode && <div className="surface-widget-empty">Choose an analytics view in configure mode.</div>
            )}
        </div>
    );
}
