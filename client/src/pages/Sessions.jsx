import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import { getAchievedTargetsForSession } from '../utils/targetUtils';
import { useTheme } from '../contexts/ThemeContext';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatDateInTimezone } from '../utils/dateUtils';
import { SessionNotesSidebar } from '../components/sessions';
import '../App.css';
import styles from './Sessions.module.css';

/**
 * Sessions Page - View and manage practice sessions
 * Displays all practice sessions for the current fractal in card format with horizontal sections
 */
function Sessions() {
    const { getGoalColor } = useTheme();
    const { rootId } = useParams();
    const navigate = useNavigate();
    const { timezone } = useTimezone();
    // Local page header is now rendered directly


    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterCompleted, setFilterCompleted] = useState('all');
    const [parentGoals, setParentGoals] = useState({});
    const [activities, setActivities] = useState([]);
    const [selectedSessionId, setSelectedSessionId] = useState(null);
    const [selectedNoteId, setSelectedNoteId] = useState(null);
    const [sortBy, setSortBy] = useState('start_date'); // 'start_date' | 'last_modified'
    const [sortOrder, setSortOrder] = useState('desc'); // 'asc' | 'desc'

    // Pagination state
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [totalSessions, setTotalSessions] = useState(0);
    const SESSIONS_PER_PAGE = 10;

    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        fetchSessions();
        fetchActivities();
    }, [rootId, navigate]);

    // Scroll to selected session
    useEffect(() => {
        if (selectedSessionId) {
            const el = document.getElementById(`session-card-${selectedSessionId}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [selectedSessionId]);
    /* ... skipped ... */
    <SessionNotesSidebar
        rootId={rootId}
        selectedSessionId={selectedSessionId}
        selectedNoteId={selectedNoteId}
        sessions={sessions}
        activities={activities}
        onSelectSession={setSelectedSessionId}
        onSelectNote={setSelectedNoteId}
    />

    const fetchActivities = async () => {
        try {
            const res = await fractalApi.getActivities(rootId);
            setActivities(res.data);
        } catch (err) {
            console.error("Failed to fetch activities", err);
        }
    };

    const handleSortChange = (criteria) => {
        if (sortBy === criteria) {
            // Toggle order if clicking same criteria
            setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
        } else {
            // New criteria, default to desc
            setSortBy(criteria);
            setSortOrder('desc');
        }
    };

    // Filter logic removed from header effect


    const fetchSessions = async (reset = true) => {
        try {
            const res = await fractalApi.getSessions(rootId, { limit: SESSIONS_PER_PAGE, offset: 0 });
            const { sessions: sessionsData, pagination } = res.data;

            setSessions(sessionsData);
            setHasMore(pagination.has_more);
            setTotalSessions(pagination.total);

            // Fetch parent goals for all sessions
            const allParentIds = new Set();
            sessionsData.forEach(session => {
                if (session.attributes?.parent_ids) {
                    session.attributes.parent_ids.forEach(id => allParentIds.add(id));
                }
            });

            // Fetch goal details for all parent IDs
            const goalsMap = {};
            for (const goalId of allParentIds) {
                try {
                    const goalRes = await fractalApi.getGoal(rootId, goalId);
                    goalsMap[goalId] = goalRes.data;
                } catch (err) {
                    console.error(`Failed to fetch goal ${goalId}`, err);
                }
            }
            setParentGoals(goalsMap);
            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch practice sessions", err);
            setLoading(false);
            if (err.response?.status === 404) {
                navigate('/');
            }
        }
    };

    const loadMoreSessions = async () => {
        if (loadingMore || !hasMore) return;

        setLoadingMore(true);
        try {
            const res = await fractalApi.getSessions(rootId, {
                limit: SESSIONS_PER_PAGE,
                offset: sessions.length
            });
            const { sessions: newSessions, pagination } = res.data;

            // Append new sessions to existing
            setSessions(prev => [...prev, ...newSessions]);
            setHasMore(pagination.has_more);

            // Fetch parent goals for new sessions only
            const allParentIds = new Set();
            newSessions.forEach(session => {
                if (session.attributes?.parent_ids) {
                    session.attributes.parent_ids.forEach(id => {
                        // Only fetch if not already in parentGoals
                        if (!parentGoals[id]) {
                            allParentIds.add(id);
                        }
                    });
                }
            });

            if (allParentIds.size > 0) {
                const newGoalsMap = { ...parentGoals };
                for (const goalId of allParentIds) {
                    try {
                        const goalRes = await fractalApi.getGoal(rootId, goalId);
                        newGoalsMap[goalId] = goalRes.data;
                    } catch (err) {
                        console.error(`Failed to fetch goal ${goalId}`, err);
                    }
                }
                setParentGoals(newGoalsMap);
            }
        } catch (err) {
            console.error("Failed to load more sessions", err);
        } finally {
            setLoadingMore(false);
        }
    };

    const filteredSessions = sessions.filter(session => {
        if (filterCompleted === 'completed') return session.attributes?.completed;
        if (filterCompleted === 'incomplete') return !session.attributes?.completed;
        return true;
    }).sort((a, b) => {
        let timeA = 0;
        let timeB = 0;

        if (sortBy === 'start_date') {
            // Try canonical column first, then session_data, then created_at
            const startA = a.session_start || a.attributes?.session_data?.session_start || a.attributes?.created_at;
            const startB = b.session_start || b.attributes?.session_data?.session_start || b.attributes?.created_at;
            timeA = new Date(startA).getTime();
            timeB = new Date(startB).getTime();
        } else {
            // Last modified
            const modA = a.attributes?.updated_at || a.attributes?.created_at;
            const modB = b.attributes?.updated_at || b.attributes?.created_at;
            timeA = new Date(modA).getTime();
            timeB = new Date(modB).getTime();
        }

        if (isNaN(timeA)) timeA = 0;
        if (isNaN(timeB)) timeB = 0;

        return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
    });

    // Helper to format date - handles timezone correctly
    const formatDate = (dateString, options = {}) => {
        if (!dateString) return '';
        // If it's just a date (YYYY-MM-DD), parse as local date
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
    };

    // Helper to format time
    const formatTime = (dateString) => {
        if (!dateString) return '';
        // If it's just a date (no time component), don't show time
        if (typeof dateString === 'string' && dateString.length === 10 && dateString.includes('-') && !dateString.includes('T')) {
            return '';
        }
        // Extract time part using formatDateInTimezone
        const formatted = formatDateInTimezone(dateString, timezone, {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });

        // If formatDateInTimezone returns a full date string for some reason, try to parse just time, 
        // but typically with these options it returns just the time part if dealing with known locale.
        // Actually, Intl.DateTimeFormat with only time options returns only time.
        return formatted;
    };

    // Helper to get formatted duration from activity instances
    const getDuration = (session) => {
        const sessionData = session.attributes?.session_data;

        // Priority 1: Calculate from session_start and session_end
        // This is the most accurate reflection of the "wall clock" duration
        if (sessionData?.session_start && sessionData?.session_end) {
            const start = new Date(sessionData.session_start);
            const end = new Date(sessionData.session_end);

            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                const diffSeconds = Math.floor((end - start) / 1000);

                if (diffSeconds > 0) {
                    const hours = Math.floor(diffSeconds / 3600);
                    const minutes = Math.floor((diffSeconds % 3600) / 60);

                    if (hours > 0) {
                        return `${hours}:${String(minutes).padStart(2, '0')}`;
                    }
                    return `0:${String(minutes).padStart(2, '0')}`;
                }
            }
        }

        // Priority 2: Use total_duration_seconds if available (set when session is completed)
        const totalDurationSeconds = session.attributes?.total_duration_seconds;
        if (totalDurationSeconds != null && totalDurationSeconds > 0) {
            const hours = Math.floor(totalDurationSeconds / 3600);
            const minutes = Math.floor((totalDurationSeconds % 3600) / 60);

            if (hours > 0) {
                return `${hours}:${String(minutes).padStart(2, '0')}`;
            }
            return `0:${String(minutes).padStart(2, '0')}`;
        }

        // Priority 3: Calculate total duration from all activity instances across all sections
        let totalSeconds = 0;
        if (sessionData?.sections) {
            for (const section of sessionData.sections) {
                if (section.exercises) {
                    for (const exercise of section.exercises) {
                        if (exercise.instance_id && exercise.duration_seconds != null) {
                            totalSeconds += exercise.duration_seconds;
                        }
                    }
                }
            }
        }

        // If we have activity durations, use them
        if (totalSeconds > 0) {
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);

            if (hours > 0) {
                return `${hours}:${String(minutes).padStart(2, '0')}`;
            }
            return `0:${String(minutes).padStart(2, '0')}`;
        }

        return '-';
    };

    if (loading) {
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

                        {/* Divider */}
                        <div className={styles.divider}></div>

                        {/* Sort Controls */}
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
                            {filteredSessions.map(session => {
                                const sessionData = session.attributes?.session_data;
                                const sessionParentGoals = (session.attributes?.parent_ids || [])
                                    .map(id => parentGoals[id])
                                    .filter(Boolean);

                                return (
                                    <div
                                        key={session.id}
                                        id={`session-card-${session.id}`}
                                        onClick={() => {
                                            setSelectedSessionId(session.id);
                                            setSelectedNoteId(null);
                                        }}
                                        className={`${styles.sessionCard} ${selectedSessionId === session.id ? styles.sessionCardSelected : ''}`}
                                    >
                                        {/* Top Level: High-level session info */}
                                        <div className={styles.cardTopLevel}>
                                            {/* Session Name (Link) */}
                                            <div>
                                                <Link
                                                    to={`/${rootId}/session/${session.id}`}
                                                    className={`${styles.cardHeaderTitle} ${session.attributes?.completed ? styles.cardHeaderTitleCompleted : ''}`}
                                                >
                                                    {session.name}
                                                </Link>
                                                {session.attributes?.description && (
                                                    <div className={styles.cardDescription}>
                                                        {session.attributes.description}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Program */}
                                            <div>
                                                <div className={styles.fieldLabel}>Program</div>
                                                {session.program_info ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <Link
                                                            to={`/${rootId}/programs/${session.program_info.program_id}`}
                                                            className={styles.programLink}
                                                        >
                                                            {session.program_info.program_name}
                                                        </Link>
                                                        <span className={styles.programSubtext}>
                                                            {session.program_info.block_name} • {session.program_info.day_name}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className={styles.fieldValueMuted}>-</span>
                                                )}
                                            </div>

                                            {/* Session Start */}
                                            <div>
                                                <div className={styles.fieldLabel}>Session Start</div>
                                                {sessionData?.session_start ? (
                                                    <div className={styles.fieldValue}>{formatDate(sessionData.session_start)}</div>
                                                ) : (
                                                    <div className={styles.fieldValueMuted}>-</div>
                                                )}
                                            </div>

                                            {/* Session End */}
                                            <div>
                                                <div className={styles.fieldLabel}>Session End</div>
                                                {sessionData?.session_end ? (
                                                    <div className={styles.fieldValue}>{formatDate(sessionData.session_end)}</div>
                                                ) : (
                                                    <div className={styles.fieldValueMuted}>-</div>
                                                )}
                                            </div>

                                            {/* Last Modified */}
                                            <div>
                                                <div className={styles.fieldLabel}>Last Modified</div>
                                                <div className={styles.fieldValue}>{formatDate(session.attributes?.updated_at)}</div>
                                            </div>

                                            {/* Duration */}
                                            <div>
                                                <div className={styles.fieldLabel}>Duration</div>
                                                <div className={styles.fieldValue} style={{ fontWeight: 500 }}>{getDuration(session)}</div>
                                            </div>

                                            {/* Template */}
                                            <div>
                                                <div className={styles.fieldLabel}>Template</div>
                                                {sessionData?.template_name ? (
                                                    <span className={styles.templateBadge}>
                                                        {sessionData.template_name}
                                                    </span>
                                                ) : (
                                                    <span className={styles.fieldValueMuted}>None</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Parent Goals & Immediate Goals Section */}
                                        {(sessionParentGoals.length > 0 || (session.immediate_goals && session.immediate_goals.length > 0)) && (
                                            <div className={styles.goalsSection}>
                                                {/* Short-Term Goals (left side) */}
                                                {sessionParentGoals.length > 0 && (
                                                    <div className={styles.goalsColumn}>
                                                        <div className={styles.fieldLabel} style={{ marginBottom: '8px' }}>
                                                            Short-Term Goals:
                                                        </div>
                                                        <div className={styles.goalsList}>
                                                            {sessionParentGoals.map(goal => (
                                                                <div
                                                                    key={goal.id}
                                                                    className={styles.goalTag}
                                                                    style={{
                                                                        border: `1px solid ${getGoalColor('ShortTermGoal')}`,
                                                                        color: getGoalColor('ShortTermGoal')
                                                                    }}
                                                                >
                                                                    {goal.name}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Immediate Goals (right side) - using new junction table data */}
                                                {session.immediate_goals && session.immediate_goals.length > 0 && (
                                                    <div className={styles.goalsColumn}>
                                                        <div className={styles.fieldLabel} style={{ marginBottom: '8px' }}>
                                                            Immediate Goals:
                                                        </div>
                                                        <div className={styles.goalsList}>
                                                            {session.immediate_goals.map(goal => (
                                                                <div
                                                                    key={goal.id}
                                                                    className={`${styles.goalTag} ${goal.completed ? styles.goalTagCompleted : ''}`}
                                                                    style={{
                                                                        border: `1px solid ${getGoalColor('ImmediateGoal')}`,
                                                                        color: getGoalColor('ImmediateGoal')
                                                                    }}
                                                                >
                                                                    {goal.name}
                                                                    {goal.completed && (
                                                                        <span className={styles.checkMark}>✓</span>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Achieved Targets Section */}
                                        {(() => {
                                            const achievedTargets = getAchievedTargetsForSession(session, sessionParentGoals);
                                            if (achievedTargets.length === 0) return null;

                                            return (
                                                <div className={styles.achievedSection}>
                                                    <div className={styles.achievedHeader}>
                                                        🎯 Targets Achieved ({achievedTargets.length}):
                                                    </div>
                                                    <div className={styles.goalsList}>
                                                        {achievedTargets.map((achieved, idx) => (
                                                            <div
                                                                key={idx}
                                                                className={styles.achievedTag}
                                                            >
                                                                <span>✓</span>
                                                                <span>{achieved.target.name || 'Target'}</span>
                                                                <span style={{ fontSize: '10px', opacity: 0.8 }}>({achieved.goalName})</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* Bottom Level: Session data with horizontal sections */}
                                        <div className={styles.cardBottomLevel}>
                                            {sessionData?.sections && sessionData.sections.length > 0 ? (
                                                <>
                                                    {/* Sections Grid - Horizontal Layout */}
                                                    <div className={styles.sectionsGrid} style={{ gridTemplateColumns: `repeat(${sessionData.sections.length}, 1fr)` }}>
                                                        {sessionData.sections.map((section, sectionIndex) => (
                                                            <div
                                                                key={sectionIndex}
                                                                className={styles.sectionColumn}
                                                            >
                                                                {/* Section Header */}
                                                                <div className={styles.sectionHeader}>
                                                                    {section.name}
                                                                </div>

                                                                <div className={styles.sectionDuration}>
                                                                    {(() => {
                                                                        // Calculate section duration from activities
                                                                        let sectionSeconds = 0;
                                                                        if (section.exercises) {
                                                                            for (const ex of section.exercises) {
                                                                                if (ex.instance_id && ex.duration_seconds != null) {
                                                                                    sectionSeconds += ex.duration_seconds;
                                                                                }
                                                                            }
                                                                        }

                                                                        if (sectionSeconds > 0) {
                                                                            const mins = Math.floor(sectionSeconds / 60);
                                                                            const secs = sectionSeconds % 60;
                                                                            return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                                                                        }
                                                                        return `${section.duration_minutes || 0} min (planned)`;
                                                                    })()}
                                                                </div>

                                                                {/* Exercises - Vertical List */}
                                                                {section.exercises && section.exercises.length > 0 && (
                                                                    <div className={styles.exercisesList}>
                                                                        {section.exercises.map((exercise, exerciseIndex) => {
                                                                            const actDef = exercise.type === 'activity' ? activities.find(a => a.id === exercise.activity_id) : null;

                                                                            const getMetricInfo = (metricId) => {
                                                                                if (!actDef) return { name: '', unit: '' };
                                                                                const m = actDef.metric_definitions.find(md => md.id === metricId);
                                                                                return m || { name: '', unit: '' };
                                                                            };

                                                                            const getSplitInfo = (splitId) => {
                                                                                if (!actDef || !splitId) return { name: '' };
                                                                                const s = actDef.split_definitions?.find(sd => sd.id === splitId);
                                                                                return s || { name: '' };
                                                                            };

                                                                            return (
                                                                                <div
                                                                                    key={exerciseIndex}
                                                                                    className={`${styles.exerciseCard} ${exercise.type === 'activity' ? styles.exerciseCardActivity : ''}`}
                                                                                >
                                                                                    <div className={styles.exerciseHeader}>
                                                                                        {exercise.type !== 'activity' && (
                                                                                            <span className={`${styles.completionIcon} ${exercise.completed ? styles.completionIconCompleted : ''}`}>
                                                                                                {exercise.completed ? '✓' : '○'}
                                                                                            </span>
                                                                                        )}
                                                                                        <div style={{ flex: 1 }}>
                                                                                            <div className={styles.exerciseTitleRow}>
                                                                                                <div className={`${styles.exerciseName} ${exercise.completed ? styles.exerciseNameCompleted : ''}`}>
                                                                                                    {exercise.name}
                                                                                                </div>

                                                                                                {/* Duration for activities */}
                                                                                                {exercise.instance_id && exercise.duration_seconds != null && (
                                                                                                    <div className={styles.activityDuration}>
                                                                                                        {(() => {
                                                                                                            const mins = Math.floor(exercise.duration_seconds / 60);
                                                                                                            const secs = exercise.duration_seconds % 60;
                                                                                                            return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                                                                                                        })()}
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>

                                                                                            {/* Activity Data Display */}
                                                                                            {exercise.type === 'activity' && (
                                                                                                <div className={styles.activityData}>
                                                                                                    {/* Sets View */}
                                                                                                    {exercise.has_sets && exercise.sets && exercise.sets.length > 0 && (
                                                                                                        <div className={styles.setsContainer}>
                                                                                                            {exercise.sets.map((set, setIdx) => {
                                                                                                                const hasSplits = actDef?.has_splits && actDef?.split_definitions?.length > 0;

                                                                                                                // Group metrics by split if activity has splits
                                                                                                                const metricsToDisplay = set.metrics?.filter(m => {
                                                                                                                    const mInfo = getMetricInfo(m.metric_id);
                                                                                                                    if (hasSplits) {
                                                                                                                        return mInfo.name && m.value && m.split_id;
                                                                                                                    }
                                                                                                                    return mInfo.name && m.value && !m.split_id;
                                                                                                                }) || [];

                                                                                                                if (hasSplits) {
                                                                                                                    // Group by split
                                                                                                                    const metricsBySplit = {};
                                                                                                                    metricsToDisplay.forEach(m => {
                                                                                                                        if (!metricsBySplit[m.split_id]) {
                                                                                                                            metricsBySplit[m.split_id] = [];
                                                                                                                        }
                                                                                                                        metricsBySplit[m.split_id].push(m);
                                                                                                                    });

                                                                                                                    return (
                                                                                                                        <div key={setIdx} className={styles.setRow} style={{ alignItems: 'start' }}>
                                                                                                                            <span className={`${styles.setLabel} ${styles.setLabelWithTopPadding}`}>SET {setIdx + 1}</span>
                                                                                                                            <div className={styles.metricsGroup}>
                                                                                                                                {Object.entries(metricsBySplit).map(([splitId, metrics]) => {
                                                                                                                                    const sInfo = getSplitInfo(splitId);
                                                                                                                                    return (
                                                                                                                                        <div key={splitId} className={styles.splitGroup}>
                                                                                                                                            <div className={styles.splitHeader}>{sInfo.name}</div>
                                                                                                                                            <div className={styles.splitMetricsList}>
                                                                                                                                                {metrics.map(m => {
                                                                                                                                                    const mInfo = getMetricInfo(m.metric_id);
                                                                                                                                                    return (
                                                                                                                                                        <div key={m.metric_id} className={styles.metricItem}>
                                                                                                                                                            <span className={styles.metricName}>{mInfo.name}:</span>
                                                                                                                                                            <span className={styles.metricValue}>{m.value} {mInfo.unit}</span>
                                                                                                                                                        </div>
                                                                                                                                                    );
                                                                                                                                                })}
                                                                                                                                            </div>
                                                                                                                                        </div>
                                                                                                                                    );
                                                                                                                                })}
                                                                                                                            </div>
                                                                                                                        </div>
                                                                                                                    );
                                                                                                                } else {
                                                                                                                    // No splits - original horizontal layout
                                                                                                                    return (
                                                                                                                        <div key={setIdx} className={styles.setRow}>
                                                                                                                            <span className={styles.setLabel}>SET {setIdx + 1}</span>
                                                                                                                            {metricsToDisplay.map(m => {
                                                                                                                                const mInfo = getMetricInfo(m.metric_id);
                                                                                                                                return (
                                                                                                                                    <div key={m.metric_id} className={styles.metricItem}>
                                                                                                                                        <span className={styles.metricName}>{mInfo.name}:</span>
                                                                                                                                        <span className={styles.metricValue}>{m.value} {mInfo.unit}</span>
                                                                                                                                    </div>
                                                                                                                                );
                                                                                                                            })}
                                                                                                                        </div>
                                                                                                                    );
                                                                                                                }
                                                                                                            })}
                                                                                                        </div>
                                                                                                    )}

                                                                                                    {/* Single Metrics View */}
                                                                                                    {!exercise.has_sets && actDef?.metric_definitions?.length > 0 && exercise.metrics && (
                                                                                                        <div className={styles.singleMetricsContainer}>
                                                                                                            {exercise.metrics.filter(m => {
                                                                                                                const mInfo = getMetricInfo(m.metric_id);
                                                                                                                // If activity has splits, only show metrics with split_id
                                                                                                                // Otherwise, only show metrics without split_id
                                                                                                                const hasSplits = actDef?.has_splits && actDef?.split_definitions?.length > 0;
                                                                                                                if (hasSplits) {
                                                                                                                    return mInfo.name && m.value && m.split_id;
                                                                                                                }
                                                                                                                return mInfo.name && m.value && !m.split_id;
                                                                                                            }).map(m => {
                                                                                                                const mInfo = getMetricInfo(m.metric_id);
                                                                                                                const sInfo = getSplitInfo(m.split_id);
                                                                                                                return (
                                                                                                                    <div key={`${m.metric_id}-${m.split_id || 'no-split'}`} className={styles.metricBadge}>
                                                                                                                        <span className={styles.metricBadgeLabel}>
                                                                                                                            {sInfo.name ? `${sInfo.name} - ${mInfo.name}` : mInfo.name}:
                                                                                                                        </span>
                                                                                                                        <span className={styles.metricValue}>{m.value} {mInfo.unit}</span>
                                                                                                                    </div>
                                                                                                                )
                                                                                                            })}
                                                                                                        </div>
                                                                                                    )}
                                                                                                </div>
                                                                                            )}

                                                                                            {exercise.description && (
                                                                                                <div className={styles.description}>
                                                                                                    {exercise.description}
                                                                                                </div>
                                                                                            )}
                                                                                            {exercise.notes && (
                                                                                                <div className={styles.notes}>
                                                                                                    💡 {exercise.notes}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Session Notes */}
                                                    {sessionData.notes && (
                                                        <div className={styles.sessionNotes}>
                                                            <div className={styles.sessionNotesHeader}>
                                                                Session Notes:
                                                            </div>
                                                            <div className={styles.sessionNotesBody}>{sessionData.notes}</div>
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <p className={styles.emptyState} style={{ padding: '20px', margin: 0 }}>
                                                    No session data available
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Load More Button */}
                            {hasMore && (
                                <div className={styles.loadMoreContainer}>
                                    <span className={styles.loadMoreText}>
                                        Showing {sessions.length} of {totalSessions} sessions
                                    </span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            loadMoreSessions();
                                        }}
                                        disabled={loadingMore}
                                        className={`${styles.loadMoreButton} ${loadingMore ? styles.loadMoreButtonDisabled : ''}`}
                                    >
                                        {loadingMore ? (
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
            <div className={styles.rightPanel}>
                <SessionNotesSidebar
                    rootId={rootId}
                    selectedSessionId={selectedSessionId}
                    selectedNoteId={selectedNoteId}
                    sessions={sessions}
                    activities={activities}
                    onSelectSession={setSelectedSessionId}
                    onSelectNote={setSelectedNoteId}
                />
            </div>
        </div>
    );
}

export default Sessions;
