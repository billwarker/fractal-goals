import { useMemo, useState } from 'react';

import {
    activeFilterIds, appliedFilters, filterSections, getFilterCapabilities,
} from './visualizations/capabilities';
import { getVisualization } from './visualizations/registry';

/**
 * The filter pane's decisions: which filters show, which the selected chart ignores, adding or
 * removing an optional filter for the chart, and clearing a filter from its chip.
 */
export default function useAnalyticsFilterPane({
    scopeKind = 'single',
    selectedWindowState, selectedVisualizationMeta, windowStates, visualizationState, normalized, dateRange,
    updateVisualizationState, updateFilters, onDateRangeChange,
}) {
    const active = activeFilterIds(normalized, dateRange);
    // Which filters show: the selected chart's own, the ones added to it, the other open charts'
    // core filters, and any that are set (visualizations/capabilities.js).
    const selectedCapabilities = selectedWindowState?.selectedCategory
        ? getFilterCapabilities(selectedWindowState.selectedCategory, selectedVisualizationMeta)
        : null;
    const openPanels = useMemo(() => Object.values(windowStates || {})
        .filter((state) => state?.selectedCategory)
        .map((state) => getFilterCapabilities(
            state.selectedCategory, getVisualization(state.selectedCategory, state.selectedVisualization),
        )), [windowStates]);
    // A chart keeps its added filters in its own state (saved with the view); with no chart
    // selected they're kept for the visit.
    const [pageShownFilters, setPageShownFilters] = useState([]);
    const hasChart = Boolean(selectedWindowState?.selectedVisualization);
    const shownFilters = hasChart
        ? (Array.isArray(visualizationState.shownFilters) ? visualizationState.shownFilters : [])
        : pageShownFilters;
    const { visible, optional: optionalFilters } = filterSections({
        selected: hasChart ? selectedCapabilities : null, shownFilters, openPanels, active,
    });
    const isVisible = (id) => visible.includes(id);
    const chartName = selectedVisualizationMeta?.name || null;
    const notAppliedTo = (id) => {
        if (selectedCapabilities) return appliedFilters(selectedCapabilities).has(id) ? null : (chartName || 'this chart');
        if (openPanels.length && !openPanels.some((panel) => appliedFilters(panel).has(id))) return 'the open charts';
        return null;
    };
    const toggleShownFilter = (id) => {
        const next = shownFilters.includes(id) ? shownFilters.filter((shown) => shown !== id) : [...shownFilters, id];
        if (hasChart) updateVisualizationState({ shownFilters: next });
        else setPageShownFilters(next);
    };
    const removeFilter = (id) => {
        if (id === 'timeRange') return onDateRangeChange?.({ start: null, end: null });
        return updateFilters((current) => {
            if (id === 'goals') return { ...current, goals: { ...current.goals, goalIds: [] } };
            if (id === 'activities') return { ...current, activities: { activityIds: [], groupIds: [] } };
            if (id === 'tags') return { ...current, tags: null };
            const key = id === 'templates' ? 'templateIds' : 'programDayIds';
            return { ...current, sessions: { ...current.sessions, [key]: [] } };
        });
    };

    return { active, chartName, isVisible,
        optionalFilters: scopeKind === 'chart' ? optionalFilters.filter((id) => id !== 'timeRange') : optionalFilters,
        notAppliedTo, toggleShownFilter, removeFilter };
}
