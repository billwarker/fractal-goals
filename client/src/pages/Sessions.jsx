import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useGoalLevels } from '../contexts/GoalLevelsContext';
import { useTimezone } from '../contexts/TimezoneContext';
import { useGoals } from '../contexts/GoalsContext';
import { useActivities, useActivityGroups } from '../hooks/useActivityQueries';
import { useFractalTree } from '../hooks/useGoalQueries';
import { useSessionsHeatmap, useSessionsSearch } from '../hooks/useSessionQueries';
import useSessionsPageFilters from '../hooks/useSessionsPageFilters';
import useIsMobile from '../hooks/useIsMobile';
import { SessionCardExpanded, SessionsQuerySidebar } from '../components/sessions';
import { flattenGoals } from '../utils/goalHelpers';
import { formatDateInTimezone } from '../utils/dateUtils';
import '../App.css';
import styles from './Sessions.module.css';

/**
 * Sessions Page - View and query practice sessions
 */
function Sessions() {
    const { getGoalColor } = useGoalLevels();
    const { rootId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { timezone } = useTimezone();
    const { setActiveRootId } = useGoals();
    const isMobile = useIsMobile();

    const [selectedSessionId, setSelectedSessionId] = useState(null);
    const filtersPaneStorageKey = `sessions-query-pane-open:${rootId || 'default'}`;
    const [isFiltersPaneOpen, setIsFiltersPaneOpen] = useState(() => {
        if (typeof window === 'undefined') return true;
        const stored = window.localStorage.getItem(`sessions-query-pane-open:${rootId || 'default'}`);
        return stored == null ? true : stored === 'true';
    });
    const [hiddenSessionIds, setHiddenSessionIds] = useState(() => {
        const deletedId = location.state?.deletedSessionId;
        return deletedId ? new Set([deletedId]) : new Set();
    });

    const { filters, apiFilters, heatmapApiFilters, hasActiveFilters, updateFilters, resetFilters } = useSessionsPageFilters(timezone);
    const SESSIONS_PER_PAGE = 10;

    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        setActiveRootId(rootId);
        return () => setActiveRootId(null);
    }, [rootId, navigate, setActiveRootId]);

    const {
        data: sessionsPages,
        isLoading: sessionsLoading,
        isFetching: sessionsFetching,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useSessionsSearch(rootId, apiFilters, SESSIONS_PER_PAGE);

    const { activities = [], isLoading: activitiesLoading } = useActivities(rootId);
    const { activityGroups = [], isLoading: activityGroupsLoading } = useActivityGroups(rootId);
    const {
        data: goalTree,
        isLoading: goalsLoading,
    } = useFractalTree(rootId);
    const {
        data: heatmap,
        isLoading: heatmapLoading,
    } = useSessionsHeatmap(rootId, heatmapApiFilters);

    const sessions = useMemo(() => {
        const pages = sessionsPages?.pages || [];
        return pages.flatMap((page) => page?.sessions || []);
    }, [sessionsPages]);

    const totalSessions = sessionsPages?.pages?.[0]?.pagination?.total || 0;

    useEffect(() => {
        const deletedId = location.state?.deletedSessionId;
        if (!deletedId) return;
        setHiddenSessionIds((prev) => {
            const next = new Set(prev);
            next.add(deletedId);
            return next;
        });
        setSelectedSessionId((prev) => (prev === deletedId ? null : prev));
    }, [location.state]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const stored = window.localStorage.getItem(filtersPaneStorageKey);
        setIsFiltersPaneOpen(stored == null ? true : stored === 'true');
    }, [filtersPaneStorageKey]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(filtersPaneStorageKey, String(isFiltersPaneOpen));
    }, [filtersPaneStorageKey, isFiltersPaneOpen]);

    const visibleSessions = useMemo(
        () => sessions.filter((session) => !hiddenSessionIds.has(session.id)),
        [sessions, hiddenSessionIds]
    );

    useEffect(() => {
        if (!selectedSessionId) return;
        const sessionStillVisible = visibleSessions.some((session) => session.id === selectedSessionId);
        if (!sessionStillVisible) {
            setSelectedSessionId(null);
        }
    }, [selectedSessionId, visibleSessions]);

    useEffect(() => {
        if (selectedSessionId) {
            const element = document.getElementById(`session-card-${selectedSessionId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [selectedSessionId]);

    const goalOptions = useMemo(() => {
        const allGoals = flattenGoals(goalTree ? [goalTree] : []);
        const goalIdsInActivities = new Set(
            activities.flatMap((activity) => activity.associated_goal_ids || [])
        );

        return allGoals
            .filter((goal) => goalIdsInActivities.has(goal.id))
            .sort((goalA, goalB) => goalA.name.localeCompare(goalB.name));
    }, [activities, goalTree]);

    const formatDate = useCallback((dateString, options = {}) => {
        if (!dateString) return '';
        if (typeof dateString === 'string' && dateString.length === 10 && dateString.includes('-') && !dateString.includes('T')) {
            const [year, month, day] = dateString.split('-').map(Number);
            const date = new Date(year, month - 1, day);
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            });
        }
        return formatDateInTimezone(dateString, timezone, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            ...options,
        });
    }, [timezone]);

    const handleSessionSelect = useCallback((sessionId) => {
        setSelectedSessionId(sessionId);
    }, []);

    if (activitiesLoading || activityGroupsLoading || goalsLoading || !goalTree) {
        return (
            <div className="page-container" style={{ textAlign: 'center', color: '#666', padding: '40px' }}>
                Loading sessions...
            </div>
        );
    }

    return (
        <div className={styles.pageContainer}>
            <div className={styles.leftPanel}>
                <div className={styles.pageHeader}>
                    <div className={styles.headerCopy}>
                        <h1 className={styles.pageTitle}>Sessions</h1>
                        <div className={styles.pageSubtitle}>
                            Query sessions by date range, completion, activity, and activity-linked goals.
                        </div>
                    </div>

                    <div className={styles.actionButtons}>
                        <button
                            onClick={() => navigate(`/${rootId}/manage-session-templates`)}
                            className={styles.primaryButton}
                        >
                            Manage Session Templates
                        </button>
                        <button
                            onClick={() => navigate(`/${rootId}/manage-activities`)}
                            className={styles.secondaryButton}
                        >
                            Manage Activities
                        </button>
                        <button
                            onClick={() => setIsFiltersPaneOpen((prev) => !prev)}
                            className={`${styles.secondaryButton} ${styles.notesToggleButton}`}
                        >
                            {isFiltersPaneOpen ? 'Hide Filters' : 'Show Filters'}
                        </button>
                    </div>
                </div>

                <div className={styles.sessionsList}>
                    {sessionsLoading || (sessionsFetching && !isFetchingNextPage) ? (
                        <div className={styles.loadingContainer}>
                            <p className={styles.loadingText}>Loading session data...</p>
                        </div>
                    ) : visibleSessions.length === 0 ? (
                        <div className={styles.emptyState}>
                            {hasActiveFilters
                                ? 'No sessions match the current filters.'
                                : 'No sessions found. Start by clicking "+ ADD SESSION" in the navigation.'}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {visibleSessions.map((session) => (
                                <SessionCardExpanded
                                    key={session.id}
                                    session={session}
                                    rootId={rootId}
                                    activities={activities}
                                    isSelected={selectedSessionId === session.id}
                                    onSelect={handleSessionSelect}
                                    getGoalColor={getGoalColor}
                                    timezone={timezone}
                                    formatDate={formatDate}
                                    sessionActivityInstances={session.activity_instances || []}
                                />
                            ))}

                            {hasNextPage && (
                                <div className={styles.loadMoreContainer}>
                                    <span className={styles.loadMoreText}>
                                        Showing {visibleSessions.length} of {totalSessions} sessions
                                    </span>
                                    <button
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            fetchNextPage();
                                        }}
                                        disabled={isFetchingNextPage}
                                        className={`${styles.loadMoreButton} ${isFetchingNextPage ? styles.loadMoreButtonDisabled : ''}`}
                                    >
                                        {isFetchingNextPage ? (
                                            <>
                                                <span className={styles.loadingSpinner} />
                                                Loading...
                                            </>
                                        ) : (
                                            `Load ${Math.min(SESSIONS_PER_PAGE, totalSessions - sessions.length)} More Sessions`
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {isFiltersPaneOpen && (
                <div className={styles.rightPanel}>
                    <SessionsQuerySidebar
                        filters={filters}
                        visibleSessionsCount={visibleSessions.length}
                        totalSessionsCount={totalSessions}
                        activities={activities}
                        activityGroups={activityGroups}
                        goalOptions={goalOptions}
                        heatmap={heatmap}
                        isHeatmapLoading={heatmapLoading && !heatmap}
                        hasActiveFilters={hasActiveFilters}
                        onUpdateFilters={updateFilters}
                        onResetFilters={resetFilters}
                        onToggleCollapse={() => setIsFiltersPaneOpen(false)}
                        isMobile={isMobile}
                    />
                </div>
            )}
        </div>
    );
}

export default Sessions;
