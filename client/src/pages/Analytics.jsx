import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAnalyticsPageData } from '../hooks/useAnalyticsPageData';
import ProfileWindow from '../components/analytics/ProfileWindow';
import ProfileWindowLayout, {
    countWindows,
    getWindowIds,
    splitWindow,
    removeWindow,
    setSplitPositionForWindow
} from '../components/analytics/ProfileWindowLayout';
import '../components/analytics/ChartJSWrapper'; // Registers Chart.js components
import '../App.css';
import notify from '../utils/notify';

// Helper function to format duration
const formatDuration = (seconds) => {
    if (!seconds || seconds === 0) return '0m';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
};

// Default state for a new profile window
const getDefaultWindowState = () => ({
    selectedCategory: null,
    selectedVisualization: null,
    selectedActivity: null,
    selectedMetric: null,
    selectedMetricY2: null,
    setsHandling: 'top',
    selectedSplit: 'all',
    selectedGoal: null,
    selectedGoalChart: 'duration',
    heatmapMonths: 12
});

// Generate new window ID
let windowIdCounter = 1;
const generateWindowId = () => `window-${++windowIdCounter}`;

/**
 * Analytics Page - Redesigned with Profile Windows
 * 
 * Features:
 * - Up to 4 profile windows with vertical/horizontal splits
 * - Each window can independently select category (goals, sessions, activities)
 * - Each window can independently select visualization type
 * - Resizable dividers between windows
 * - Nested splits supported (split vertically then horizontally, or vice versa)
 */
function Analytics() {
    const { rootId } = useParams();
    const navigate = useNavigate();
    const {
        activities,
        activityInstances,
        goalAnalytics,
        loading,
        sessions,
    } = useAnalyticsPageData(rootId);

    // Shared state for annotation highlighting across windows
    const [highlightedAnnotationId, setHighlightedAnnotationId] = useState(null);

    // Layout tree structure - supports nested splits
    // { type: 'window', id: 'window-1' } for single window
    // { type: 'split', direction: 'vertical'|'horizontal', position: 50, first: {...}, second: {...} } for splits
    const [layout, setLayout] = useState({ type: 'window', id: 'window-1' });

    // Track which window is selected for annotations
    // When multiple visualizations exist, clicking a window selects it for annotation targeting
    const [selectedWindowId, setSelectedWindowId] = useState('window-1');

    // Window state - each window has its own state object
    const [windowStates, setWindowStates] = useState({
        'window-1': getDefaultWindowState()
    });

    // Max 4 profile windows
    const MAX_WINDOWS = 4;

    // Create a state updater function for a specific window
    const createWindowStateUpdater = (windowId) => (updates) => {
        setWindowStates(prev => ({
            ...prev,
            [windowId]: {
                ...prev[windowId],
                ...updates
            }
        }));
    };

    useEffect(() => {
        if (!rootId) {
            navigate('/');
        }
    }, [rootId, navigate]);

    // Handle split - splits a window in the given direction
    const handleSplit = useCallback((windowId, direction) => {
        const currentCount = countWindows(layout);
        if (currentCount >= MAX_WINDOWS) {
            notify.error(`Maximum of ${MAX_WINDOWS} profile windows reached`);
            return;
        }

        const newWindowId = generateWindowId();

        // Update layout tree
        setLayout(prev => splitWindow(prev, windowId, direction, newWindowId));

        // Initialize new window state
        setWindowStates(prev => ({
            ...prev,
            [newWindowId]: getDefaultWindowState()
        }));
    }, [layout]);

    // Handle close window
    const handleCloseWindow = useCallback((windowId) => {
        const currentCount = countWindows(layout);
        if (currentCount <= 1) return; // Can't close last window

        // Update layout tree
        setLayout(prev => removeWindow(prev, windowId));

        // Clean up window state
        setWindowStates(prev => {
            const { [windowId]: _removed, ...rest } = prev;
            return rest;
        });
    }, [layout]);

    // Handle annotations click - makes the clicked window the annotations view and shrinks it
    const handleAnnotationsClick = useCallback((windowId) => {
        // Update the window state to show annotations
        setWindowStates(prev => ({
            ...prev,
            [windowId]: {
                ...prev[windowId],
                selectedCategory: 'annotations'
            }
        }));

        // Shrink the annotations window to 25%
        setLayout(prev => setSplitPositionForWindow(prev, windowId, 25, true));
    }, []);

    // Shared data for all windows
    const sharedData = useMemo(() => ({
        sessions,
        goalAnalytics,
        activities,
        activityInstances,
        formatDuration,
        rootId
    }), [sessions, goalAnalytics, activities, activityInstances, rootId]);

    // Render a single profile window
    const renderWindow = useCallback((windowId) => {
        const windowCount = countWindows(layout);
        const windowIds = getWindowIds(layout);
        const canSplit = windowCount < MAX_WINDOWS;
        const canClose = windowCount > 1;

        // Check if any window has annotations open
        const hasAnnotationsWindow = windowIds.some(id =>
            windowStates[id]?.selectedCategory === 'annotations'
        );

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
                onAnnotationsClick={() => handleAnnotationsClick(windowId)}
                // For annotations: use the selected window's state as the source
                // This ensures the annotations panel shows data from the selected visualization
                isSelected={selectedWindowId === windowId}
                onSelect={() => setSelectedWindowId(windowId)}
                hasAnnotationsWindow={hasAnnotationsWindow}
                sourceWindowState={windowStates[selectedWindowId] || getDefaultWindowState()}
                updateSourceWindowState={createWindowStateUpdater(selectedWindowId)}
                highlightedAnnotationId={highlightedAnnotationId}
                setHighlightedAnnotationId={setHighlightedAnnotationId}
            />
        );
    }, [layout, windowStates, sharedData, handleSplit, handleCloseWindow, handleAnnotationsClick, highlightedAnnotationId, selectedWindowId]);

    if (loading) {
        return (
            <div className="page-container" style={{ textAlign: 'center', color: '#666', padding: '40px' }}>
                Loading analytics...
            </div>
        );
    }

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            width: '100%',
            overflow: 'hidden',
            position: 'relative'
        }}>
            {/* Content Area with Profile Windows */}
            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    padding: '80px 20px 20px 20px', // Top padding for nav bar
                    overflow: 'hidden',
                    position: 'relative'
                }}
            >
                <ProfileWindowLayout
                    layout={layout}
                    onLayoutChange={setLayout}
                    renderWindow={renderWindow}
                />
            </div>
        </div>
    );
}

export default Analytics;
