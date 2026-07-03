import React, { useMemo, useRef, useState } from 'react';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import Button from '../atoms/Button';
import CloseButton from '../atoms/CloseButton';
import IconButton from '../atoms/IconButton';
import {
    AnalyticsGoalIcon,
    BackIcon,
    ChartIcon,
    HomeIcon,
    LightningIcon,
    MinimizeHeaderIcon,
    RestoreHeaderIcon,
    SplitIcon,
    TimerIcon,
    VisualizationIcon,
} from './AnalyticsIcons';
import { resolveAnalyticsGlobalFilters } from './analyticsGlobalFilters';
import styles from './ProfileWindow.module.css';
import {
    getVisualization,
    getVisualizationsByCategory,
    VISUALIZATION_CATEGORIES,
} from './visualizations/registry';
import {
    getVisualizationSelectionUpdate,
    getVisualizationStateUpdate,
    normalizeVisualizationState,
} from './visualizations/state';
import { buildVisualizationQueryExplanation } from './visualizationQueryExplanations';

const CATEGORY_LABELS = Object.fromEntries(VISUALIZATION_CATEGORIES.map((category) => [category.id, category.name]));

/**
 * ProfileWindow - A single analytics window that can display various visualizations
 * 
 * @param {object} props
 * @param {string} props.windowId - Unique ID for this window
 * @param {boolean} props.canSplit - Whether this window can be split (only first window)
 * @param {function} props.onSplit - Callback when split button is clicked
 * @param {boolean} props.canClose - Whether this window can be closed
 * @param {function} props.onClose - Callback when close button is clicked
 * @param {object} props.data - All analytics data (sessions, goalAnalytics, activities, activityInstances)
 * @param {object} props.windowState - Controlled state for this window (from parent)
 * @param {function} props.updateWindowState - Callback to update window state
 * @param {boolean} props.isSelected - Whether this window is selected
 * @param {function} props.onSelect - Callback when the window is clicked to select it
 */
function ProfileWindow({
    canSplit = false,
    onSplit, // Now accepts: onSplit(direction) where direction is 'vertical' or 'horizontal'
    canClose = false,
    onClose,
    data,
    windowState,
    updateWindowState,
    isSelected = false,
    onSelect,
    dragHandleProps = null,
    globalDateRange = null,
    onGlobalDateRangeChange,
    globalFilters = null,
    onOpenQueryConsole = null,
}) {
    const { getGoalColor, getGoalSecondaryColor, getGoalIcon } = useGoalLevels();
    const { sessions, goalAnalytics, activities, activityGroups, activityInstances, rootId } = data;
    const chartRef = useRef(null);
    const containerRef = useRef(null);

    // Local state for split dropdown
    const [showSplitMenu, setShowSplitMenu] = useState(false);
    const [isHeaderMinimized, setIsHeaderMinimized] = useState(false);
    const [isQueryOverlayOpen, setIsQueryOverlayOpen] = useState(false);

    // Track container width for responsive styling
    const [isNarrow, setIsNarrow] = useState(false);
    const [isVeryNarrow, setIsVeryNarrow] = useState(false);

    // Use ResizeObserver to detect width changes
    React.useEffect(() => {
        if (!containerRef.current) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const width = entry.contentRect.width;
                setIsNarrow(width < 400);
                setIsVeryNarrow(width < 280);
            }
        });

        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // Extract state from controlled windowState prop
    const {
        selectedCategory,
        selectedVisualization,
        selectedActivity,
        selectedGoal,
    } = windowState;
    const visualizationState = useMemo(() => normalizeVisualizationState(windowState), [windowState]);

    // Helper to update state (setSelectedCategory is handled by handleCategoryChange below)
    const setSelectedVisualization = (value) => updateWindowState(getVisualizationSelectionUpdate(windowState, value));
    const updateVisualizationState = React.useCallback((updates) => {
        updateWindowState(getVisualizationStateUpdate(windowState, updates));
    }, [updateWindowState, windowState]);
    const effectiveDateRange = globalDateRange;
    const resolvedGlobalFilters = useMemo(() => resolveAnalyticsGlobalFilters({
        filters: globalFilters,
        goalAnalytics,
        activities,
        activityGroups,
        activityInstances,
    }), [activities, activityGroups, activityInstances, globalFilters, goalAnalytics]);
    const scopedActivities = useMemo(() => (
        resolvedGlobalFilters.hasActivityFilter
            ? activities.filter((activity) => resolvedGlobalFilters.activityIds.has(activity.id))
            : activities
    ), [activities, resolvedGlobalFilters.activityIds, resolvedGlobalFilters.hasActivityFilter]);
    const selectedVisualizationMeta = getVisualization(selectedCategory, selectedVisualization);
    const effectiveSelectedActivity = useMemo(() => {
        if (selectedActivity?.id && scopedActivities.some((activity) => activity.id === selectedActivity.id)) {
            return scopedActivities.find((activity) => activity.id === selectedActivity.id);
        }
        if (
            selectedVisualizationMeta?.selectionRequirements?.activity
            && resolvedGlobalFilters.hasActivityFilter
            && scopedActivities.length === 1
        ) {
            return scopedActivities[0];
        }
        return null;
    }, [resolvedGlobalFilters.hasActivityFilter, scopedActivities, selectedActivity, selectedVisualizationMeta]);
    const hasActiveDateRange = Boolean(effectiveDateRange?.start || effectiveDateRange?.end);

    const isDateInRange = React.useCallback((value) => {
        if (!hasActiveDateRange) return true;
        const date = value ? new Date(value) : null;
        if (!date || Number.isNaN(date.getTime())) return false;
        const start = effectiveDateRange?.start ? new Date(`${effectiveDateRange.start}T00:00:00`) : null;
        const end = effectiveDateRange?.end ? new Date(`${effectiveDateRange.end}T23:59:59`) : null;
        if (start && date < start) return false;
        if (end && date > end) return false;
        return true;
    }, [effectiveDateRange, hasActiveDateRange]);

    // Reset visualization when category changes
    const handleCategoryChange = (category) => {
        if (category !== selectedCategory) {
            updateWindowState({
                selectedCategory: category,
                selectedVisualization: null,
                selectedActivity: null,
                selectedGoal: null,
            });
        }
    };

    const handleBack = () => {
        if (selectedVisualization) {
            updateWindowState({
                selectedVisualization: null,
                selectedActivity: null,
                selectedGoal: null,
            });
        } else if (selectedCategory) {
            updateWindowState({
                selectedCategory: null,
                selectedVisualization: null,
                selectedActivity: null,
                selectedGoal: null,
            });
        }
    };

    const handleTop = () => {
        updateWindowState({
            selectedCategory: null,
            selectedVisualization: null,
            selectedActivity: null,
            selectedModeIds: [],
            selectedGoal: null,
        });
    };

    // Define available visualizations for each category
    const rootGoal = useMemo(() => (
        (goalAnalytics?.goals || []).find((goal) => goal.id === rootId || !goal.parent_id) || null
    ), [goalAnalytics?.goals, rootId]);

    const categoryIcons = {
        goals: <AnalyticsGoalIcon goal={rootGoal} getGoalColor={getGoalColor} getGoalSecondaryColor={getGoalSecondaryColor} getGoalIcon={getGoalIcon} size={16} />,
        sessions: <TimerIcon size={16} />,
        activities: <LightningIcon size={16} />,
    };

    const renderVisualizationIcon = (visualization, size = 16) => {
        if (visualization?.id === 'goalDetail') {
            return (
                <span
                    className={styles.goalDetailIconWrap}
                    style={{ width: size, height: size }}
                    aria-hidden="true"
                >
                    <AnalyticsGoalIcon
                        goal={rootGoal}
                        getGoalColor={getGoalColor}
                        getGoalSecondaryColor={getGoalSecondaryColor}
                        getGoalIcon={getGoalIcon}
                        size={Math.max(10, Math.round(size * 0.82))}
                        className={styles.goalDetailIconShape}
                    />
                    <span className={styles.goalDetailIconPlus}>
                        <svg width={Math.max(8, Math.round(size * 0.46))} height={Math.max(8, Math.round(size * 0.46))} viewBox="0 0 12 12" fill="none">
                            <path d="M6 2.4v7.2M2.4 6h7.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                    </span>
                </span>
            );
        }

        return <VisualizationIcon type={visualization?.iconType} size={size} />;
    };

    const visualizations = Object.fromEntries(
        VISUALIZATION_CATEGORIES.map((category) => [category.id, getVisualizationsByCategory(category.id)])
    );

    // Get goal type color
    const getGoalTypeColor = (type) => {
        return getGoalColor(type);
    };

    const filteredSessions = useMemo(() => {
        const dateFiltered = sessions.filter((session) => {
            const rawDate = session.session_start || session.created_at;
            return isDateInRange(rawDate);
        });
        if (!resolvedGlobalFilters.hasActivityFilter) {
            return dateFiltered;
        }
        return dateFiltered.filter((session) => resolvedGlobalFilters.sessionIds.has(session.id));
    }, [isDateInRange, resolvedGlobalFilters.hasActivityFilter, resolvedGlobalFilters.sessionIds, sessions]);

    const filteredActivityInstances = useMemo(() => {
        return Object.fromEntries(Object.entries(activityInstances || {}).map(([activityId, instances]) => [
            activityId,
            (instances || []).filter((instance) => {
                if (resolvedGlobalFilters.hasActivityFilter && !resolvedGlobalFilters.activityIds.has(activityId)) {
                    return false;
                }
                const rawDate = instance.session_date || instance.created_at;
                return isDateInRange(rawDate);
            }),
        ]));
    }, [activityInstances, isDateInRange, resolvedGlobalFilters.activityIds, resolvedGlobalFilters.hasActivityFilter]);

    const filteredGoalAnalyticsGoals = useMemo(() => {
        const goals = goalAnalytics?.goals || [];
        const scopedGoals = resolvedGlobalFilters.hasGoalFilter
            ? goals.filter((goal) => resolvedGlobalFilters.goalIds.has(goal.id))
            : goals;
        const allowedActivityNames = resolvedGlobalFilters.hasActivityFilter
            ? new Set(scopedActivities.map((activity) => activity.name))
            : null;

        return scopedGoals.map((goal) => {
            const activityDurations = (goal.activity_durations_by_date || []).filter((item) => (
                isDateInRange(item.date)
                && (!allowedActivityNames || allowedActivityNames.has(item.activity_name))
            ));
            const sessionDurations = allowedActivityNames
                ? Object.values(activityDurations.reduce((byDate, item) => {
                    const key = item.date || 'Unknown';
                    byDate[key] = byDate[key] || { date: item.date, duration_seconds: 0, session_name: 'Filtered activities' };
                    byDate[key].duration_seconds += item.duration_seconds || 0;
                    return byDate;
                }, {}))
                : (goal.session_durations_by_date || []).filter((item) => isDateInRange(item.date));
            const activityBreakdownByName = new Map();

            activityDurations.forEach((item) => {
                const name = item.activity_name || 'Unknown';
                const current = activityBreakdownByName.get(name) || {
                    activity_id: name,
                    activity_name: name,
                    instance_count: 0,
                    total_duration_seconds: 0,
                };
                current.instance_count += 1;
                current.total_duration_seconds += item.duration_seconds || 0;
                activityBreakdownByName.set(name, current);
            });

            return {
                ...goal,
                completed: Boolean(goal.completed && isDateInRange(goal.completed_at)),
                session_durations_by_date: sessionDurations,
                activity_durations_by_date: activityDurations,
                activity_breakdown: hasActiveDateRange || allowedActivityNames
                    ? Array.from(activityBreakdownByName.values())
                    : goal.activity_breakdown,
                total_duration_seconds: sessionDurations.reduce((sum, item) => sum + (item.duration_seconds || 0), 0),
                session_count: sessionDurations.length,
            };
        });
    }, [goalAnalytics?.goals, hasActiveDateRange, isDateInRange, resolvedGlobalFilters.goalIds, resolvedGlobalFilters.hasActivityFilter, resolvedGlobalFilters.hasGoalFilter, scopedActivities]);

    const filteredGoalSummary = useMemo(() => {
        const completedGoals = filteredGoalAnalyticsGoals.filter((goal) => goal.completed);
        const completionTimes = completedGoals.map((goal) => {
            const created = goal.created_at ? new Date(goal.created_at) : null;
            const completed = goal.completed_at ? new Date(goal.completed_at) : null;
            if (!created || !completed || Number.isNaN(created.getTime()) || Number.isNaN(completed.getTime())) {
                return null;
            }
            return Math.max(0, Math.round((completed - created) / 86400000));
        }).filter((value) => value != null);
        const durations = completedGoals.map((goal) => goal.total_duration_seconds || 0).filter((value) => value > 0);

        return {
            completed_goals: completedGoals.length,
            completion_rate: filteredGoalAnalyticsGoals.length > 0
                ? (completedGoals.length / filteredGoalAnalyticsGoals.length) * 100
                : 0,
            avg_goal_age_days: goalAnalytics?.summary?.avg_goal_age_days || 0,
            avg_time_to_completion_days: completionTimes.length
                ? completionTimes.reduce((sum, value) => sum + value, 0) / completionTimes.length
                : 0,
            avg_duration_to_completion_seconds: durations.length
                ? durations.reduce((sum, value) => sum + value, 0) / durations.length
                : 0,
        };
    }, [filteredGoalAnalyticsGoals, goalAnalytics?.summary?.avg_goal_age_days]);

    const effectiveSelectedGoal = useMemo(() => {
        if (selectedGoal?.id && filteredGoalAnalyticsGoals.some((goal) => goal.id === selectedGoal.id)) {
            return filteredGoalAnalyticsGoals.find((goal) => goal.id === selectedGoal.id);
        }
        if (resolvedGlobalFilters.filters.goals.goalIds.length === 1) {
            const goalId = resolvedGlobalFilters.filters.goals.goalIds[0];
            return filteredGoalAnalyticsGoals.find((goal) => goal.id === goalId) || null;
        }
        if (
            selectedVisualizationMeta?.selectionRequirements?.goal
            && (resolvedGlobalFilters.hasGoalFilter || resolvedGlobalFilters.hasActivityFilter)
            && filteredGoalAnalyticsGoals.length === 1
        ) {
            return filteredGoalAnalyticsGoals[0];
        }
        return null;
    }, [
        filteredGoalAnalyticsGoals,
        resolvedGlobalFilters.filters.goals.goalIds,
        resolvedGlobalFilters.hasActivityFilter,
        resolvedGlobalFilters.hasGoalFilter,
        selectedGoal,
        selectedVisualizationMeta,
    ]);

    const queryExplanation = useMemo(() => {
        if (!selectedVisualizationMeta) return null;
        return buildVisualizationQueryExplanation({
            selectedCategory,
            selectedVisualization,
            visualization: selectedVisualizationMeta,
            visualizationState,
            categoryLabel: CATEGORY_LABELS[selectedCategory] || selectedCategory,
            dateRange: effectiveDateRange,
            globalFilters: resolvedGlobalFilters,
            effectiveSelectedActivity,
            effectiveSelectedGoal,
            resultShape: {
                sessions: filteredSessions.length,
                activities: scopedActivities.length,
                goals: filteredGoalAnalyticsGoals.length,
            },
        });
    }, [
        effectiveDateRange,
        effectiveSelectedActivity,
        effectiveSelectedGoal,
        filteredGoalAnalyticsGoals.length,
        filteredSessions.length,
        resolvedGlobalFilters,
        scopedActivities.length,
        selectedCategory,
        selectedVisualization,
        selectedVisualizationMeta,
        visualizationState,
    ]);

    const handleCopyQuery = async (event) => {
        event.stopPropagation();
        if (!queryExplanation?.sql || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
        await navigator.clipboard.writeText(`${queryExplanation.sql}\n\n-- Metadata\n${JSON.stringify(queryExplanation.metadata, null, 2)}`);
    };

    const handleOpenQueryConsole = (event) => {
        event.stopPropagation();
        if (queryExplanation?.sql && queryExplanation.metadata.runnable !== false) {
            onOpenQueryConsole?.(queryExplanation.sql);
        }
    };

    const renderUnifiedHeader = () => {
        const hasCategory = !!selectedCategory;

        return (
            <div
                className={`${styles.header} ${isVeryNarrow ? styles.wrap : ''}`}
                {...(dragHandleProps || {})}
            >
                {/* Navigation Controls (Back/Top) */}
                {hasCategory && (
                    <div className={styles.navGroup}>
                        <Button
                            onClick={handleTop}
                            title="Top Level (All Categories)"
                            variant="secondary"
                            size="sm"
                            style={{ padding: '0 8px', minWidth: '32px' }}
                        >
                            <HomeIcon size={15} />
                        </Button>
                        <Button
                            onClick={handleBack}
                            title="Go Back"
                            variant="secondary"
                            size="sm"
                            style={{ padding: '0 8px', minWidth: '32px' }}
                        >
                            <BackIcon size={15} />
                        </Button>
                    </div>
                )}

                {/* Main Action Area */}
                <div className={styles.mainActions}>
                    <div className={styles.headerContext}>
                        <span className={styles.buttonIcon}>
                            {selectedVisualizationMeta
                                ? renderVisualizationIcon(selectedVisualizationMeta, 16)
                                : hasCategory
                                    ? categoryIcons[selectedCategory]
                                    : <ChartIcon size={16} />}
                        </span>
                        <span>
                            {selectedVisualizationMeta?.name || CATEGORY_LABELS[selectedCategory] || 'Analytics'}
                        </span>
                    </div>
                </div>

                {/* Global Actions (Annotations, Split, Close) */}
                <div className={styles.globalActions}>
                    {selectedVisualizationMeta && (
                        <Button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsQueryOverlayOpen((current) => !current);
                            }}
                            variant="secondary"
                            size="sm"
                            style={{ padding: '0 8px', minWidth: '32px' }}
                            aria-label="Show chart query"
                            title="Show chart query"
                        >
                            SQL
                        </Button>
                    )}
                    {canSplit && (
                        <div style={{ position: 'relative' }}>
                            <Button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowSplitMenu(!showSplitMenu);
                                }}
                                variant="secondary"
                                size="sm"
                                style={{ padding: '0 8px' }}
                            >
                                <SplitIcon size={15} />
                                {!isNarrow && <span>Split</span>}
                            </Button>
                            {showSplitMenu && (
                                <div className={styles.splitMenu}>
                                    <button onClick={(e) => { e.stopPropagation(); onSplit('vertical'); setShowSplitMenu(false); }}
                                        className={styles.splitMenuItem}>
                                        <span className={styles.menuIcon}><SplitIcon size={15} /></span> Split Vertical
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); onSplit('horizontal'); setShowSplitMenu(false); }}
                                        className={styles.splitMenuItem}>
                                        <span className={styles.menuIcon}><SplitIcon size={15} /></span> Split Horizontal
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                    <Button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowSplitMenu(false);
                            setIsHeaderMinimized(true);
                        }}
                        variant="ghost"
                        size="sm"
                        style={{ padding: '0 8px', minWidth: '32px' }}
                        aria-label="Minimize analytics panel header"
                        title="Minimize header"
                    >
                        <MinimizeHeaderIcon size={16} />
                    </Button>
                    <CloseButton
                        onClick={(event) => {
                            event.stopPropagation();
                            if (canClose) onClose();
                        }}
                        style={{ padding: '0 8px', minWidth: '32px' }}
                        aria-label="Close analytics window"
                        title={canClose ? 'Close analytics window' : 'At least one analytics panel is required'}
                        disabled={!canClose}
                        size={16}
                        buttonSize="sm"
                    />
                </div>
            </div>
        );
    };

    const renderMinimizedHeaderOverlay = () => (
        <div className={styles.minimizedHeaderOverlay} onClick={(event) => event.stopPropagation()}>
            <IconButton
                className={styles.minimizedHeaderButton}
                onClick={() => setIsHeaderMinimized(false)}
                aria-label="Restore analytics panel header"
                title="Restore header"
                size="sm"
            >
                <RestoreHeaderIcon size={15} />
            </IconButton>
            <CloseButton
                className={styles.minimizedHeaderButton}
                onClick={onClose}
                aria-label="Close analytics window"
                title={canClose ? 'Close analytics window' : 'At least one analytics panel is required'}
                disabled={!canClose}
                size={15}
                buttonSize="sm"
            />
        </div>
    );

    const renderQueryOverlay = () => {
        if (!isQueryOverlayOpen || !queryExplanation) return null;
        return (
            <div className={styles.queryOverlay} onClick={(event) => event.stopPropagation()}>
                <div className={styles.queryOverlayHeader}>
                    <div>
                        <strong>Chart Query</strong>
                        <span>{queryExplanation.metadata.visualization}</span>
                    </div>
                    <CloseButton
                        onClick={() => setIsQueryOverlayOpen(false)}
                        aria-label="Close chart query"
                        size={14}
                        buttonSize="sm"
                    />
                </div>
                <pre className={styles.querySql}>{queryExplanation.sql}</pre>
                <dl className={styles.queryMeta}>
                    <div><dt>Dataset</dt><dd>{queryExplanation.metadata.dataset}</dd></div>
                    <div><dt>Source</dt><dd>{queryExplanation.metadata.execution || 'catalog_sql'}</dd></div>
                    <div><dt>Goals</dt><dd>{queryExplanation.metadata.resultShape.goals}</dd></div>
                    <div><dt>Sessions</dt><dd>{queryExplanation.metadata.resultShape.sessions}</dd></div>
                </dl>
                {queryExplanation.metadata.notes?.length > 0 && (
                    <div className={styles.queryNotes}>
                        {queryExplanation.metadata.notes[0]}
                    </div>
                )}
                <div className={styles.queryActions}>
                    <button type="button" onClick={handleCopyQuery}>Copy</button>
                    <button
                        type="button"
                        onClick={handleOpenQueryConsole}
                        disabled={queryExplanation.metadata.runnable === false}
                        title={queryExplanation.metadata.runnable === false ? 'This chart is produced from the analytics read model and is not directly runnable in the SQL console yet.' : 'Open in SQL console'}
                    >
                        Open Console
                    </button>
                </div>
            </div>
        );
    };

    const renderCategoryCards = () => (
        <div className={styles.selectionSurface}>
            <div className={styles.selectionGrid}>
                {['goals', 'sessions', 'activities'].map(category => (
                    <button
                        key={category}
                        type="button"
                        className={styles.selectionCard}
                        onClick={() => handleCategoryChange(category)}
                    >
                        <span className={styles.selectionIcon}>{categoryIcons[category]}</span>
                        <span className={styles.selectionName}>{CATEGORY_LABELS[category]}</span>
                    </button>
                ))}
            </div>
        </div>
    );

    const renderVisualizationCards = () => (
        <div className={styles.selectionSurface}>
            <div className={styles.selectionGrid}>
                {visualizations[selectedCategory]?.map(vis => (
                    <button
                        key={vis.id}
                        type="button"
                        className={styles.selectionCard}
                        onClick={() => setSelectedVisualization(vis.id)}
                    >
                        <span className={styles.selectionIcon}>{renderVisualizationIcon(vis, 22)}</span>
                        <span className={styles.selectionName}>{vis.name}</span>
                    </button>
                ))}
            </div>
        </div>
    );







    // Render the actual visualization content
    const renderVisualizationContent = () => {
        if (!selectedCategory) {
            return renderCategoryCards();
        }

        if (!selectedVisualization) {
            return renderVisualizationCards();
        }

        const VisualizationChart = selectedVisualizationMeta?.Chart;
        if (!VisualizationChart) return null;

        return (
            <VisualizationChart
                context={{
                    data,
                    scopedData: {
                        activities: scopedActivities,
                        activityInstances: filteredActivityInstances,
                        goals: filteredGoalAnalyticsGoals,
                        goalSummary: filteredGoalSummary,
                        sessions: filteredSessions,
                    },
                    globalFilters: resolvedGlobalFilters,
                    dateRange: effectiveDateRange,
                    windowState,
                    updateWindowState,
                    visualization: selectedVisualizationMeta,
                    visualizationState,
                    updateVisualizationState,
                    chartRef,
                    effectiveSelectedActivity,
                    effectiveSelectedGoal,
                    getGoalTypeColor,
                    onGlobalDateRangeChange,
                }}
            />
        );
    };

    return (
        <div
            ref={containerRef}
            onClick={() => {
                if (onSelect) {
                    onSelect();
                }
            }}
            className={`${styles.windowContainer} ${isSelected ? styles.selected : ''}`}
        >
            {isHeaderMinimized ? renderMinimizedHeaderOverlay() : renderUnifiedHeader()}
            {renderQueryOverlay()}
            {renderVisualizationContent()}
        </div>
    );
}

export default ProfileWindow;
