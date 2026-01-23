import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import { useActivities } from '../contexts/ActivitiesContext';
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
    const { activities, fetchActivities, loading: activitiesLoading } = useActivities();

    const [loading, setLoading] = useState(true);
    const [sessions, setSessions] = useState([]);
    const [goalAnalytics, setGoalAnalytics] = useState(null);
    const [activityInstances, setActivityInstances] = useState({});

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
            return;
        }

        let isMounted = true;

        const loadData = async () => {
            try {
                // Load sessions with higher limit for analytics (we need more data for charts)
                const [sessionsRes, goalAnalyticsRes] = await Promise.all([
                    fractalApi.getSessions(rootId, { limit: 50 }),
                    fractalApi.getGoalAnalytics(rootId)
                ]);
                await fetchActivities(rootId);

                if (!isMounted) return;

                // Handle paginated response format
                const sessionsData = sessionsRes.data.sessions || sessionsRes.data;
                setSessions(sessionsData);
                setGoalAnalytics(goalAnalyticsRes.data);

                // Build activity instances map from sessions
                const instancesMap = {};
                sessionsData.forEach(session => {
                    const sessionData = session.attributes?.session_data;
                    if (sessionData?.sections) {
                        sessionData.sections.forEach(section => {
                            if (section.exercises) {
                                section.exercises.forEach(exercise => {
                                    if (exercise.type === 'activity' && exercise.activity_id) {
                                        if (!instancesMap[exercise.activity_id]) {
                                            instancesMap[exercise.activity_id] = [];
                                        }
                                        const sessionStart = session.session_start || session.attributes?.session_data?.session_start || session.attributes?.created_at;
                                        instancesMap[exercise.activity_id].push({
                                            ...exercise,
                                            session_id: session.id,
                                            session_name: session.name,
                                            session_date: sessionStart
                                        });
                                    }
                                });
                            }
                        });
                    }
                });

                setActivityInstances(instancesMap);
                setLoading(false);
            } catch (err) {
                console.error("Failed to fetch analytics data", err);
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        loadData();

        return () => {
            isMounted = false;
        };
    }, [rootId, navigate, fetchActivities]);

    // Handle split - splits a window in the given direction
    const handleSplit = useCallback((windowId, direction) => {
        const currentCount = countWindows(layout);
        if (currentCount >= MAX_WINDOWS) {
            alert(`Maximum of ${MAX_WINDOWS} profile windows reached`);
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
            const { [windowId]: removed, ...rest } = prev;
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
    const sharedData = {
        sessions,
        goalAnalytics,
        activities,
        activityInstances,
        formatDuration,
        rootId
    };

    // Render a single profile window
    const renderWindow = useCallback((windowId, path) => {
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

    if (loading || activitiesLoading) {
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
