import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import AnalyticsTopBar from '../components/analytics/AnalyticsTopBar';
import AnalyticsFiltersSidebar from '../components/analytics/AnalyticsFiltersSidebar';
import AnalyticsQueryConsole from '../components/analytics/AnalyticsQueryConsole';
import {
    createDashboardLayoutPayload,
    getDefaultGlobalFilters,
    getDefaultWindowState,
    getHighestWindowIndex,
    sanitizeDashboardLayoutPayload,
} from '../components/analytics/dashboardState';
import { normalizeGlobalFilters } from '../components/analytics/analyticsGlobalFilters';
import ProfileWindowLayout, {
    countWindows,
    getGridLayoutExtent,
    getWindowIds,
    removeWindow,
    rescaleGridLayout,
    splitWindow,
} from '../components/analytics/ProfileWindowLayout';
import { useAnalyticsPageData } from '../hooks/useAnalyticsPageData';
import { useAnalyticsViews } from '../hooks/useDashboardQueries';
import { useDebug } from '../contexts/DebugContext';
import '../App.css';
import notify from '../utils/notify';
import useIsMobile, { getIsMobileViewport } from '../hooks/useIsMobile';
import ModalBackdrop from '../components/atoms/ModalBackdrop';
import styles from './Analytics.module.css';

const AnalyticsViewNameModal = lazy(() => import('../components/analytics/AnalyticsViewNameModal'));
const AnalyticsViewsModal = lazy(() => import('../components/analytics/AnalyticsViewsModal'));
const ProfileWindow = lazy(() => import('../components/analytics/ProfileWindow'));

const MAX_WINDOWS = 4;
const FILTER_PANE_COLUMNS = 16;
const DEFAULT_LAYOUT = { type: 'grid', panels: [{ id: 'window-1', x: 0, y: 0, w: 96, h: 48 }] };
const DEFAULT_SELECTED_WINDOW_ID = 'window-1';
const DEFAULT_WINDOW_STATES = {
    'window-1': getDefaultWindowState(),
};
const EMPTY_VIEW_NAME = 'Empty Analytics View';
const analyticsFallback = (
    <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
        Loading analytics panel...
    </div>
);

const formatDuration = (seconds) => {
    if (!seconds || seconds === 0) return '0m';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
};

const getStoredBoolean = (key, fallback) => {
    if (typeof window === 'undefined' || typeof window.localStorage?.getItem !== 'function') {
        return fallback;
    }
    const stored = window.localStorage.getItem(key);
    return stored == null ? fallback : stored === 'true';
};

let windowIdCounter = 1;
const generateWindowId = () => `window-${++windowIdCounter}`;

function Analytics() {
    const { rootId } = useParams();
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const { debugMode } = useDebug();
    const {
        activities,
        activityGroups,
        activityInstances,
        goalAnalytics,
        loading,
        sessions,
    } = useAnalyticsPageData(rootId);
    const {
        analyticsViews,
        createAnalyticsView,
        updateAnalyticsView,
        deleteAnalyticsView,
    } = useAnalyticsViews(rootId);

    const [layout, setLayout] = useState(DEFAULT_LAYOUT);
    const [selectedWindowId, setSelectedWindowId] = useState(DEFAULT_SELECTED_WINDOW_ID);
    const [windowStates, setWindowStates] = useState(DEFAULT_WINDOW_STATES);
    const [selectedViewId, setSelectedViewId] = useState('');
    const [currentViewName, setCurrentViewName] = useState(EMPTY_VIEW_NAME);
    const [globalDateRange, setGlobalDateRange] = useState({ start: null, end: null });
    const [globalFilters, setGlobalFilters] = useState(getDefaultGlobalFilters());
    const filtersPaneStorageKey = `analytics-filter-pane-open:${rootId || 'default'}`;
    const [isFiltersPaneOpen, setIsFiltersPaneOpen] = useState(() => {
        return getIsMobileViewport()
            ? false
            : getStoredBoolean(`analytics-filter-pane-open:${rootId || 'default'}`, false);
    });
    const [isHydrated, setIsHydrated] = useState(false);
    const [isViewsModalOpen, setIsViewsModalOpen] = useState(false);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [activeMode, setActiveMode] = useState('dashboard');
    const [dashboardBounds, setDashboardBounds] = useState(null);
    const [isDashboardSettling, setIsDashboardSettling] = useState(false);

    const resetToEmptyView = useCallback(() => {
        windowIdCounter = 1;
        setLayout(DEFAULT_LAYOUT);
        setWindowStates(DEFAULT_WINDOW_STATES);
        setSelectedWindowId(DEFAULT_SELECTED_WINDOW_ID);
        setSelectedViewId('');
        setCurrentViewName(EMPTY_VIEW_NAME);
        setGlobalDateRange({ start: null, end: null });
        setGlobalFilters(getDefaultGlobalFilters());
    }, []);

    const fitLayoutToCurrentBounds = useCallback((incomingLayout, savedBounds = null) => {
        if (!dashboardBounds) return incomingLayout;
        if (savedBounds?.columns && savedBounds?.rows) {
            return rescaleGridLayout(incomingLayout, savedBounds, dashboardBounds);
        }

        const extent = getGridLayoutExtent(incomingLayout);
        const missingColumns = dashboardBounds.columns - extent.columns;
        const looksLikeClosedFilterPaneGap = !isFiltersPaneOpen
            && missingColumns >= FILTER_PANE_COLUMNS - 2
            && missingColumns <= FILTER_PANE_COLUMNS + 4;
        if (!looksLikeClosedFilterPaneGap) return incomingLayout;

        return rescaleGridLayout(
            incomingLayout,
            { columns: extent.columns, rows: dashboardBounds.rows },
            dashboardBounds
        );
    }, [dashboardBounds, isFiltersPaneOpen]);

    const applyAnalyticsViewLayout = useCallback((payload, { source = 'analytics-view' } = {}) => {
        const sanitized = sanitizeDashboardLayoutPayload(payload);
        if (!sanitized) {
            notify.error(source === 'analytics-view'
                ? 'Saved analytics view is no longer compatible'
                : 'Analytics draft could not be restored');
            return false;
        }

        windowIdCounter = getHighestWindowIndex(sanitized.layout);
        setIsDashboardSettling(true);
        setLayout(fitLayoutToCurrentBounds(sanitized.layout, sanitized.layoutBounds));
        setWindowStates(sanitized.windowStates);
        setSelectedWindowId(sanitized.selectedWindowId);
        setGlobalFilters(sanitized.globalFilters || getDefaultGlobalFilters());
        return true;
    }, [fitLayoutToCurrentBounds]);

    useEffect(() => {
        if (!isDashboardSettling || !dashboardBounds) return undefined;
        let secondFrame = 0;
        const firstFrame = window.requestAnimationFrame(() => {
            secondFrame = window.requestAnimationFrame(() => {
                setIsDashboardSettling(false);
            });
        });
        return () => {
            window.cancelAnimationFrame(firstFrame);
            if (secondFrame) {
                window.cancelAnimationFrame(secondFrame);
            }
        };
    }, [dashboardBounds, isDashboardSettling, layout]);

    useEffect(() => {
        if (!rootId) {
            navigate('/');
        }
    }, [navigate, rootId]);

    useEffect(() => {
        setIsFiltersPaneOpen(getIsMobileViewport() ? false : getStoredBoolean(filtersPaneStorageKey, false));
    }, [filtersPaneStorageKey]);

    useEffect(() => {
        if (isMobile) {
            setIsFiltersPaneOpen(false);
        }
    }, [isMobile, rootId]);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.localStorage?.setItem !== 'function') return;
        window.localStorage.setItem(filtersPaneStorageKey, String(isFiltersPaneOpen));
    }, [filtersPaneStorageKey, isFiltersPaneOpen]);

    useEffect(() => {
        if (!rootId) {
            return;
        }
        resetToEmptyView();
        setIsHydrated(true);
    }, [resetToEmptyView, rootId]);

    const createWindowStateUpdater = useCallback((windowId) => (updates) => {
        setWindowStates((previous) => ({
            ...previous,
            [windowId]: {
                ...(previous[windowId] || getDefaultWindowState()),
                ...updates,
            },
        }));
    }, []);

    const handleSplit = useCallback((windowId, direction) => {
        const currentCount = countWindows(layout);
        if (currentCount >= MAX_WINDOWS) {
            notify.error(`Maximum of ${MAX_WINDOWS} analytics panels reached`);
            return;
        }

        const newWindowId = generateWindowId();
        setLayout((previous) => splitWindow(previous, windowId, direction, newWindowId, dashboardBounds || undefined));
        setWindowStates((previous) => ({
            ...previous,
            [newWindowId]: getDefaultWindowState(),
        }));
    }, [dashboardBounds, layout]);

    const handleCloseWindow = useCallback((windowId) => {
        const currentCount = countWindows(layout);
        if (currentCount <= 1) {
            return;
        }

        const nextLayout = removeWindow(layout, windowId);
        const nextWindowIds = getWindowIds(nextLayout);

        setLayout(nextLayout);
        setWindowStates((previous) => {
            const { [windowId]: _removed, ...rest } = previous;
            return rest;
        });

        if (!nextWindowIds.includes(selectedWindowId)) {
            setSelectedWindowId(nextWindowIds[0] || DEFAULT_SELECTED_WINDOW_ID);
        }
    }, [layout, selectedWindowId]);

    const handleWorkspaceMouseDown = useCallback((event) => {
        if (event.target === event.currentTarget) {
            setSelectedWindowId(null);
        }
    }, []);

    const sharedData = useMemo(() => ({
        sessions,
        goalAnalytics,
        activities,
        activityGroups,
        activityInstances,
        formatDuration,
        rootId,
    }), [sessions, goalAnalytics, activities, activityGroups, activityInstances, rootId]);

    const handleDateRangeChange = useCallback((nextRange) => {
        let normalized = {
            start: nextRange?.start || null,
            end: nextRange?.end || null,
        };
        if (normalized.start && normalized.end && normalized.start > normalized.end) {
            normalized = {
                start: normalized.end,
                end: normalized.start,
            };
        }
        setGlobalDateRange(normalized);
    }, []);

    const handleGlobalFiltersChange = useCallback((nextFilters) => {
        setGlobalFilters(normalizeGlobalFilters(nextFilters));
    }, []);

    const handleResetGlobalFilters = useCallback(() => {
        setGlobalFilters(getDefaultGlobalFilters());
    }, []);

    const handleSelectAnalyticsView = useCallback((viewId) => {
        if (!viewId) {
            resetToEmptyView();
            return;
        }

        const view = analyticsViews.find((item) => item.id === viewId);
        if (!view) {
            notify.error('Analytics view not found');
            return;
        }

        if (applyAnalyticsViewLayout(view.layout, { source: 'analytics-view' })) {
            setSelectedViewId(view.id);
            setCurrentViewName(view.name);
            setGlobalDateRange({ start: null, end: null });
        }
    }, [analyticsViews, applyAnalyticsViewLayout, resetToEmptyView]);

    const buildCurrentLayoutPayload = useCallback(() => createDashboardLayoutPayload({
        layout,
        windowStates,
        selectedWindowId,
        globalFilters,
        layoutBounds: dashboardBounds,
    }), [dashboardBounds, globalFilters, layout, selectedWindowId, windowStates]);

    const handleSaveView = useCallback(async () => {
        if (selectedViewId) {
            try {
                const saved = await updateAnalyticsView({
                    dashboardId: selectedViewId,
                    name: currentViewName,
                    layout: buildCurrentLayoutPayload(),
                });
                if (saved) {
                    setCurrentViewName(saved.name);
                    notify.success('Analytics view updated');
                }
            } catch {
                // handled by hook toast
            }
            return;
        }

        setIsSaveModalOpen(true);
    }, [buildCurrentLayoutPayload, currentViewName, selectedViewId, updateAnalyticsView]);

    const handleCreateView = useCallback(async (name) => {
        if (!name) {
            notify.error('Choose a name before saving');
            return;
        }

        try {
            const created = await createAnalyticsView({
                name,
                layout: buildCurrentLayoutPayload(),
            });
            if (created) {
                setSelectedViewId(created.id);
                setCurrentViewName(created.name);
                setIsSaveModalOpen(false);
                notify.success('Analytics view saved');
            }
        } catch {
            // handled by hook toast
        }
    }, [buildCurrentLayoutPayload, createAnalyticsView]);

    const handleDeleteView = useCallback(async (viewId) => {
        try {
            await deleteAnalyticsView(viewId);
            notify.success('Analytics view deleted');
            if (viewId === selectedViewId) {
                handleSelectAnalyticsView('');
            }
        } catch {
            // handled by hook toast
        }
    }, [deleteAnalyticsView, handleSelectAnalyticsView, selectedViewId]);

    const renderWindow = useCallback((windowId, layoutControls = {}) => {
        const windowCount = countWindows(layout);
        const canSplit = windowCount < MAX_WINDOWS;
        const canClose = windowCount > 1;

        return (
            <Suspense fallback={analyticsFallback}>
                <ProfileWindow
                    key={windowId}
                    windowId={windowId}
                    canSplit={canSplit}
                    onSplit={(direction) => handleSplit(windowId, direction)}
                    canClose={canClose}
                    onClose={() => handleCloseWindow(windowId)}
                    data={sharedData}
                    windowState={windowStates[windowId] || getDefaultWindowState()}
                    updateWindowState={createWindowStateUpdater(windowId)}
                    isSelected={selectedWindowId === windowId}
                    onSelect={() => {
                        if (selectedWindowId !== windowId) {
                            setSelectedWindowId(windowId);
                        }
                    }}
                    dragHandleProps={{
                        onMouseDown: layoutControls.onDragStart,
                        title: 'Drag to rearrange analytics panel',
                    }}
                    globalDateRange={globalDateRange}
                    onGlobalDateRangeChange={handleDateRangeChange}
                    globalFilters={globalFilters}
                />
            </Suspense>
        );
    }, [
        createWindowStateUpdater,
        globalDateRange,
        globalFilters,
        handleCloseWindow,
        handleDateRangeChange,
        handleSplit,
        layout,
        selectedWindowId,
        sharedData,
        windowStates,
    ]);

    if (loading && !isHydrated) {
        return (
            <div className="page-container" style={{ textAlign: 'center', color: '#666', padding: '40px' }}>
                Loading analytics...
            </div>
        );
    }

    return (
        <div className={styles.pageContainer}>
            <div className={styles.leftPanel}>
                <AnalyticsTopBar
                    currentViewName={currentViewName}
                    activeMode={activeMode}
                    onModeChange={setActiveMode}
                    onOpenViewsModal={() => setIsViewsModalOpen(true)}
                    onSaveView={handleSaveView}
                    isFiltersPaneOpen={isFiltersPaneOpen}
                    onToggleFiltersPane={() => setIsFiltersPaneOpen((current) => !current)}
                />

                {activeMode === 'query' ? (
                    <AnalyticsQueryConsole />
                ) : (
                    <div className={styles.workspace} onMouseDown={handleWorkspaceMouseDown}>
                        <div
                            className={`${styles.gridSurface} ${debugMode ? styles.gridSurfaceDebug : ''} ${isDashboardSettling ? styles.gridSurfaceSettling : ''}`}
                            onMouseDown={handleWorkspaceMouseDown}
                        >
                            <ProfileWindowLayout
                                layout={layout}
                                onLayoutChange={setLayout}
                                onBoundsChange={setDashboardBounds}
                                onBlankSpaceMouseDown={() => setSelectedWindowId(null)}
                                selectedWindowId={selectedWindowId}
                                transitionsEnabled={!isDashboardSettling}
                                renderWindow={renderWindow}
                            />
                        </div>
                    </div>
                )}
            </div>

            {activeMode === 'dashboard' && isFiltersPaneOpen && isMobile && (
                <ModalBackdrop
                    className={styles.sheetBackdrop}
                    onClose={() => setIsFiltersPaneOpen(false)}
                    aria-hidden="true"
                />
            )}
            {activeMode === 'dashboard' && isFiltersPaneOpen && (
                <div className={styles.rightPanel}>
                    <AnalyticsFiltersSidebar
                        filters={globalFilters}
                        dateRange={globalDateRange}
                        goals={goalAnalytics?.goals || []}
                        activities={activities}
                        activityGroups={activityGroups}
                        activityInstances={activityInstances}
                        selectedWindowState={selectedWindowId ? windowStates[selectedWindowId] || getDefaultWindowState() : getDefaultWindowState()}
                        onUpdateSelectedWindowState={selectedWindowId ? createWindowStateUpdater(selectedWindowId) : () => {}}
                        onChange={handleGlobalFiltersChange}
                        onDateRangeChange={handleDateRangeChange}
                        onReset={handleResetGlobalFilters}
                        onToggleCollapse={() => setIsFiltersPaneOpen(false)}
                        isMobile={isMobile}
                    />
                </div>
            )}

            {isViewsModalOpen && (
                <Suspense fallback={null}>
                    <AnalyticsViewsModal
                        views={analyticsViews}
                        selectedViewId={selectedViewId}
                        onSelectView={handleSelectAnalyticsView}
                        onDeleteView={handleDeleteView}
                        onClose={() => setIsViewsModalOpen(false)}
                    />
                </Suspense>
            )}

            {isSaveModalOpen && (
                <Suspense fallback={null}>
                    <AnalyticsViewNameModal
                        initialName=""
                        onConfirm={handleCreateView}
                        onClose={() => setIsSaveModalOpen(false)}
                    />
                </Suspense>
            )}
        </div>
    );
}

export default Analytics;
