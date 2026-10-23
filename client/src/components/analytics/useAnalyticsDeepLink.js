import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { parseAnalyticsLink } from '../../utils/analyticsDeepLink';
import { normalizeGlobalFilters } from './analyticsGlobalFilters';
import { getDefaultWindowState } from './dashboardState';
import { getVisualizationSelectionUpdate, getVisualizationStateUpdate } from './visualizations/state';

/** Links need evidence before their activity can be resolved into a panel. */
export function useAnalyticsEvidenceDemand(windowStates) {
    const [searchParams] = useSearchParams();
    return Boolean(parseAnalyticsLink(searchParams))
        || Object.values(windowStates).some((state) => ['sessions', 'activities'].includes(state.selectedCategory));
}

/** The single panel and global filters an Analytics link describes. */
export function analyticsStateFromLink(link, activity) {
    const base = { ...getDefaultWindowState(), selectedCategory: 'activities', selectedActivity: activity };
    const withVisualization = { ...base, ...getVisualizationSelectionUpdate(base, link.viz) };
    const updates = {
        ...(link.metricIds.length ? { metrics: link.metricIds } : {}),
        ...(link.metricX ? { metricX: link.metricX } : {}),
        ...(link.metricY ? { metricY: link.metricY } : {}),
        ...(link.setsHandling ? { setsHandling: link.setsHandling } : {}),
    };
    const windowState = Object.keys(updates).length
        ? { ...withVisualization, ...getVisualizationStateUpdate(withVisualization, updates) }
        : withVisualization;
    return {
        windowState,
        globalFilters: normalizeGlobalFilters({
            tags: link.tags,
            sessions: { templateIds: link.templateIds, programDayIds: link.programDayIds },
        }),
    };
}

/**
 * Opens Analytics pre-configured from a link (see utils/analyticsDeepLink.js) once the activity
 * has loaded, then clears the link so a reload or a later view change is not overridden.
 */
export default function useAnalyticsDeepLink({ isHydrated, activities, onApply }) {
    const [searchParams, setSearchParams] = useSearchParams();
    const link = useMemo(() => parseAnalyticsLink(searchParams), [searchParams]);
    useEffect(() => {
        if (!isHydrated || !link) return;
        const activity = (activities || []).find((candidate) => candidate.id === link.activityId);
        if (!activity) return;
        onApply(analyticsStateFromLink(link, activity));
        setSearchParams({}, { replace: true });
    }, [activities, isHydrated, link, onApply, setSearchParams]);
}
