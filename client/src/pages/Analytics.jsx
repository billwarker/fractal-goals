import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import { useActivities } from '../contexts/ActivitiesContext';
import ProfileWindow from '../components/analytics/ProfileWindow';
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

/**
 * Analytics Page - Redesigned with Profile Windows
 * 
 * Features:
 * - One or two profile windows for viewing different visualizations side by side
 * - Each window can independently select category (goals, sessions, activities)
 * - Each window can independently select visualization type
 * - Resizable divider between windows when split
 * - Maximum 2 windows at a time
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

    // Window state - each window has its own state object stored here
    // This ensures closing one window doesn't affect the other's state
    const [windowStates, setWindowStates] = useState({
        'window-1': {
            selectedCategory: null,
            selectedVisualization: null,
            selectedActivity: null,
            selectedMetric: null,
            selectedMetricY2: null,
            setsHandling: 'top',
            selectedSplit: 'all',
            selectedGoal: null,
            selectedGoalChart: 'duration',
            heatmapMonths: 12 // Time range for activity heatmap
        },
        'window-2': {
            selectedCategory: null,
            selectedVisualization: null,
            selectedActivity: null,
            selectedMetric: null,
            selectedMetricY2: null,
            setsHandling: 'top',
            selectedSplit: 'all',
            selectedGoal: null,
            selectedGoalChart: 'duration',
            heatmapMonths: 12 // Time range for activity heatmap
        }
    });

    // Track which windows are visible
    const [visibleWindows, setVisibleWindows] = useState(['window-1']);

    // Resizer state
    const [splitPosition, setSplitPosition] = useState(50); // Percentage for first window
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef(null);

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

    // Handle split window
    const handleSplit = () => {
        if (visibleWindows.length < 2) {
            setVisibleWindows([...visibleWindows, 'window-2']);
            setSplitPosition(50);
        }
    };

    // Handle close window
    const handleCloseWindow = (windowId) => {
        if (visibleWindows.length > 1) {
            setVisibleWindows(visibleWindows.filter(id => id !== windowId));
            setSplitPosition(50);
        }
    };

    // Drag handlers for resizer
    const handleMouseDown = useCallback((e) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleMouseMove = useCallback((e) => {
        if (!isDragging || !containerRef.current) return;

        const container = containerRef.current;
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = (x / rect.width) * 100;

        // Clamp between 20% and 80%
        const clampedPercentage = Math.min(80, Math.max(20, percentage));
        setSplitPosition(clampedPercentage);
    }, [isDragging]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging, handleMouseMove, handleMouseUp]);

    // Handle annotations click - forces split view and sets right window to annotations
    const handleAnnotationsClick = () => {
        // Ensure we have two windows
        if (visibleWindows.length === 1) {
            setVisibleWindows(['window-1', 'window-2']);
            setSplitPosition(50);
        }

        // Set window-2 (the right window) to annotations
        setWindowStates(prev => ({
            ...prev,
            ['window-2']: {
                ...prev['window-2'],
                selectedCategory: 'annotations'
            }
        }));
    };

    // Shared data for all windows
    const sharedData = {
        sessions,
        goalAnalytics,
        activities,
        activityInstances,
        formatDuration,
        rootId
    };

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
                ref={containerRef}
                style={{
                    flex: 1,
                    display: 'flex',
                    padding: '80px 20px 20px 20px', // Top padding for nav bar
                    gap: visibleWindows.length > 1 ? '0' : '0',
                    overflow: 'hidden',
                    position: 'relative',
                    cursor: isDragging ? 'col-resize' : 'default'
                }}
            >
                {visibleWindows.length === 1 ? (
                    // Single window
                    <ProfileWindow
                        key={visibleWindows[0]}
                        windowId={visibleWindows[0]}
                        canSplit={true}
                        onSplit={handleSplit}
                        canClose={false}
                        data={sharedData}
                        windowState={windowStates[visibleWindows[0]]}
                        updateWindowState={createWindowStateUpdater(visibleWindows[0])}
                        onAnnotationsClick={handleAnnotationsClick}
                        sourceWindowState={windowStates['window-2']} // In single mode, this might be stale but that's fine
                        highlightedAnnotationId={highlightedAnnotationId}
                        setHighlightedAnnotationId={setHighlightedAnnotationId}
                    />
                ) : (
                    // Two windows with resizer
                    <>
                        <div style={{
                            width: `calc(${splitPosition}% - 4px)`,
                            minWidth: 0,
                            display: 'flex'
                        }}>
                            <ProfileWindow
                                key={visibleWindows[0]}
                                windowId={visibleWindows[0]}
                                canSplit={false}
                                canClose={true}
                                onClose={() => handleCloseWindow(visibleWindows[0])}
                                data={sharedData}
                                windowState={windowStates[visibleWindows[0]]}
                                updateWindowState={createWindowStateUpdater(visibleWindows[0])}
                                onAnnotationsClick={handleAnnotationsClick}
                                sourceWindowState={windowStates[visibleWindows[1]]}
                                updateSourceWindowState={createWindowStateUpdater(visibleWindows[1])}
                                highlightedAnnotationId={highlightedAnnotationId}
                                setHighlightedAnnotationId={setHighlightedAnnotationId}
                            />
                        </div>

                        {/* Resizer */}
                        <div
                            onMouseDown={handleMouseDown}
                            style={{
                                width: '8px',
                                cursor: 'col-resize',
                                background: isDragging ? '#2196f3' : 'transparent',
                                transition: isDragging ? 'none' : 'background 0.2s ease',
                                position: 'relative',
                                zIndex: 5,
                                flexShrink: 0
                            }}
                            onMouseEnter={(e) => {
                                if (!isDragging) {
                                    e.target.style.background = '#444';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isDragging) {
                                    e.target.style.background = 'transparent';
                                }
                            }}
                        >
                            {/* Visual handle */}
                            <div style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                width: '4px',
                                height: '40px',
                                background: '#555',
                                borderRadius: '2px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '3px'
                            }}>
                                <div style={{ width: '2px', height: '2px', background: '#888', borderRadius: '1px' }} />
                                <div style={{ width: '2px', height: '2px', background: '#888', borderRadius: '1px' }} />
                                <div style={{ width: '2px', height: '2px', background: '#888', borderRadius: '1px' }} />
                            </div>
                        </div>

                        <div style={{
                            width: `calc(${100 - splitPosition}% - 4px)`,
                            minWidth: 0,
                            display: 'flex'
                        }}>
                            <ProfileWindow
                                key={visibleWindows[1]}
                                windowId={visibleWindows[1]}
                                canSplit={false}
                                canClose={true}
                                onClose={() => handleCloseWindow(visibleWindows[1])}
                                data={sharedData}
                                windowState={windowStates[visibleWindows[1]]}
                                updateWindowState={createWindowStateUpdater(visibleWindows[1])}
                                onAnnotationsClick={handleAnnotationsClick}
                                sourceWindowState={windowStates[visibleWindows[0]]}
                                updateSourceWindowState={createWindowStateUpdater(visibleWindows[0])}
                                highlightedAnnotationId={highlightedAnnotationId}
                                setHighlightedAnnotationId={setHighlightedAnnotationId}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default Analytics;
