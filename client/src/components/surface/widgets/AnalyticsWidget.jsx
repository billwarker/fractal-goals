import React, { useMemo, useRef } from 'react';

import {
    VISUALIZATION_CATEGORIES,
    getVisualization,
    getVisualizationDefaultState,
    getVisualizationsByCategory,
} from '../../analytics/visualizations/registry';
import { useAnalyticsViews } from '../../../hooks/useDashboardQueries';

const EMPTY = [];

/**
 * Renders a saved analytics view's primary visualization, or a category +
 * visualization the user selects inline. The chart context is assembled from
 * the goals page's shared data so the widget needs no analytics page state.
 */
export default function AnalyticsWidget({ state, onStateChange, sharedData, configureMode }) {
    const rootId = sharedData?.rootId;
    const chartRef = useRef(null);
    const { analyticsViews } = useAnalyticsViews(rootId);

    const savedViewId = state?.savedViewId || null;
    const category = state?.category || null;
    const visualizationId = state?.visualization || null;

    // Resolve the effective visualization + persisted state, preferring a saved
    // view's first window selection when one is chosen.
    const resolved = useMemo(() => {
        if (savedViewId) {
            const view = (analyticsViews || []).find((v) => v.id === savedViewId);
            const layout = view?.layout;
            const windowStates = layout?.window_states || {};
            const firstWindowId = layout?.selected_window_id || Object.keys(windowStates)[0];
            const ws = windowStates[firstWindowId] || {};
            const viz = getVisualization(ws.selectedCategory, ws.selectedVisualization);
            return {
                viz,
                vizState: ws.visualizationState || (viz ? getVisualizationDefaultState(ws.selectedCategory, ws.selectedVisualization) : {}),
                label: view?.name,
            };
        }
        const viz = getVisualization(category, visualizationId);
        return {
            viz,
            vizState: viz ? getVisualizationDefaultState(category, visualizationId) : {},
            label: viz?.name,
        };
    }, [savedViewId, analyticsViews, category, visualizationId]);

    const context = useMemo(() => ({
        data: sharedData || {},
        scopedData: {
            activities: sharedData?.activities || EMPTY,
            activityInstances: sharedData?.activityInstances || EMPTY,
            goals: sharedData?.goalAnalytics?.goals || EMPTY,
            goalSummary: sharedData?.goalAnalytics?.summary || null,
            sessions: sharedData?.sessions || EMPTY,
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
        getGoalTypeColor: sharedData?.getGoalTypeColor,
        onGlobalDateRangeChange: () => {},
    }), [sharedData, resolved]);

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
                    {(analyticsViews || []).map((v) => (
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

    return (
        <div className="surface-analytics" data-no-panel-drag="true">
            {configureMode && renderPicker()}
            {Chart ? (
                <div className="surface-analytics-chart">
                    <Chart context={context} />
                </div>
            ) : (
                !configureMode && <div className="surface-widget-empty">Choose an analytics view in configure mode.</div>
            )}
        </div>
    );
}
