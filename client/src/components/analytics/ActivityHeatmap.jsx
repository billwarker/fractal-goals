import React, { useMemo, useState } from 'react';

/**
 * ActivityHeatmap - GitHub-style activity heatmap showing daily session counts
 * 
 * @param {Array} sessions - Array of session objects with session_start dates
 * @param {number} months - Number of months to display (default: 12)
 */
function ActivityHeatmap({ sessions = [], months = 12 }) {
    const [hoveredCell, setHoveredCell] = useState(null);

    // Process sessions into daily counts
    const { dailyData, weeks, maxCount, monthLabels } = useMemo(() => {
        const today = new Date();
        today.setHours(23, 59, 59, 999);

        // Calculate start date (beginning of week, months ago)
        const startDate = new Date(today);
        startDate.setMonth(startDate.getMonth() - months);
        // Go back to nearest Sunday
        startDate.setDate(startDate.getDate() - startDate.getDay());
        startDate.setHours(0, 0, 0, 0);

        // Build daily count map from sessions
        const countMap = {};
        sessions.forEach(session => {
            const sessionDate = session.session_start || session.created_at;
            if (!sessionDate) return;

            const date = new Date(sessionDate);
            const dateKey = date.toISOString().split('T')[0];
            countMap[dateKey] = (countMap[dateKey] || 0) + 1;
        });

        // Generate all days in range
        const allDays = [];
        const current = new Date(startDate);
        while (current <= today) {
            const dateKey = current.toISOString().split('T')[0];
            allDays.push({
                date: new Date(current),
                dateKey,
                count: countMap[dateKey] || 0,
                dayOfWeek: current.getDay()
            });
            current.setDate(current.getDate() + 1);
        }

        // Group into weeks (Sunday to Saturday)
        const weeksArray = [];
        let currentWeek = [];

        allDays.forEach((day, index) => {
            // Fill in leading empty cells for first week
            if (index === 0 && day.dayOfWeek > 0) {
                for (let i = 0; i < day.dayOfWeek; i++) {
                    currentWeek.push(null);
                }
            }

            currentWeek.push(day);

            if (day.dayOfWeek === 6 || index === allDays.length - 1) {
                // Fill trailing empty cells for last week
                while (currentWeek.length < 7) {
                    currentWeek.push(null);
                }
                weeksArray.push(currentWeek);
                currentWeek = [];
            }
        });

        // Calculate max count for intensity scaling
        const max = Math.max(1, ...allDays.map(d => d.count));

        // Generate month labels
        const labels = [];
        let lastMonth = -1;
        weeksArray.forEach((week, weekIndex) => {
            const firstDayOfWeek = week.find(d => d !== null);
            if (firstDayOfWeek) {
                const month = firstDayOfWeek.date.getMonth();
                if (month !== lastMonth) {
                    labels.push({
                        weekIndex,
                        label: firstDayOfWeek.date.toLocaleDateString('en-US', { month: 'short' })
                    });
                    lastMonth = month;
                }
            }
        });

        return {
            dailyData: allDays,
            weeks: weeksArray,
            maxCount: max,
            monthLabels: labels
        };
    }, [sessions, months]);

    // Get color intensity based on count
    const getColor = (count) => {
        if (count === 0) return 'var(--color-bg-input)';

        const intensity = count / maxCount;

        // Green gradient similar to GitHub
        if (intensity <= 0.25) return '#0e4429';
        if (intensity <= 0.5) return '#006d32';
        if (intensity <= 0.75) return '#26a641';
        return '#39d353';
    };

    // Dynamically calculate cell size based on available width
    const cellSize = 14;
    const cellGap = 3;
    const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

    const formatDate = (date) => {
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    // Calculate total sessions and streak info (within the time range)
    const totalSessions = dailyData.reduce((sum, d) => sum + d.count, 0);
    const activeDays = dailyData.filter(d => d.count > 0).length;

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
                marginBottom: '16px'
            }}>
                <h3 style={{
                    margin: 0,
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--color-text-secondary)'
                }}>
                    📅 Activity Heatmap
                </h3>
                <div style={{
                    display: 'flex',
                    gap: '16px',
                    fontSize: '12px',
                    color: 'var(--color-text-muted)'
                }}>
                    <span><strong style={{ color: 'var(--color-success)' }}>{totalSessions}</strong> sessions</span>
                    <span><strong style={{ color: 'var(--color-brand-primary)' }}>{activeDays}</strong> active days</span>
                </div>
            </div>

            {/* Month labels */}
            <div style={{
                display: 'flex',
                marginLeft: '32px',
                marginBottom: '4px'
            }}>
                {monthLabels.map((label, i) => (
                    <span
                        key={i}
                        style={{
                            position: 'relative',
                            left: `${label.weekIndex * (cellSize + cellGap)}px`,
                            fontSize: '10px',
                            color: 'var(--color-text-muted)',
                            marginRight: '-20px'
                        }}
                    >
                        {label.label}
                    </span>
                ))}
            </div>

            <div style={{ display: 'flex', gap: '4px' }}>
                {/* Day labels */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: `${cellGap}px`,
                    marginRight: '4px'
                }}>
                    {dayLabels.map((label, i) => (
                        <div
                            key={i}
                            style={{
                                height: `${cellSize}px`,
                                fontSize: '9px',
                                color: 'var(--color-text-muted)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-end',
                                width: '24px'
                            }}
                        >
                            {label}
                        </div>
                    ))}
                </div>

                {/* Heatmap grid */}
                <div style={{
                    display: 'flex',
                    gap: `${cellGap}px`,
                    overflowX: 'auto',
                    paddingBottom: '4px'
                }}>
                    {weeks.map((week, weekIndex) => (
                        <div
                            key={weekIndex}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: `${cellGap}px`
                            }}
                        >
                            {week.map((day, dayIndex) => (
                                <div
                                    key={dayIndex}
                                    style={{
                                        width: `${cellSize}px`,
                                        height: `${cellSize}px`,
                                        backgroundColor: day ? getColor(day.count) : 'transparent',
                                        borderRadius: '2px',
                                        cursor: day ? 'pointer' : 'default',
                                        transition: 'transform 0.1s ease',
                                        transform: hoveredCell === `${weekIndex}-${dayIndex}` ? 'scale(1.2)' : 'scale(1)'
                                    }}
                                    onMouseEnter={() => day && setHoveredCell(`${weekIndex}-${dayIndex}`)}
                                    onMouseLeave={() => setHoveredCell(null)}
                                    title={day ? `${formatDate(day.date)}: ${day.count} session${day.count !== 1 ? 's' : ''}` : ''}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* Legend */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '4px',
                marginTop: '12px',
                fontSize: '10px',
                color: 'var(--color-text-muted)'
            }}>
                <span>Less</span>
                <div style={{ width: '10px', height: '10px', backgroundColor: 'var(--color-bg-input)', borderRadius: '2px' }} />
                <div style={{ width: '10px', height: '10px', backgroundColor: '#0e4429', borderRadius: '2px' }} />
                <div style={{ width: '10px', height: '10px', backgroundColor: '#006d32', borderRadius: '2px' }} />
                <div style={{ width: '10px', height: '10px', backgroundColor: '#26a641', borderRadius: '2px' }} />
                <div style={{ width: '10px', height: '10px', backgroundColor: '#39d353', borderRadius: '2px' }} />
                <span>More</span>
            </div>
        </div>
    );
}

export default ActivityHeatmap;
