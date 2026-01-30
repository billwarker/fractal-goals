import React, { useMemo } from 'react';

/**
 * StreakTimeline - Visual timeline showing streaks and breaks
 * Highlights consecutive days with activity and gaps between them
 * 
 * @param {Array} sessions - Array of session objects with session_start dates
 */
function StreakTimeline({ sessions = [] }) {
    // Calculate streaks and breaks
    const { streaks, currentStreak, longestStreak, totalActiveDays } = useMemo(() => {
        if (sessions.length === 0) {
            return { streaks: [], currentStreak: 0, longestStreak: 0, totalActiveDays: 0 };
        }

        // Get unique dates with sessions
        const sessionDates = new Set();
        sessions.forEach(session => {
            const sessionDate = session.session_start || session.created_at;
            if (sessionDate) {
                const date = new Date(sessionDate);
                sessionDates.add(date.toISOString().split('T')[0]);
            }
        });

        const sortedDates = Array.from(sessionDates).sort();
        if (sortedDates.length === 0) {
            return { streaks: [], currentStreak: 0, longestStreak: 0, totalActiveDays: 0 };
        }

        // Build streak segments
        const segments = [];
        let streakStart = sortedDates[0];
        let streakEnd = sortedDates[0];
        let streakLength = 1;

        for (let i = 1; i < sortedDates.length; i++) {
            const currentDate = new Date(sortedDates[i]);
            const prevDate = new Date(sortedDates[i - 1]);
            const diffDays = Math.round((currentDate - prevDate) / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                // Consecutive day - extend streak
                streakEnd = sortedDates[i];
                streakLength++;
            } else {
                // Break in streak - save current streak and start new one
                segments.push({
                    type: 'streak',
                    start: streakStart,
                    end: streakEnd,
                    length: streakLength
                });

                // Add break segment
                segments.push({
                    type: 'break',
                    start: streakEnd,
                    end: sortedDates[i],
                    length: diffDays - 1
                });

                // Start new streak
                streakStart = sortedDates[i];
                streakEnd = sortedDates[i];
                streakLength = 1;
            }
        }

        // Add final streak
        segments.push({
            type: 'streak',
            start: streakStart,
            end: streakEnd,
            length: streakLength
        });

        // Calculate current streak (if most recent session was today or yesterday)
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const lastSessionDate = sortedDates[sortedDates.length - 1];

        let current = 0;
        if (lastSessionDate === today || lastSessionDate === yesterday) {
            // Count backwards from today
            let checkDate = new Date(lastSessionDate);
            while (sessionDates.has(checkDate.toISOString().split('T')[0])) {
                current++;
                checkDate.setDate(checkDate.getDate() - 1);
            }
        }

        // Find longest streak
        const longest = Math.max(...segments.filter(s => s.type === 'streak').map(s => s.length), 0);

        return {
            streaks: segments,
            currentStreak: current,
            longestStreak: longest,
            totalActiveDays: sortedDates.length
        };
    }, [sessions]);

    // Get recent streaks for display (last 90 days worth)
    const recentStreaks = useMemo(() => {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const cutoffStr = ninetyDaysAgo.toISOString().split('T')[0];

        return streaks.filter(s => s.end >= cutoffStr).slice(-10);
    }, [streaks]);

    const formatDate = (dateStr) => {
        const date = new Date(dateStr + 'T00:00:00');
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    // Calculate width percentages for visualization
    const maxLength = Math.max(...recentStreaks.map(s => s.length), 1);

    return (
        <div style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '20px'
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px'
            }}>
                <h3 style={{
                    margin: 0,
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--color-text-secondary)'
                }}>
                    🔥 Streak Timeline
                </h3>
            </div>

            {/* Streak Stats */}
            <div style={{
                display: 'flex',
                gap: '24px',
                marginBottom: '24px',
                padding: '16px',
                background: 'var(--color-bg-surface)',
                borderRadius: '6px'
            }}>
                <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{
                        fontSize: '28px',
                        fontWeight: 'bold',
                        color: currentStreak > 0 ? 'var(--color-warning)' : 'var(--color-text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                    }}>
                        {currentStreak > 0 && '🔥'} {currentStreak}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Current Streak
                    </div>
                </div>
                <div style={{ width: '1px', background: 'var(--color-border)' }} />
                <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--color-success)' }}>
                        {longestStreak}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Longest Streak
                    </div>
                </div>
                <div style={{ width: '1px', background: 'var(--color-border)' }} />
                <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--color-brand-primary)' }}>
                        {totalActiveDays}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Total Active Days
                    </div>
                </div>
            </div>

            {/* Timeline Visualization */}
            {recentStreaks.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{
                        fontSize: '11px',
                        color: 'var(--color-text-muted)',
                        marginBottom: '8px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>
                        Recent Activity (Last 90 Days)
                    </div>
                    {recentStreaks.map((segment, index) => (
                        <div
                            key={index}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px'
                            }}
                        >
                            {/* Date range */}
                            <div style={{
                                width: '140px',
                                fontSize: '11px',
                                color: segment.type === 'streak' ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
                                fontFamily: 'monospace'
                            }}>
                                {segment.type === 'streak'
                                    ? `${formatDate(segment.start)} - ${formatDate(segment.end)}`
                                    : `— ${segment.length} day break —`
                                }
                            </div>

                            {/* Visual bar */}
                            {segment.type === 'streak' && (
                                <>
                                    <div style={{
                                        flex: 1,
                                        height: '24px',
                                        background: 'var(--color-bg-input)', // Empty track
                                        borderRadius: '4px',
                                        overflow: 'hidden',
                                        position: 'relative'
                                    }}>
                                        <div style={{
                                            width: `${Math.max(10, (segment.length / maxLength) * 100)}%`,
                                            height: '100%',
                                            background: segment.length >= 7
                                                ? 'linear-gradient(90deg, var(--color-success), #8bc34a)'
                                                : segment.length >= 3
                                                    ? 'linear-gradient(90deg, var(--color-warning), #ffc107)'
                                                    : 'var(--color-text-muted)',
                                            borderRadius: '4px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            paddingLeft: '8px',
                                            transition: 'width 0.3s ease'
                                        }}>
                                            <span style={{
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                color: '#fff', // Keep white for contrast on colored bars
                                                textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                                            }}>
                                                {segment.length} day{segment.length !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Badge for long streaks */}
                                    {segment.length >= 7 && (
                                        <div style={{
                                            padding: '4px 8px',
                                            background: segment.length >= 14 ? 'var(--color-success)' : 'var(--color-warning)',
                                            borderRadius: '4px',
                                            fontSize: '10px',
                                            fontWeight: 600,
                                            color: '#fff'
                                        }}>
                                            {segment.length >= 14 ? '🏆 Great!' : '⭐ Nice!'}
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Break indicator */}
                            {segment.type === 'break' && (
                                <div style={{
                                    flex: 1,
                                    height: '2px',
                                    background: segment.length >= 7
                                        ? 'repeating-linear-gradient(90deg, var(--color-error), var(--color-error) 4px, transparent 4px, transparent 8px)'
                                        : 'repeating-linear-gradient(90deg, var(--color-text-muted), var(--color-text-muted) 4px, transparent 4px, transparent 8px)',
                                    opacity: 0.6
                                }} />
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{
                    textAlign: 'center',
                    color: 'var(--color-text-muted)',
                    padding: '40px 20px',
                    fontSize: '13px'
                }}>
                    No session data available yet. Complete your first session to start tracking streaks!
                </div>
            )}

            {/* Motivational message based on current streak */}
            {currentStreak > 0 && (
                <div style={{
                    marginTop: '20px',
                    padding: '12px 16px',
                    background: 'linear-gradient(90deg, rgba(255,152,0,0.1), rgba(255,152,0,0.05))',
                    border: '1px solid rgba(255,152,0,0.2)',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: 'var(--color-warning)'
                }}>
                    🔥 You're on a <strong>{currentStreak}-day streak</strong>!
                    {currentStreak >= longestStreak
                        ? " This is your best streak yet!"
                        : ` Keep going to beat your record of ${longestStreak} days!`}
                </div>
            )}
        </div>
    );
}

export default StreakTimeline;
