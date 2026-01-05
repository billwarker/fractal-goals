import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import { useHeader } from '../context/HeaderContext';
import { getAchievedTargetsForSession } from '../utils/targetUtils';
import { GOAL_COLORS, getGoalTextColor } from '../utils/goalColors';
import '../App.css';

/**
 * Sessions Page - View and manage practice sessions
 * Displays all practice sessions for the current fractal in card format with horizontal sections
 */
function Sessions() {
    const { rootId } = useParams();
    const navigate = useNavigate();
    // Local page header is now rendered directly


    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterCompleted, setFilterCompleted] = useState('all');
    const [parentGoals, setParentGoals] = useState({});
    const [activities, setActivities] = useState([]);

    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        fetchSessions();
        fetchActivities();
    }, [rootId, navigate]);

    const fetchActivities = async () => {
        try {
            const res = await fractalApi.getActivities(rootId);
            setActivities(res.data);
        } catch (err) {
            console.error("Failed to fetch activities", err);
        }
    };

    // Filter logic removed from header effect


    const fetchSessions = async () => {
        try {
            const res = await fractalApi.getSessions(rootId);
            setSessions(res.data);

            // Fetch parent goals for all sessions
            const allParentIds = new Set();
            res.data.forEach(session => {
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

    const filteredSessions = sessions.filter(session => {
        if (filterCompleted === 'completed') return session.attributes?.completed;
        if (filterCompleted === 'incomplete') return !session.attributes?.completed;
        return true;
    });

    // Helper to format date - handles timezone correctly
    const formatDate = (dateString) => {
        if (!dateString) return '';
        // If it's just a date (YYYY-MM-DD), parse as local date
        if (typeof dateString === 'string' && dateString.length === 10 && dateString.includes('-')) {
            const [year, month, day] = dateString.split('-').map(Number);
            const date = new Date(year, month - 1, day);
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
        }
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    // Helper to format time
    const formatTime = (dateString) => {
        if (!dateString) return '';
        // If it's just a date (no time component), don't show time
        if (typeof dateString === 'string' && dateString.length === 10 && dateString.includes('-')) {
            return '';
        }
        const date = new Date(dateString);
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Helper to get formatted duration from activity instances
    const getDuration = (session) => {
        // Priority 1: Use total_duration_seconds if available (set when session is completed)
        const totalDurationSeconds = session.attributes?.total_duration_seconds;
        if (totalDurationSeconds != null && totalDurationSeconds > 0) {
            const hours = Math.floor(totalDurationSeconds / 3600);
            const minutes = Math.floor((totalDurationSeconds % 3600) / 60);

            if (hours > 0) {
                return `${hours}:${String(minutes).padStart(2, '0')}`;
            }
            return `0:${String(minutes).padStart(2, '0')}`;
        }

        const sessionData = session.attributes?.session_data;

        // Priority 2: Calculate total duration from all activity instances across all sections
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

        // Priority 3: Fallback - Calculate from session_start and session_end
        if (sessionData?.session_start && sessionData?.session_end) {
            const start = new Date(sessionData.session_start);
            const end = new Date(sessionData.session_end);
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

        return '-';
    };

    if (loading) {
        return <div className="page-container" style={{ textAlign: 'center', color: '#666', padding: '40px' }}>Loading sessions...</div>;
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
            {/* Page Header (Fixed) */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '80px 40px 20px 40px', // Top padding to clear fixed nav
                background: 'var(--bg-color)',
                borderBottom: '1px solid #333',
                zIndex: 10
            }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => setFilterCompleted('all')}
                        style={{
                            padding: '6px 12px',
                            background: filterCompleted === 'all' ? '#333' : 'transparent',
                            border: '1px solid #444',
                            borderRadius: '4px',
                            color: filterCompleted === 'all' ? 'white' : '#888',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500
                        }}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setFilterCompleted('incomplete')}
                        style={{
                            padding: '6px 12px',
                            background: filterCompleted === 'incomplete' ? '#333' : 'transparent',
                            border: '1px solid #444',
                            borderRadius: '4px',
                            color: filterCompleted === 'incomplete' ? 'white' : '#888',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500
                        }}
                    >
                        Incomplete
                    </button>
                    <button
                        onClick={() => setFilterCompleted('completed')}
                        style={{
                            padding: '6px 12px',
                            background: filterCompleted === 'completed' ? '#333' : 'transparent',
                            border: '1px solid #444',
                            borderRadius: '4px',
                            color: filterCompleted === 'completed' ? 'white' : '#888',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500
                        }}
                    >
                        Completed
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={() => navigate(`/${rootId}/manage-session-templates`)}
                        style={{
                            padding: '6px 16px',
                            background: '#2196f3',
                            border: 'none',
                            borderRadius: '4px',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        Manage Session Templates
                    </button>
                    <button
                        onClick={() => navigate(`/${rootId}/manage-activities`)}
                        style={{
                            padding: '6px 16px',
                            background: '#333',
                            border: '1px solid #444',
                            borderRadius: '4px',
                            color: '#ccc',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500
                        }}
                    >
                        Manage Activities
                    </button>
                </div>
            </div>

            {/* Scrollable Sessions List */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px 40px',
                paddingBottom: '40px'
            }}>
                {filteredSessions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
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
                                    style={{
                                        background: '#1e1e1e',
                                        border: '1px solid #333',
                                        borderRadius: '8px',
                                        overflow: 'hidden',
                                    }}
                                >
                                    {/* Top Level: High-level session info */}
                                    <div style={{
                                        padding: '16px',
                                        background: '#2a2a2a',
                                        borderBottom: '1px solid #333',
                                        display: 'grid',
                                        gridTemplateColumns: '1.5fr 1.2fr 1fr 1fr 1fr 1fr 0.8fr',
                                        gap: '16px',
                                        alignItems: 'center'
                                    }}>
                                        {/* Session Name (Link) */}
                                        <div>
                                            <Link
                                                to={`/${rootId}/session/${session.id}`}
                                                style={{
                                                    fontWeight: 600,
                                                    fontSize: '16px',
                                                    textDecoration: session.attributes?.completed ? 'line-through' : 'none',
                                                    color: '#2196f3',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {session.name}
                                            </Link>
                                            {session.attributes?.description && (
                                                <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                                                    {session.attributes.description}
                                                </div>
                                            )}
                                        </div>

                                        {/* Program */}
                                        <div>
                                            <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>Program</div>
                                            {session.program_info ? (
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <Link
                                                        to={`/${rootId}/programs/${session.program_info.program_id}`}
                                                        style={{ color: '#2196f3', fontSize: '13px', textDecoration: 'none', fontWeight: 500 }}
                                                    >
                                                        {session.program_info.program_name}
                                                    </Link>
                                                    <span style={{ fontSize: '11px', color: '#666', marginTop: '1px' }}>
                                                        {session.program_info.block_name} • {session.program_info.day_name}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span style={{ color: '#666', fontSize: '12px' }}>-</span>
                                            )}
                                        </div>

                                        {/* Session Start */}
                                        <div>
                                            <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>Session Start</div>
                                            {sessionData?.session_start ? (
                                                <>
                                                    <div style={{ fontSize: '14px' }}>{formatDate(sessionData.session_start)}</div>
                                                    <div style={{ fontSize: '11px', color: '#666' }}>
                                                        {formatTime(sessionData.session_start)}
                                                    </div>
                                                </>
                                            ) : (
                                                <div style={{ fontSize: '12px', color: '#666' }}>-</div>
                                            )}
                                        </div>

                                        {/* Session End */}
                                        <div>
                                            <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>Session End</div>
                                            {sessionData?.session_end ? (
                                                <>
                                                    <div style={{ fontSize: '14px' }}>{formatDate(sessionData.session_end)}</div>
                                                    <div style={{ fontSize: '11px', color: '#666' }}>
                                                        {formatTime(sessionData.session_end)}
                                                    </div>
                                                </>
                                            ) : (
                                                <div style={{ fontSize: '12px', color: '#666' }}>-</div>
                                            )}
                                        </div>

                                        {/* Last Modified */}
                                        <div>
                                            <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>Last Modified</div>
                                            <div style={{ fontSize: '14px' }}>{formatDate(session.attributes?.updated_at)}</div>
                                            <div style={{ fontSize: '11px', color: '#666' }}>
                                                {formatTime(session.attributes?.updated_at)}
                                            </div>
                                        </div>

                                        {/* Duration */}
                                        <div>
                                            <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>Duration</div>
                                            <div style={{ fontSize: '14px', fontWeight: 500 }}>{getDuration(session)}</div>
                                        </div>

                                        {/* Template */}
                                        <div>
                                            <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>Template</div>
                                            {sessionData?.template_name ? (
                                                <span style={{
                                                    background: '#2196f3',
                                                    padding: '4px 8px',
                                                    borderRadius: '3px',
                                                    fontSize: '12px',
                                                    display: 'inline-block',
                                                    color: 'white'
                                                }}>
                                                    {sessionData.template_name}
                                                </span>
                                            ) : (
                                                <span style={{ color: '#666', fontSize: '12px' }}>None</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Parent Goals & Immediate Goals Section */}
                                    {(sessionParentGoals.length > 0 || (session.immediate_goals && session.immediate_goals.length > 0)) && (
                                        <div style={{
                                            padding: '12px 16px',
                                            background: '#252525',
                                            borderBottom: '1px solid #333',
                                            display: 'flex',
                                            gap: '32px'
                                        }}>
                                            {/* Short-Term Goals (left side) */}
                                            {sessionParentGoals.length > 0 && (
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>
                                                        Short-Term Goals:
                                                    </div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                        {sessionParentGoals.map(goal => (
                                                            <div
                                                                key={goal.id}
                                                                style={{
                                                                    padding: '6px 12px',
                                                                    background: '#1e1e1e',
                                                                    border: `1px solid ${GOAL_COLORS.ShortTermGoal}`,
                                                                    borderRadius: '4px',
                                                                    fontSize: '13px',
                                                                    color: GOAL_COLORS.ShortTermGoal
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
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>
                                                        Immediate Goals:
                                                    </div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                        {session.immediate_goals.map(goal => (
                                                            <div
                                                                key={goal.id}
                                                                style={{
                                                                    padding: '6px 12px',
                                                                    background: '#1e1e1e',
                                                                    border: `1px solid ${GOAL_COLORS.ImmediateGoal}`,
                                                                    borderRadius: '4px',
                                                                    fontSize: '13px',
                                                                    color: GOAL_COLORS.ImmediateGoal,
                                                                    textDecoration: goal.completed ? 'line-through' : 'none',
                                                                    opacity: goal.completed ? 0.7 : 1
                                                                }}
                                                            >
                                                                {goal.name}
                                                                {goal.completed && (
                                                                    <span style={{ marginLeft: '6px', color: '#4caf50' }}>✓</span>
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
                                            <div style={{
                                                padding: '12px 16px',
                                                background: '#1a2e1a',
                                                borderBottom: '1px solid #333',
                                                borderLeft: '3px solid #4caf50'
                                            }}>
                                                <div style={{ fontSize: '11px', color: '#81c784', marginBottom: '8px', fontWeight: 600 }}>
                                                    🎯 Targets Achieved ({achievedTargets.length}):
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                    {achievedTargets.map((achieved, idx) => (
                                                        <div
                                                            key={idx}
                                                            style={{
                                                                padding: '6px 12px',
                                                                background: '#2e7d32',
                                                                borderRadius: '4px',
                                                                fontSize: '12px',
                                                                color: 'white',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '6px'
                                                            }}
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
                                    <div style={{ padding: '16px' }}>
                                        {sessionData?.sections && sessionData.sections.length > 0 ? (
                                            <>
                                                {/* Sections Grid - Horizontal Layout */}
                                                <div style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: `repeat(${sessionData.sections.length}, 1fr)`,
                                                    gap: '12px',
                                                    marginBottom: '12px'
                                                }}>
                                                    {sessionData.sections.map((section, sectionIndex) => (
                                                        <div
                                                            key={sectionIndex}
                                                            style={{
                                                                background: '#252525',
                                                                padding: '12px',
                                                                borderRadius: '6px',
                                                                borderLeft: '3px solid #2196f3',
                                                                display: 'flex',
                                                                flexDirection: 'column'
                                                            }}
                                                        >
                                                            {/* Section Header */}
                                                            <div style={{
                                                                fontWeight: 600,
                                                                fontSize: '14px',
                                                                marginBottom: '4px',
                                                                paddingBottom: '8px',
                                                                borderBottom: '1px solid #333'
                                                            }}>
                                                                {section.name}
                                                            </div>

                                                            <div style={{
                                                                fontSize: '11px',
                                                                color: '#888',
                                                                marginBottom: '12px'
                                                            }}>
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
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                                                                                style={{
                                                                                    padding: '8px',
                                                                                    background: '#1e1e1e',
                                                                                    borderRadius: '4px',
                                                                                    fontSize: '13px',
                                                                                    border: exercise.type === 'activity' ? '1px solid #33691e' : 'none'
                                                                                }}
                                                                            >
                                                                                <div style={{ display: 'flex', alignItems: 'start', gap: '6px' }}>
                                                                                    {exercise.type !== 'activity' && (
                                                                                        <span style={{ fontSize: '14px', marginTop: '2px', color: exercise.completed ? '#4caf50' : '#666' }}>
                                                                                            {exercise.completed ? '✓' : '○'}
                                                                                        </span>
                                                                                    )}
                                                                                    <div style={{ flex: 1 }}>
                                                                                        <div style={{
                                                                                            display: 'flex',
                                                                                            justifyContent: 'space-between',
                                                                                            alignItems: 'center',
                                                                                            marginBottom: '2px'
                                                                                        }}>
                                                                                            <div style={{
                                                                                                fontWeight: 500,
                                                                                                textDecoration: exercise.completed ? 'line-through' : 'none',
                                                                                                color: exercise.completed ? '#888' : 'white'
                                                                                            }}>
                                                                                                {exercise.name}
                                                                                            </div>

                                                                                            {/* Duration for activities */}
                                                                                            {exercise.instance_id && exercise.duration_seconds != null && (
                                                                                                <div style={{
                                                                                                    fontSize: '11px',
                                                                                                    color: '#4caf50',
                                                                                                    fontWeight: 'bold',
                                                                                                    fontFamily: 'monospace'
                                                                                                }}>
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
                                                                                            <div style={{ marginTop: '4px', fontSize: '12px', color: '#ccc' }}>
                                                                                                {/* Sets View */}
                                                                                                {exercise.has_sets && exercise.sets && exercise.sets.length > 0 && (
                                                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '8px', borderLeft: '2px solid #333', marginTop: '6px' }}>
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
                                                                                                                    <div key={setIdx} style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                                                                                                                        <span style={{ color: '#666', fontSize: '11px', width: '40px', paddingTop: '2px' }}>SET {setIdx + 1}</span>
                                                                                                                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
                                                                                                                            {Object.entries(metricsBySplit).map(([splitId, metrics]) => {
                                                                                                                                const sInfo = getSplitInfo(splitId);
                                                                                                                                return (
                                                                                                                                    <div key={splitId} style={{ background: '#1a1a1a', padding: '6px 8px', borderRadius: '3px', border: '1px solid #333' }}>
                                                                                                                                        <div style={{ fontSize: '11px', color: '#aaa', fontWeight: 'bold', marginBottom: '4px' }}>{sInfo.name}</div>
                                                                                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                                                                                            {metrics.map(m => {
                                                                                                                                                const mInfo = getMetricInfo(m.metric_id);
                                                                                                                                                return (
                                                                                                                                                    <div key={m.metric_id} style={{ display: 'flex', gap: '4px' }}>
                                                                                                                                                        <span style={{ color: '#888' }}>{mInfo.name}:</span>
                                                                                                                                                        <span style={{ fontWeight: 'bold' }}>{m.value} {mInfo.unit}</span>
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
                                                                                                                    <div key={setIdx} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                                                                                        <span style={{ color: '#666', fontSize: '11px', width: '40px' }}>SET {setIdx + 1}</span>
                                                                                                                        {metricsToDisplay.map(m => {
                                                                                                                            const mInfo = getMetricInfo(m.metric_id);
                                                                                                                            return (
                                                                                                                                <div key={m.metric_id} style={{ display: 'flex', gap: '4px' }}>
                                                                                                                                    <span style={{ color: '#888' }}>{mInfo.name}:</span>
                                                                                                                                    <span style={{ fontWeight: 'bold' }}>{m.value} {mInfo.unit}</span>
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
                                                                                                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '4px' }}>
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
                                                                                                                <div key={`${m.metric_id}-${m.split_id || 'no-split'}`} style={{ background: '#263238', padding: '2px 8px', borderRadius: '3px', border: '1px solid #37474F' }}>
                                                                                                                    <span style={{ color: '#aaa', marginRight: '4px' }}>
                                                                                                                        {sInfo.name ? `${sInfo.name} - ${mInfo.name}` : mInfo.name}:
                                                                                                                    </span>
                                                                                                                    <span style={{ fontWeight: 'bold' }}>{m.value} {mInfo.unit}</span>
                                                                                                                </div>
                                                                                                            )
                                                                                                        })}
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                        )}

                                                                                        {exercise.description && (
                                                                                            <div style={{
                                                                                                fontSize: '11px',
                                                                                                color: '#888',
                                                                                                marginTop: '4px',
                                                                                                marginBottom: '4px'
                                                                                            }}>
                                                                                                {exercise.description}
                                                                                            </div>
                                                                                        )}
                                                                                        {exercise.notes && (
                                                                                            <div style={{
                                                                                                fontSize: '11px',
                                                                                                color: '#4caf50',
                                                                                                fontStyle: 'italic'
                                                                                            }}>
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
                                                    <div style={{
                                                        padding: '12px',
                                                        background: '#252525',
                                                        borderRadius: '6px',
                                                        borderLeft: '3px solid #ff9800'
                                                    }}>
                                                        <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>
                                                            Session Notes:
                                                        </div>
                                                        <div style={{ fontSize: '13px' }}>{sessionData.notes}</div>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <p style={{ color: '#666', textAlign: 'center', padding: '20px', margin: 0 }}>
                                                No session data available
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

export default Sessions;
