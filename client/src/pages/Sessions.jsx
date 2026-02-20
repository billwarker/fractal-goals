import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { useTheme } from '../contexts/ThemeContext'
import { useGoalLevels } from '../contexts/GoalLevelsContext';;
import { useTimezone } from '../contexts/TimezoneContext';
import { formatDateInTimezone } from '../utils/dateUtils';
import { SessionNotesSidebar, SessionCardExpanded } from '../components/sessions';
import useIsMobile from '../hooks/useIsMobile';
import '../App.css';
import styles from './Sessions.module.css';
import { useGoals } from '../contexts/GoalsContext';

/**
 * Sessions Page - View and manage practice sessions
 * Displays all practice sessions for the current fractal in card format with horizontal sections
 */
function Sessions() {
    const { getGoalColor } = useGoalLevels();;
    const { rootId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { timezone } = useTimezone();
    const { setActiveRootId } = useGoals();
    const isMobile = useIsMobile();

    const [filterCompleted, setFilterCompleted] = useState('all');
    const [selectedSessionId, setSelectedSessionId] = useState(null);
    const [selectedNoteId, setSelectedNoteId] = useState(null);
    const notesPaneStorageKey = `sessions-notes-pane-open:${rootId || 'default'}`;
    const [isNotesPaneOpen, setIsNotesPaneOpen] = useState(() => {
        if (typeof window === 'undefined') return true;
        const stored = window.localStorage.getItem(`sessions-notes-pane-open:${rootId || 'default'}`);
        return stored == null ? true : stored === 'true';
    });
    const [sortBy, setSortBy] = useState('start_date');
    const [sortOrder, setSortOrder] = useState('desc');
    const [hiddenSessionIds, setHiddenSessionIds] = useState(() => {
        const deletedId = location.state?.deletedSessionId;
        return deletedId ? new Set([deletedId]) : new Set();
    });

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
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useInfiniteQuery({
        queryKey: ['sessions', rootId, 'paginated'],
        queryFn: async ({ pageParam = 0 }) => {
            const res = await fractalApi.getSessions(rootId, {
                limit: SESSIONS_PER_PAGE,
                offset: pageParam
            });
            return res.data;
        },
        initialPageParam: 0,
        getNextPageParam: (lastPage) => {
            if (!lastPage?.pagination?.has_more) return undefined;
            return (lastPage.pagination.offset || 0) + (lastPage.pagination.limit || SESSIONS_PER_PAGE);
        },
        enabled: !!rootId
    });

    const { data: activities = [], isLoading: activitiesLoading } = useQuery({
        queryKey: ['activities', rootId],
        queryFn: async () => {
            const res = await fractalApi.getActivities(rootId);
            return res.data || [];
        },
        enabled: !!rootId
    });

    const sessions = useMemo(() => {
        const pages = sessionsPages?.pages || [];
        return pages.flatMap((page) => page?.sessions || []);
    }, [sessionsPages]);

    const totalSessions = sessionsPages?.pages?.[0]?.pagination?.total || sessions.length;

    useEffect(() => {
        const deletedId = location.state?.deletedSessionId;
        if (!deletedId) return;
        setHiddenSessionIds(prev => {
            const next = new Set(prev);
            next.add(deletedId);
            return next;
        });
        setSelectedSessionId(prev => (prev === deletedId ? null : prev));
    }, [location.state]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const stored = window.localStorage.getItem(notesPaneStorageKey);
        setIsNotesPaneOpen(stored == null ? true : stored === 'true');
    }, [notesPaneStorageKey]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(notesPaneStorageKey, String(isNotesPaneOpen));
    }, [notesPaneStorageKey, isNotesPaneOpen]);

    // Scroll to selected session
    useEffect(() => {
        if (selectedSessionId) {
            const el = document.getElementById(`session-card-${selectedSessionId}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [selectedSessionId]);

    const handleSortChange = useCallback((criteria) => {
        if (sortBy === criteria) {
            setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
        } else {
            setSortBy(criteria);
            setSortOrder('desc');
        }
    }, [sortBy]);

    // Memoize filtered and sorted sessions
    const filteredSessions = useMemo(() => {
        return sessions.filter(session => {
            if (hiddenSessionIds.has(session.id)) return false;
            if (filterCompleted === 'completed') return session.attributes?.completed;
            if (filterCompleted === 'incomplete') return !session.attributes?.completed;
            return true;
        }).sort((a, b) => {
            let timeA = 0;
            let timeB = 0;

            if (sortBy === 'start_date') {
                const startA = a.session_start || a.attributes?.session_data?.session_start || a.attributes?.created_at;
                const startB = b.session_start || b.attributes?.session_data?.session_start || b.attributes?.created_at;
                timeA = new Date(startA).getTime();
                timeB = new Date(startB).getTime();
            } else {
                const modA = a.attributes?.updated_at || a.attributes?.created_at;
                const modB = b.attributes?.updated_at || b.attributes?.created_at;
                timeA = new Date(modA).getTime();
                timeB = new Date(modB).getTime();
            }

            if (isNaN(timeA)) timeA = 0;
            if (isNaN(timeB)) timeB = 0;

            return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
        });
    }, [sessions, hiddenSessionIds, filterCompleted, sortBy, sortOrder]);

    // Memoize date formatter
    const formatDate = useCallback((dateString, options = {}) => {
        if (!dateString) return '';
        if (typeof dateString === 'string' && dateString.length === 10 && dateString.includes('-') && !dateString.includes('T')) {
            const [year, month, day] = dateString.split('-').map(Number);
            const date = new Date(year, month - 1, day);
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
        }
        return formatDateInTimezone(dateString, timezone, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            ...options
        });
    }, [timezone]);

    // Memoize session selection handler
    const handleSessionSelect = useCallback((sessionId) => {
        setSelectedSessionId(sessionId);
        setSelectedNoteId(null);
    }, []);

    const totalNotesCount = useMemo(() => {
        return sessions.reduce((count, session) => count + (session.notes?.length || 0), 0);
    }, [sessions]);

    if (sessionsLoading || activitiesLoading) {
        return <div className="page-container" style={{ textAlign: 'center', color: '#666', padding: '40px' }}>Loading sessions...</div>;
    }

    return (
        <div className={styles.pageContainer}>
            {/* Left Panel: Sessions List */}
            <div className={styles.leftPanel}>
                {/* Page Header (Fixed) */}
                <div className={styles.pageHeader}>
                    <div className={styles.headerControls}>
                        <button
                            onClick={() => setFilterCompleted('all')}
                            className={`${styles.filterButton} ${filterCompleted === 'all' ? styles.filterButtonActive : ''}`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => setFilterCompleted('incomplete')}
                            className={`${styles.filterButton} ${filterCompleted === 'incomplete' ? styles.filterButtonActive : ''}`}
                        >
                            Incomplete
                        </button>
                        <button
                            onClick={() => setFilterCompleted('completed')}
                            className={`${styles.filterButton} ${filterCompleted === 'completed' ? styles.filterButtonActive : ''}`}
                        >
                            Completed
                        </button>

                        <div className={styles.divider}></div>

                        <div className={styles.sortGroup}>
                            <span className={styles.sortLabel}>Sort:</span>
                            <button
                                onClick={() => handleSortChange('start_date')}
                                className={`${styles.sortButton} ${sortBy === 'start_date' ? styles.sortButtonActive : ''}`}
                            >
                                Date
                                {sortBy === 'start_date' && (
                                    <span>{sortOrder === 'desc' ? '↓' : '↑'}</span>
                                )}
                            </button>
                            <button
                                onClick={() => handleSortChange('last_modified')}
                                className={`${styles.sortButton} ${sortBy === 'last_modified' ? styles.sortButtonActive : ''}`}
                            >
                                Modified
                                {sortBy === 'last_modified' && (
                                    <span>{sortOrder === 'desc' ? '↓' : '↑'}</span>
                                )}
                            </button>
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
                            onClick={() => setIsNotesPaneOpen((prev) => !prev)}
                            className={`${styles.secondaryButton} ${styles.notesToggleButton}`}
                        >
                            {isNotesPaneOpen ? 'Hide Notes' : `Show Notes${totalNotesCount ? ` (${totalNotesCount})` : ''}`}
                        </button>
                    </div>
                </div>

                {/* Scrollable Sessions List */}
                <div className={styles.sessionsList}>
                    {filteredSessions.length === 0 ? (
                        <div className={styles.emptyState}>
                            No sessions found. Start by clicking "+ ADD SESSION" in the navigation.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {filteredSessions.map(session => (
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

                            {/* Load More Button */}
                            {hasNextPage && (
                                <div className={styles.loadMoreContainer}>
                                    <span className={styles.loadMoreText}>
                                        Showing {sessions.length} of {totalSessions} sessions
                                    </span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
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

            {/* Right Panel: Notes Sidebar */}
            {isNotesPaneOpen && (
                <div className={styles.rightPanel}>
                    <SessionNotesSidebar
                        selectedNoteId={selectedNoteId}
                        sessions={sessions}
                        activities={activities}
                        onSelectSession={setSelectedSessionId}
                        onSelectNote={setSelectedNoteId}
                        onToggleCollapse={() => setIsNotesPaneOpen(false)}
                        isMobile={isMobile}
                    />
                </div>
            )}
        </div>
    );
}

export default Sessions;
