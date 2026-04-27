import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useGoalLevels } from '../contexts/GoalLevelsContext';
import { useTimezone } from '../contexts/TimezoneContext';
import { useGoals } from '../contexts/GoalsContext';
import { useActivities, useActivityGroups } from '../hooks/useActivityQueries';
import { useFractalTree } from '../hooks/useGoalQueries';
import { useSessionsHeatmap, useSessionsSearch } from '../hooks/useSessionQueries';
import useSessionsPageFilters from '../hooks/useSessionsPageFilters';
import useIsMobile from '../hooks/useIsMobile';
import { SessionCardExpanded, SessionsQuerySidebar } from '../components/sessions';
import { QuickSessionWorkspace } from '../components/sessionDetail';
import CardCornerActionButton from '../components/common/CardCornerActionButton';
import EmptyState from '../components/common/EmptyState';
import LoadingState from '../components/common/LoadingState';
import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import PageHeader from '../components/layout/PageHeader';
import HeaderButton from '../components/layout/HeaderButton';
import { flattenGoals } from '../utils/goalHelpers';
import { formatDateInTimezone } from '../utils/dateUtils';
import { fractalApi } from '../utils/api';
import { queryKeys } from '../hooks/queryKeys';
import notify from '../utils/notify';
import { isQuickSession } from '../utils/sessionRuntime';
import '../App.css';
import styles from './Sessions.module.css';
import { ActiveSessionProvider } from '../contexts/ActiveSessionContext';

/**
 * Sessions Page - View and query practice sessions
 */
function Sessions() {
    const { getGoalColor } = useGoalLevels();
    const { rootId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const { timezone } = useTimezone();
    const { setActiveRootId } = useGoals();
    const isMobile = useIsMobile();
    const quickSessionDialogRef = useRef(null);

    const [selectedSessionId, setSelectedSessionId] = useState(null);
    const [sessionToDelete, setSessionToDelete] = useState(null);
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
    const activeQuickSessionId = searchParams.get('quickSessionId');

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
    const activeQuickSession = useMemo(
        () => sessions.find((session) => session.id === activeQuickSessionId) || null,
        [activeQuickSessionId, sessions]
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

    useEffect(() => {
        if (!activeQuickSessionId) return;
        if (sessionsLoading || (sessionsFetching && sessions.length === 0)) return;
        if (!activeQuickSession || !isQuickSession(activeQuickSession)) {
            const nextSearchParams = new URLSearchParams(searchParams);
            nextSearchParams.delete('quickSessionId');
            setSearchParams(nextSearchParams, { replace: true });
        }
    }, [activeQuickSession, activeQuickSessionId, searchParams, setSearchParams, sessions, sessionsFetching, sessionsLoading]);

    const handleCloseQuickSessionModal = useCallback(() => {
        const nextSearchParams = new URLSearchParams(searchParams);
        nextSearchParams.delete('quickSessionId');
        setSearchParams(nextSearchParams);
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        if (!activeQuickSession || !quickSessionDialogRef.current) return undefined;

        const dialog = quickSessionDialogRef.current;
        dialog.focus();

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                handleCloseQuickSessionModal();
                return;
            }

            if (event.key !== 'Tab') return;

            const focusableElements = dialog.querySelectorAll(
                'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            const focusable = Array.from(focusableElements).filter((element) => (
                !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true'
            ));

            if (focusable.length === 0) {
                event.preventDefault();
                dialog.focus();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        dialog.addEventListener('keydown', handleKeyDown);
        return () => dialog.removeEventListener('keydown', handleKeyDown);
    }, [activeQuickSession, handleCloseQuickSessionModal]);

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

    const handleRequestDeleteSession = useCallback((session) => {
        setSessionToDelete(session);
    }, []);

    const handleCloseDeleteModal = useCallback(() => {
        setSessionToDelete(null);
    }, []);

    const handleConfirmDeleteSession = useCallback(async () => {
        if (!sessionToDelete) return;

        try {
            await fractalApi.deleteSession(rootId, sessionToDelete.id);

            setHiddenSessionIds((prev) => {
                const next = new Set(prev);
                next.add(sessionToDelete.id);
                return next;
            });
            setSelectedSessionId((prev) => (prev === sessionToDelete.id ? null : prev));
            setSessionToDelete(null);

            queryClient.removeQueries({ queryKey: queryKeys.session(rootId, sessionToDelete.id) });
            queryClient.invalidateQueries({ queryKey: ['sessions', rootId] });
            queryClient.invalidateQueries({ queryKey: ['activity-history', rootId] });
            queryClient.invalidateQueries({ queryKey: ['progress'] });

            notify.success('Session deleted');
        } catch (err) {
            console.error('Failed to delete session:', err);
            notify.error('Failed to delete session: ' + (err.response?.data?.error || err.message));
        }
    }, [queryClient, rootId, sessionToDelete]);

    if (activitiesLoading || activityGroupsLoading || goalsLoading || !goalTree) {
        return (
            <div className="page-container">
                <LoadingState label="Loading sessions..." />
            </div>
        );
    }

    return (
        <div className={styles.pageContainer}>
            <div className={styles.leftPanel}>
                <PageHeader
                    title="Sessions"
                    subtitle="Query sessions by date range, completion, activity, and activity-linked goals."
                    hideTitleOnMobile={false}
                    actions={(
                        <>
                            <HeaderButton variant="primary" onClick={() => navigate(`/${rootId}/manage-session-templates`)}>
                                Manage Session Templates
                            </HeaderButton>
                            <HeaderButton variant="secondary" onClick={() => navigate(`/${rootId}/manage-activities`)}>
                                Manage Activities
                            </HeaderButton>
                            <HeaderButton
                                variant="secondary"
                                onClick={() => setIsFiltersPaneOpen((prev) => !prev)}
                                className={styles.notesToggleButton}
                            >
                                {isFiltersPaneOpen ? 'Hide Filters' : 'Show Filters'}
                            </HeaderButton>
                        </>
                    )}
                />

                <div className={styles.sessionsList}>
                    {sessionsLoading || (sessionsFetching && !isFetchingNextPage) ? (
                        <LoadingState label="Loading session data..." className={styles.loadingContainer} />
                    ) : visibleSessions.length === 0 ? (
                        <EmptyState
                            className={styles.emptyState}
                            description={hasActiveFilters
                                ? 'No sessions match the current filters.'
                                : 'No sessions found. Start by clicking "+ ADD SESSION" in the navigation.'}
                        />
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
                                    onRequestDelete={handleRequestDeleteSession}
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

            {isFiltersPaneOpen && isMobile && (
                <div
                    className={styles.sheetBackdrop}
                    onClick={() => setIsFiltersPaneOpen(false)}
                    aria-hidden="true"
                />
            )}
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

            <DeleteConfirmModal
                isOpen={Boolean(sessionToDelete)}
                onClose={handleCloseDeleteModal}
                onConfirm={handleConfirmDeleteSession}
                title="Delete Session"
                message={sessionToDelete
                    ? `Are you sure you want to delete "${sessionToDelete.name}"?`
                    : 'Are you sure you want to delete this session?'}
                confirmText="Delete Session"
            />

            {activeQuickSession && isQuickSession(activeQuickSession) && (
                <div
                    className={styles.quickSessionModalOverlay}
                    onClick={handleCloseQuickSessionModal}
                    role="presentation"
                >
                    <div
                        ref={quickSessionDialogRef}
                        className={styles.quickSessionModal}
                        onClick={(event) => event.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-label={`Quick session: ${activeQuickSession.name}`}
                        tabIndex={-1}
                    >
                        <CardCornerActionButton
                            className={styles.quickSessionModalClose}
                            onClick={handleCloseQuickSessionModal}
                            label="Close quick session"
                            title="Close"
                        />
                        <ActiveSessionProvider rootId={rootId} sessionId={activeQuickSession.id}>
                            <QuickSessionWorkspace />
                        </ActiveSessionProvider>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Sessions;
