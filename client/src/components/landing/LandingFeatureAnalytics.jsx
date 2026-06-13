import React, { useEffect, useMemo, useState } from 'react';

import AnalyticsFiltersSidebar from '../analytics/AnalyticsFiltersSidebar';
import {
    getDefaultGlobalFilters,
    getDefaultWindowState,
    sanitizeDashboardLayoutPayload,
} from '../analytics/dashboardState';
import { normalizeGlobalFilters } from '../analytics/analyticsGlobalFilters';
import ProfileWindow from '../analytics/ProfileWindow';
import { flattenGoalTree } from '../../utils/goalNodeModel';
import styles from './LandingFeaturesSection.module.css';

const DEFAULT_LAYOUT = { type: 'grid', panels: [{ id: 'window-1', x: 0, y: 0, w: 96, h: 48 }] };
const DEFAULT_WINDOW_STATES = {
    'window-1': getDefaultWindowState(),
};

const formatDuration = (seconds) => {
    if (!seconds || seconds === 0) return '0m';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

function toGoalAnalyticsGoals(tree) {
    return flattenGoalTree(tree).map((goal) => ({
        ...goal,
        goal_id: goal.id,
        goal_name: goal.name,
        goal_type: goal.type,
        total_duration_seconds: goal.attributes?.total_duration_seconds || 0,
        session_count: goal.attributes?.session_count || 0,
        activity_breakdown: goal.attributes?.activity_breakdown || [],
        session_durations_by_date: goal.attributes?.session_durations_by_date || [],
    }));
}

function buildActivityInstances(example) {
    const byActivityId = {};
    (example?.sessions || []).forEach((session) => {
        (session.activity_instances || []).forEach((instance) => {
            const activityId = instance.activity_definition_id || instance.activityDefinitionId;
            if (!activityId) return;
            if (!byActivityId[activityId]) byActivityId[activityId] = [];
            byActivityId[activityId].push({
                ...instance,
                session_id: session.id,
                session_name: session.name,
                session_start: session.session_start || session.attributes?.session_data?.session_start,
                session_end: session.session_end || session.attributes?.session_data?.session_end,
            });
        });
    });
    return byActivityId;
}

function resolveDashboard(view) {
    const sanitized = sanitizeDashboardLayoutPayload(view?.layout);
    if (!sanitized) {
        return {
            layout: DEFAULT_LAYOUT,
            windowStates: DEFAULT_WINDOW_STATES,
            selectedWindowId: 'window-1',
            globalFilters: getDefaultGlobalFilters(),
        };
    }
    return sanitized;
}

function getPreviewWindowIds(layout) {
    const panels = layout?.type === 'grid' && Array.isArray(layout.panels)
        ? layout.panels
        : DEFAULT_LAYOUT.panels;
    return panels
        .slice()
        .sort((left, right) => (left.y - right.y) || (left.x - right.x))
        .map((panel) => panel.id)
        .filter(Boolean);
}

export default function LandingFeatureAnalytics({ example, views }) {
    const validViews = useMemo(() => (views || []).filter((view) => view?.id), [views]);
    const [selectedViewId, setSelectedViewId] = useState(validViews[0]?.id || '');
    const selectedView = validViews.find((view) => view.id === selectedViewId) || validViews[0] || null;
    const dashboard = useMemo(() => resolveDashboard(selectedView), [selectedView]);
    const [windowIds, setWindowIds] = useState(() => getPreviewWindowIds(dashboard.layout));
    const [windowStates, setWindowStates] = useState(dashboard.windowStates);
    const [selectedWindowId, setSelectedWindowId] = useState(dashboard.selectedWindowId);
    const [globalFilters, setGlobalFilters] = useState(dashboard.globalFilters);
    const [globalDateRange, setGlobalDateRange] = useState({ start: null, end: null });
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);

    useEffect(() => {
        if (!validViews.some((view) => view.id === selectedViewId)) {
            setSelectedViewId(validViews[0]?.id || '');
        }
    }, [selectedViewId, validViews]);

    useEffect(() => {
        setWindowIds(getPreviewWindowIds(dashboard.layout));
        setWindowStates(dashboard.windowStates);
        setSelectedWindowId(dashboard.selectedWindowId);
        setGlobalFilters(dashboard.globalFilters);
    }, [dashboard]);

    const data = useMemo(() => ({
        sessions: example?.sessions || [],
        goalAnalytics: {
            goals: toGoalAnalyticsGoals(example?.tree),
            summary: example?.metricsSummary || null,
        },
        activities: example?.activityDefinitions || [],
        activityGroups: example?.activityGroups || [],
        activityInstances: buildActivityInstances(example),
        formatDuration,
        rootId: example?.id || example?.root_id,
    }), [example]);

    if (!validViews.length) {
        return <div className={styles.emptyState}>Save an analytics view to publish it here.</div>;
    }

    const selectedWindowState = windowStates[selectedWindowId] || null;
    const updateSelectedWindowState = (updates) => {
        if (!selectedWindowId) return;
        setWindowStates((current) => ({
            ...current,
            [selectedWindowId]: {
                ...(current[selectedWindowId] || getDefaultWindowState()),
                ...updates,
            },
        }));
    };

    const handleDateRangeChange = (nextRange) => {
        const normalized = {
            start: nextRange?.start || null,
            end: nextRange?.end || null,
        };
        setGlobalDateRange(
            normalized.start && normalized.end && normalized.start > normalized.end
                ? { start: normalized.end, end: normalized.start }
                : normalized
        );
    };

    return (
        <div className={styles.analyticsPagePreview}>
            <div className={styles.analyticsPreviewTopBar}>
                <div className={styles.analyticsViewTitle}>
                    <span>{selectedView?.name || 'Analytics View'}</span>
                    {validViews.length > 1 && (
                        <div className={styles.analyticsViewPicker} aria-label="Published analytics views">
                            {validViews.map((view) => (
                                <button
                                    type="button"
                                    className={view.id === selectedView?.id ? styles.analyticsViewActive : ''}
                                    onClick={() => setSelectedViewId(view.id)}
                                    key={view.id}
                                >
                                    {view.name || 'Untitled'}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    className={styles.analyticsFiltersToggle}
                    onClick={() => setIsFiltersOpen((current) => !current)}
                >
                    {isFiltersOpen ? 'Hide Filters' : 'Show Filters'}
                </button>
            </div>

            <div className={styles.analyticsPreviewBody}>
                <div className={styles.analyticsWorkspace}>
                    <div
                        className={styles.analyticsDashboardGrid}
                        data-window-count={windowIds.length}
                        onMouseDown={(event) => {
                            if (event.target === event.currentTarget) setSelectedWindowId(null);
                        }}
                    >
                        {windowIds.map((windowId) => (
                            <div className={styles.analyticsDashboardPanel} key={windowId}>
                                <ProfileWindow
                                    windowId={windowId}
                                    canSplit={false}
                                    onSplit={() => {}}
                                    canClose={false}
                                    onClose={() => {}}
                                    data={data}
                                    windowState={windowStates[windowId] || getDefaultWindowState()}
                                    updateWindowState={(updates) => {
                                        setWindowStates((current) => ({
                                            ...current,
                                            [windowId]: {
                                                ...(current[windowId] || getDefaultWindowState()),
                                                ...updates,
                                            },
                                        }));
                                    }}
                                    isSelected={selectedWindowId === windowId}
                                    onSelect={() => setSelectedWindowId(windowId)}
                                    dragHandleProps={null}
                                    globalDateRange={globalDateRange}
                                    onGlobalDateRangeChange={handleDateRangeChange}
                                    globalFilters={globalFilters}
                                />
                            </div>
                        ))}
                        {windowIds.length === 0 && (
                            <ProfileWindow
                                windowId="window-1"
                                canSplit={false}
                                onSplit={() => {}}
                                canClose={false}
                                onClose={() => {}}
                                data={data}
                                windowState={windowStates['window-1'] || getDefaultWindowState()}
                                updateWindowState={(updates) => {
                                    setWindowStates((current) => ({
                                        ...current,
                                        'window-1': {
                                            ...(current['window-1'] || getDefaultWindowState()),
                                            ...updates,
                                        },
                                    }));
                                }}
                                isSelected={selectedWindowId === 'window-1'}
                                onSelect={() => setSelectedWindowId('window-1')}
                                dragHandleProps={null}
                                globalDateRange={globalDateRange}
                                onGlobalDateRangeChange={handleDateRangeChange}
                                globalFilters={globalFilters}
                            />
                        )}
                    </div>
                </div>

                {isFiltersOpen && (
                    <aside className={styles.analyticsFiltersPane}>
                        <AnalyticsFiltersSidebar
                            filters={globalFilters}
                            dateRange={globalDateRange}
                            goals={data.goalAnalytics.goals}
                            activities={data.activities}
                            activityGroups={data.activityGroups}
                            activityInstances={data.activityInstances}
                            selectedWindowState={selectedWindowState}
                            onUpdateSelectedWindowState={updateSelectedWindowState}
                            onChange={(nextFilters) => setGlobalFilters(normalizeGlobalFilters(nextFilters))}
                            onDateRangeChange={handleDateRangeChange}
                            onReset={() => setGlobalFilters(getDefaultGlobalFilters())}
                            onToggleCollapse={() => setIsFiltersOpen(false)}
                            isMobile={false}
                        />
                    </aside>
                )}
            </div>
        </div>
    );
}
