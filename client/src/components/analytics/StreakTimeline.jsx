import React, { useMemo } from 'react';
import { useTimezone } from '../../contexts/TimezoneContext';
import { getShiftedDate } from '../../utils/dateUtils';
import styles from './StreakTimeline.module.css';

/**
 * StreakTimeline - Visual timeline showing streaks and breaks
 * Highlights consecutive days with activity and gaps between them
 * 
 * @param {Array} sessions - Array of session objects with session_start dates
 */
function StreakTimeline({ sessions = [] }) {
    const { timezone } = useTimezone();

    // Calculate streaks and breaks
    const { streaks, currentStreak, longestStreak, totalActiveDays } = useMemo(() => {
        if (sessions.length === 0) {
            return { streaks: [], currentStreak: 0, longestStreak: 0, totalActiveDays: 0 };
        }

        // Get unique dates with sessions in selected timezone
        const sessionDates = new Set();
        sessions.forEach(session => {
            const sessionDate = session.session_start || session.created_at;
            if (sessionDate) {
                const shifted = getShiftedDate(sessionDate, timezone);
                sessionDates.add(shifted.toISOString().split('T')[0]);
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
        const now = new Date();
        const shiftedNow = getShiftedDate(now, timezone);
        const today = shiftedNow.toISOString().split('T')[0];

        const yesterdayDate = new Date(shiftedNow);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterday = yesterdayDate.toISOString().split('T')[0];

        const lastSessionDate = sortedDates[sortedDates.length - 1];

        let current = 0;
        if (lastSessionDate === today || lastSessionDate === yesterday) {
            current = 0;
            let checkD = new Date(lastSessionDate);
            while (sessionDates.has(checkD.toISOString().split('T')[0])) {
                current++;
                checkD.setDate(checkD.getDate() - 1);
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
    }, [sessions, timezone]);

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

    const getSegmentDateRangeClassName = (segmentType) =>
        segmentType === 'streak'
            ? `${styles.segmentDateRange} ${styles.segmentDateRangeStreak}`
            : `${styles.segmentDateRange} ${styles.segmentDateRangeBreak}`;

    const getBarFillClassName = (length) => {
        if (length >= 7) return `${styles.barFill} ${styles.barFillLong}`;
        if (length >= 3) return `${styles.barFill} ${styles.barFillMedium}`;
        return `${styles.barFill} ${styles.barFillShort}`;
    };

    const getBadgeClassName = (length) =>
        length >= 14
            ? `${styles.badge} ${styles.badgeGreat}`
            : `${styles.badge} ${styles.badgeNice}`;

    const getBreakLineClassName = (length) =>
        length >= 7
            ? `${styles.breakLine} ${styles.breakLineLong}`
            : `${styles.breakLine} ${styles.breakLineShort}`;

    // Calculate width percentages for visualization
    const maxLength = Math.max(...recentStreaks.map(s => s.length), 1);

    return (
        <div className={styles.panel}>
            <div className={styles.header}>
                <h3 className={styles.title}>
                    🔥 Streak Timeline
                </h3>
            </div>

            {/* Streak Stats */}
            <div className={styles.stats}>
                <div className={styles.stat}>
                    <div className={`${styles.statValue} ${styles.statValueRow} ${currentStreak > 0 ? styles.statValueWarning : styles.statValueMuted}`}>
                        {currentStreak > 0 && '🔥'} {currentStreak}
                    </div>
                    <div className={styles.statLabel}>
                        Current Streak
                    </div>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.stat}>
                    <div className={`${styles.statValue} ${styles.statValueSuccess}`}>
                        {longestStreak}
                    </div>
                    <div className={styles.statLabel}>
                        Longest Streak
                    </div>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.stat}>
                    <div className={`${styles.statValue} ${styles.statValueBrand}`}>
                        {totalActiveDays}
                    </div>
                    <div className={styles.statLabel}>
                        Total Active Days
                    </div>
                </div>
            </div>

            {/* Timeline Visualization */}
            {recentStreaks.length > 0 ? (
                <div className={styles.timeline}>
                    <div className={styles.timelineHeader}>
                        Recent Activity (Last 90 Days)
                    </div>
                    {recentStreaks.map((segment, index) => (
                        <div key={index} className={styles.segmentRow}>
                            {/* Date range */}
                            <div className={getSegmentDateRangeClassName(segment.type)}>
                                {segment.type === 'streak'
                                    ? `${formatDate(segment.start)} - ${formatDate(segment.end)}`
                                    : `— ${segment.length} day break —`
                                }
                            </div>

                            {/* Visual bar */}
                            {segment.type === 'streak' && (
                                <>
                                    <div className={styles.barTrack}>
                                        <div
                                            className={getBarFillClassName(segment.length)}
                                            style={{ width: `${Math.max(10, (segment.length / maxLength) * 100)}%` }}
                                        >
                                            <span className={styles.barLabel}>
                                                {segment.length} day{segment.length !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Badge for long streaks */}
                                    {segment.length >= 7 && (
                                        <div className={getBadgeClassName(segment.length)}>
                                            {segment.length >= 14 ? '🏆 Great!' : '⭐ Nice!'}
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Break indicator */}
                            {segment.type === 'break' && (
                                <div className={getBreakLineClassName(segment.length)} />
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className={styles.empty}>
                    No session data available yet. Complete your first session to start tracking streaks!
                </div>
            )}

            {/* Motivational message based on current streak */}
            {currentStreak > 0 && (
                <div className={styles.motivation}>
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
