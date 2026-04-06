import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import AnalyticsTopBar from '../components/analytics/AnalyticsTopBar';
import AnalyticsViewNameModal from '../components/analytics/AnalyticsViewNameModal';
import AnalyticsViewsModal from '../components/analytics/AnalyticsViewsModal';
import '../components/analytics/ChartJSWrapper';
import {
    createDashboardLayoutPayload,
    getDefaultWindowState,
    getHighestWindowIndex,
    sanitizeDashboardLayoutPayload,
} from '../components/analytics/dashboardState';
import ProfileWindow from '../components/analytics/ProfileWindow';
import ProfileWindowLayout, {
    countWindows,
    getWindowIds,
    removeWindow,
    splitWindow,
} from '../components/analytics/ProfileWindowLayout';
import { useAnalyticsPageData } from '../hooks/useAnalyticsPageData';
import { useAnalyticsViews } from '../hooks/useDashboardQueries';
import '../App.css';
import notify from '../utils/notify';

const MAX_WINDOWS = 4;
const DEFAULT_LAYOUT = { type: 'window', id: 'window-1' };
const DEFAULT_SELECTED_WINDOW_ID = 'window-1';
const DEFAULT_WINDOW_STATES = {
    'window-1': getDefaultWindowState(),
};
const EMPTY_VIEW_NAME = 'Empty View';

const formatDuration = (seconds) => {
    if (!seconds || seconds === 0) return '0m';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
};

let windowIdCounter = 1;
const generateWindowId = () => `window-${++windowIdCounter}`;

function Analytics() {
    const { rootId } = useParams();
    const navigate = useNavigate();
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
    const [isHydrated, setIsHydrated] = useState(false);
    const [isViewsModalOpen, setIsViewsModalOpen] = useState(false);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

    const resetToEmptyView = useCallback(() => {
        windowIdCounter = 1;
        setLayout(DEFAULT_LAYOUT);
        setWindowStates(DEFAULT_WINDOW_STATES);
        setSelectedWindowId(DEFAULT_SELECTED_WINDOW_ID);
        setSelectedViewId('');
        setCurrentViewName(EMPTY_VIEW_NAME);
        setGlobalDateRange({ start: null, end: null });
    }, []);

    const applyAnalyticsViewLayout = useCallback((payload, { source = 'analytics-view' } = {}) => {
        const sanitized = sanitizeDashboardLayoutPayload(payload);
        if (!sanitized) {
            notify.error(source === 'analytics-view'
                ? 'Saved analytics view is no longer compatible'
                : 'Analytics draft could not be restored');
            return false;
        }

        windowIdCounter = getHighestWindowIndex(sanitized.layout);
        setLayout(sanitized.layout);
        setWindowStates(sanitized.windowStates);
        setSelectedWindowId(sanitized.selectedWindowId);
        return true;
    }, []);

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
        setLayout((previous) => splitWindow(previous, windowId, direction, newWindowId));
        setWindowStates((previous) => ({
            ...previous,
            [newWindowId]: getDefaultWindowState(),
        }));
    }, [layout]);

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
    }), [layout, selectedWindowId, windowStates]);

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

    const renderWindow = useCallback((windowId) => {
        const windowCount = countWindows(layout);
        const canSplit = windowCount < MAX_WINDOWS;
        const canClose = windowCount > 1;

        return (
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
                onSelect={() => setSelectedWindowId(windowId)}
                globalDateRange={globalDateRange}
                onGlobalDateRangeChange={handleDateRangeChange}
            />
        );
    }, [
        createWindowStateUpdater,
        globalDateRange,
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
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                width: '100%',
                overflow: 'hidden',
                position: 'relative',
            }}
        >
            <AnalyticsTopBar
                currentViewName={currentViewName}
                onOpenViewsModal={() => setIsViewsModalOpen(true)}
                onSaveView={handleSaveView}
                dateRange={globalDateRange}
                onDateRangeChange={handleDateRangeChange}
            />

            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    padding: '20px',
                    overflow: 'hidden',
                    position: 'relative',
                }}
            >
                <ProfileWindowLayout
                    layout={layout}
                    onLayoutChange={setLayout}
                    renderWindow={renderWindow}
                />
            </div>

            {isViewsModalOpen && (
                <AnalyticsViewsModal
                    views={analyticsViews}
                    selectedViewId={selectedViewId}
                    onSelectView={handleSelectAnalyticsView}
                    onDeleteView={handleDeleteView}
                    onClose={() => setIsViewsModalOpen(false)}
                />
            )}

            {isSaveModalOpen && (
                <AnalyticsViewNameModal
                    initialName=""
                    onConfirm={handleCreateView}
                    onClose={() => setIsSaveModalOpen(false)}
                />
            )}
        </div>
    );
}

export default Analytics;
