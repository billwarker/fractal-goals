import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { formatDuration } from '../components/analytics/formatDuration';
import AnalyticsLoading from '../components/analytics/AnalyticsLoading';
import AnalyticsEvidenceNotice from '../components/analytics/AnalyticsEvidenceNotice';
import AnalyticsTopBar from '../components/analytics/AnalyticsTopBar';
import { getChartNumbers } from '../components/analytics/chartTitles';
import fitLayoutToBounds from '../components/analytics/fitLayoutToBounds';
import useAnalyticsDeepLink, { useAnalyticsEvidenceDemand } from '../components/analytics/useAnalyticsDeepLink';
import {
    createDashboardLayoutPayload,
    createAnalyticsViewPayload,
    getDefaultGlobalFilters,
    getDefaultWindowState,
    getConfiguredWindowIds,
    getConfiguredWindowCount,
    getHighestWindowIndex,
    sanitizeDashboardLayoutPayload,
    savedStateSignature,
} from '../components/analytics/dashboardState';
import ProfileWindowLayout, {
    countWindows,
    getWindowIds,
    removeWindow,
    splitWindow,
} from '../components/analytics/ProfileWindowLayout';
import { useAnalyticsPageData } from '../hooks/useAnalyticsPageData';
import { useAnalyticsViews } from '../hooks/useDashboardQueries';
import { FEATURE_FLAGS, isFeatureEnabled, useFeatureFlags } from '../hooks/useFeatureFlags';
import { useDebug } from '../contexts/DebugContext';
import '../App.css';
import notify from '../utils/notify';
import useIsMobile from '../hooks/useIsMobile';
import usePersistedPaneOpen from '../hooks/usePersistedPaneOpen';
import BodyPortal from '../components/layout/BodyPortal';
import MobilePageFooter from '../components/layout/MobilePageFooter';
import ResponsiveSidePane from '../components/layout/ResponsiveSidePane';
import AnalyticsOnboardingState from '../components/onboarding/AnalyticsOnboardingState';
import useAnalyticsGlobalScope from '../components/analytics/useAnalyticsGlobalScope';
import styles from './Analytics.module.css';
const AnalyticsFiltersSidebar = lazy(() => import('../components/analytics/AnalyticsFiltersSidebar'));
const AnalyticsQueryConsole = lazy(() => import('../components/analytics/AnalyticsQueryConsole'));
const AnalyticsViewNameModal = lazy(() => import('../components/analytics/AnalyticsViewNameModal'));
const AnalyticsViewsModal = lazy(() => import('../components/analytics/AnalyticsViewsModal'));
const ProfileWindow = lazy(() => import('../components/analytics/ProfileWindow'));
const MAX_WINDOWS = 4;
const DEFAULT_LAYOUT = { type: 'grid', panels: [{ id: 'window-1', x: 0, y: 0, w: 96, h: 48 }] };
const DEFAULT_WINDOW_STATES = { 'window-1': getDefaultWindowState() };
const EMPTY_SIGNATURE = savedStateSignature({ layout: DEFAULT_LAYOUT, windowStates: DEFAULT_WINDOW_STATES, globalFilters: getDefaultGlobalFilters() });
const EMPTY_VIEW_NAME = 'Empty Analytics View';
let windowIdCounter = 1;
const generateWindowId = () => `window-${++windowIdCounter}`;

function Analytics() {
    const { rootId } = useParams();
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const { debugMode } = useDebug();
    const { flags } = useFeatureFlags();
    const showSqlExplorer = isFeatureEnabled(flags, FEATURE_FLAGS.analyticsSqlExplorer);
    const {
        analyticsViews,
        createAnalyticsView,
        updateAnalyticsView,
        deleteAnalyticsView,
    } = useAnalyticsViews(rootId);

    const [layout, setLayout] = useState(DEFAULT_LAYOUT);
    const [selectedWindowId, setSelectedWindowId] = useState('window-1');
    const [windowStates, setWindowStates] = useState(DEFAULT_WINDOW_STATES);
    const [selectedViewId, setSelectedViewId] = useState('');
    const [currentViewName, setCurrentViewName] = useState(EMPTY_VIEW_NAME);
    // What was last loaded or saved, to offer Save only once something differs.
    const [savedSignature, setSavedSignature] = useState(EMPTY_SIGNATURE);
    const {
        globalDateRange, setGlobalDateRange, globalFilters, setGlobalFilters,
        handleDateRangeChange, handleGlobalFiltersChange, handleResetGlobalFilters,
    } = useAnalyticsGlobalScope();
    const [isFiltersPaneOpen, setIsFiltersPaneOpen] = usePersistedPaneOpen(
        `analytics-filter-pane-open:${rootId || 'default'}`,
        { defaultOpen: false, isMobile, resetKey: rootId },
    );
    const [isHydrated, setIsHydrated] = useState(false);
    const [isViewsModalOpen, setIsViewsModalOpen] = useState(false);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [saveKind, setSaveKind] = useState('view');
    const [activeMode, setActiveMode] = useState('dashboard');
    const {
        activities,
        activityGroups,
        activityInstances,
        goalAnalytics,
        loading,
        sessions,
        hasMoreEvidence, loadMoreEvidence,
        evidenceLoading, evidenceError, retryEvidence,
    } = useAnalyticsPageData(rootId, {
        needsSessionEvidence: useAnalyticsEvidenceDemand(windowStates),
    });
    const [consoleInitialSql, setConsoleInitialSql] = useState('');
    const [dashboardBounds, setDashboardBounds] = useState(null);
    const [isDashboardSettling, setIsDashboardSettling] = useState(false);

    const resetToEmptyView = useCallback(() => {
        windowIdCounter = 1;
        setLayout(DEFAULT_LAYOUT);
        setWindowStates(DEFAULT_WINDOW_STATES);
        setSelectedWindowId('window-1');
        setSelectedViewId('');
        setCurrentViewName(EMPTY_VIEW_NAME);
        setSavedSignature(EMPTY_SIGNATURE);
        setGlobalDateRange({ start: null, end: null });
        setGlobalFilters(getDefaultGlobalFilters());
    }, [setGlobalDateRange, setGlobalFilters]);

    const fitLayoutToCurrentBounds = useCallback((incomingLayout, savedBounds = null) => (
        fitLayoutToBounds(incomingLayout, { savedBounds, bounds: dashboardBounds, isFiltersPaneOpen })
    ), [dashboardBounds, isFiltersPaneOpen]);

    const applyAnalyticsViewLayout = useCallback((payload, { source = 'analytics-view' } = {}) => {
        const sanitized = sanitizeDashboardLayoutPayload(payload);
        if (!sanitized) {
            notify.error(source === 'analytics-view'
                ? 'Saved analytics item is no longer compatible'
                : 'Analytics draft could not be restored');
            return false;
        }

        windowIdCounter = getHighestWindowIndex(sanitized.layout);
        const fittedLayout = fitLayoutToCurrentBounds(sanitized.layout, sanitized.layoutBounds);
        const loadedFilters = sanitized.globalFilters || getDefaultGlobalFilters();
        setIsDashboardSettling(true);
        setLayout(fittedLayout);
        setWindowStates(sanitized.windowStates);
        setSelectedWindowId(sanitized.selectedWindowId);
        setGlobalFilters(loadedFilters);
        setSavedSignature(savedStateSignature({ layout: fittedLayout, windowStates: sanitized.windowStates, globalFilters: loadedFilters }));
        return true;
    }, [fitLayoutToCurrentBounds, setGlobalFilters]);

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
        if (!rootId) {
            return;
        }
        resetToEmptyView();
        setIsHydrated(true);
    }, [resetToEmptyView, rootId]);

    const applyDeepLink = useCallback(({ windowState, globalFilters: linkFilters }) => {
        setWindowStates({ ['window-1']: windowState });
        setSelectedWindowId('window-1');
        setGlobalFilters(linkFilters);
    }, [setGlobalFilters]);
    useAnalyticsDeepLink({ isHydrated, activities, onApply: applyDeepLink });

    useEffect(() => {
        if (!showSqlExplorer && activeMode === 'query') {
            setActiveMode('dashboard');
            setConsoleInitialSql('');
        }
    }, [activeMode, showSqlExplorer]);

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
            setSelectedWindowId(nextWindowIds[0] || 'window-1');
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
        rootId, evidenceLoading, evidenceError, retryEvidence, hasMoreEvidence, loadMoreEvidence,
    }), [sessions, goalAnalytics, activities, activityGroups, activityInstances, rootId, evidenceLoading, evidenceError, retryEvidence, hasMoreEvidence, loadMoreEvidence]);

    const handleSelectAnalyticsView = useCallback((viewId) => {
        if (!viewId) {
            resetToEmptyView();
            return;
        }

        const view = analyticsViews.find((item) => item.id === viewId);
        if (!view) {
            notify.error('Saved analytics item not found');
            return;
        }

        if (applyAnalyticsViewLayout(view.layout, { source: 'analytics-view' })) {
            setSelectedViewId(view.id);
            setCurrentViewName(view.name);
            setGlobalDateRange({ start: null, end: null });
        }
    }, [analyticsViews, applyAnalyticsViewLayout, resetToEmptyView, setGlobalDateRange]);

    const currentSignature = useMemo(
        () => savedStateSignature({ layout, windowStates, globalFilters }),
        [globalFilters, layout, windowStates],
    );
    const hasUnsavedChanges = currentSignature !== savedSignature;

    const buildCurrentLayoutPayload = useCallback(() => createDashboardLayoutPayload({
        layout,
        windowStates,
        selectedWindowId,
        globalFilters,
        layoutBounds: dashboardBounds,
    }), [dashboardBounds, globalFilters, layout, selectedWindowId, windowStates]);

    const getCurrentSavedObjectKind = useCallback(() => (
        getConfiguredWindowCount(layout, windowStates) > 1 ? 'dashboard' : 'view'
    ), [layout, windowStates]);

    const buildCurrentSavedObjectPayload = useCallback((kind) => {
        if (kind === 'view') {
            const configuredIds = getConfiguredWindowIds(layout, windowStates);
            const windowId = configuredIds[0] || selectedWindowId || Object.keys(windowStates)[0] || 'window-1';
            return createAnalyticsViewPayload({
                windowState: windowStates[windowId] || getDefaultWindowState(),
                globalFilters,
            });
        }
        return buildCurrentLayoutPayload();
    }, [buildCurrentLayoutPayload, globalFilters, layout, selectedWindowId, windowStates]);

    const handleSaveView = useCallback(async () => {
        const nextKind = getCurrentSavedObjectKind();
        const selectedSavedObject = selectedViewId
            ? analyticsViews.find((item) => item.id === selectedViewId)
            : null;
        if (selectedViewId && (selectedSavedObject?.kind || 'dashboard') === nextKind) {
            try {
                const saved = await updateAnalyticsView({
                    dashboardId: selectedViewId,
                    name: currentViewName,
                    kind: nextKind,
                    layout: buildCurrentSavedObjectPayload(nextKind),
                });
                if (saved) {
                    setCurrentViewName(saved.name);
                    setSavedSignature(currentSignature);
                    notify.success(nextKind === 'view' ? 'Analytics view updated' : 'Analytics dashboard updated');
                }
            } catch {
                // handled by hook toast
            }
            return;
        }

        setSaveKind(nextKind);
        setIsSaveModalOpen(true);
    }, [
        analyticsViews,
        buildCurrentSavedObjectPayload,
        currentSignature,
        currentViewName,
        getCurrentSavedObjectKind,
        selectedViewId,
        updateAnalyticsView,
    ]);

    const handleCreateView = useCallback(async (name) => {
        if (!name) {
            notify.error('Choose a name before saving');
            return;
        }

        try {
            const kind = saveKind || getCurrentSavedObjectKind();
            const created = await createAnalyticsView({
                name,
                kind,
                layout: buildCurrentSavedObjectPayload(kind),
            });
            if (created) {
                setSelectedViewId(created.id);
                setCurrentViewName(created.name);
                setSavedSignature(currentSignature);
                setIsSaveModalOpen(false);
                notify.success(kind === 'view' ? 'Analytics view saved' : 'Analytics dashboard saved');
            }
        } catch {
            // handled by hook toast
        }
    }, [buildCurrentSavedObjectPayload, createAnalyticsView, currentSignature, getCurrentSavedObjectKind, saveKind]);

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

    const handleOpenQueryConsole = useCallback((sql) => {
        if (!showSqlExplorer) return;
        setConsoleInitialSql(sql || '');
        setActiveMode('query');
    }, [showSqlExplorer]);

    const chartNumbers = useMemo(() => getChartNumbers(windowStates), [windowStates]);
    // The bucket grain each panel's chart drew, which can be coarser than the one asked for.
    const [shownGrains, setShownGrains] = useState({});
    const reportShownGrain = useCallback((windowId, grain) => {
        setShownGrains((current) => (current[windowId] === grain ? current : { ...current, [windowId]: grain }));
    }, []);

    // A new goal can show this view itself, rather than a copy of it.
    const reusableViewId = !hasUnsavedChanges && analyticsViews.some((view) => view.id === selectedViewId && view.kind === 'view') ? selectedViewId : null;
    const renderWindow = useCallback((windowId, layoutControls = {}) => {
        const windowCount = countWindows(layout);
        const canSplit = windowCount < MAX_WINDOWS;
        const canClose = windowCount > 1;

        return (
            <Suspense fallback={<AnalyticsLoading />}>
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
                    reusableViewId={reusableViewId}
                    onResetFilters={handleResetGlobalFilters}
                    onOpenQueryConsole={handleOpenQueryConsole}
                    showQueryInspector={showSqlExplorer}
                    chartNumber={chartNumbers[windowId]}
                    onShownGrainChange={reportShownGrain}
                    onPageGrid
                />
            </Suspense>
        );
    }, [
        chartNumbers,
        createWindowStateUpdater,
        reportShownGrain,
        globalDateRange,
        globalFilters,
        handleCloseWindow,
        handleDateRangeChange,
        handleOpenQueryConsole,
        handleResetGlobalFilters,
        handleSplit,
        layout,
        reusableViewId,
        selectedWindowId,
        sharedData,
        showSqlExplorer,
        windowStates,
    ]);

    const filtersPane = (
        <ResponsiveSidePane
            open={activeMode === 'dashboard' && isFiltersPaneOpen}
            isMobile={isMobile}
            onClose={() => setIsFiltersPaneOpen(false)}
            panelClassName={styles.rightPanel}
            backdropClassName={styles.sheetBackdrop}
        >
            <Suspense fallback={<AnalyticsLoading />}><AnalyticsFiltersSidebar
                rootId={rootId} sessions={sessions} windowStates={windowStates} shownGrains={shownGrains}
                selectedWindowId={selectedWindowId} onSelectWindow={setSelectedWindowId}
                onUpdateWindowState={(id, updates) => createWindowStateUpdater(id)(updates)}
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
            /></Suspense>
        </ResponsiveSidePane>
    );

    if (loading && !isHydrated) {
        return (
            <AnalyticsLoading />
        );
    }

    return (
        <div className={styles.pageContainer}>
            <div className={`${styles.leftPanel} ${isMobile && activeMode === 'dashboard' ? styles.leftPanelWithMobileFooter : ''}`}>
                <AnalyticsTopBar
                    currentViewName={currentViewName}
                    activeMode={activeMode}
                    onModeChange={setActiveMode}
                    onOpenViewsModal={() => setIsViewsModalOpen(true)}
                    onSaveView={handleSaveView}
                    onCloseView={resetToEmptyView}
                    isSavedItemOpen={Boolean(selectedViewId)}
                    hasUnsavedChanges={hasUnsavedChanges}
                    rootId={rootId}
                    savedView={analyticsViews.find((view) => view.id === selectedViewId && view.kind === 'view') || null}
                    isFiltersPaneOpen={isFiltersPaneOpen}
                    onToggleFiltersPane={() => setIsFiltersPaneOpen((current) => !current)}
                    showQueryConsole={showSqlExplorer}
                    showFiltersToggle={!isMobile}
                />

                <AnalyticsOnboardingState rootId={rootId} />
                <AnalyticsEvidenceNotice {...{ hasMoreEvidence, evidenceError, loadMoreEvidence }} />

                {activeMode === 'query' && showSqlExplorer ? (
                    <Suspense fallback={<AnalyticsLoading />}><AnalyticsQueryConsole rootId={rootId} initialSql={consoleInitialSql} /></Suspense>
                ) : (
                    <div className={styles.workspace} onMouseDown={handleWorkspaceMouseDown} data-page-grid>
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

            {isMobile && activeMode === 'dashboard' ? (
                <MobilePageFooter
                    ariaLabel="Analytics sidebar controls"
                    label={isFiltersPaneOpen ? 'Hide Sidebar' : 'Show Sidebar'}
                    expanded={isFiltersPaneOpen}
                    onToggle={() => setIsFiltersPaneOpen((current) => !current)}
                />
            ) : null}

            {filtersPane}

            <BodyPortal when={isViewsModalOpen}>
                <Suspense fallback={null}>
                    <AnalyticsViewsModal
                        views={analyticsViews}
                        selectedViewId={selectedViewId}
                        onSelectView={handleSelectAnalyticsView}
                        onDeleteView={handleDeleteView}
                        onClose={() => setIsViewsModalOpen(false)}
                    />
                </Suspense>
            </BodyPortal>

            <BodyPortal when={isSaveModalOpen}>
                <Suspense fallback={null}>
                    <AnalyticsViewNameModal
                        initialName=""
                        kind={saveKind}
                        onConfirm={handleCreateView}
                        onClose={() => setIsSaveModalOpen(false)}
                    />
                </Suspense>
            </BodyPortal>
        </div>
    );
}

export default Analytics;
