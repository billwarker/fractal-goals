import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';

/**
 * WeeklyBarChart - Bar chart showing sessions per week
 * 
 * @param {Array} sessions - Array of session objects with session_start dates
 * @param {number} weeks - Number of weeks to display (default: 12)
 */
function WeeklyBarChart({ sessions = [], weeks = 12, chartRef }) {
    // Process sessions into weekly counts
    const { weeklyData, averagePerWeek, maxSessions, trend } = useMemo(() => {
        const today = new Date();
        const weeksData = [];

        // Generate week ranges
        for (let i = weeks - 1; i >= 0; i--) {
            const weekEnd = new Date(today);
            weekEnd.setDate(weekEnd.getDate() - (i * 7));
            weekEnd.setHours(23, 59, 59, 999);

            const weekStart = new Date(weekEnd);
            weekStart.setDate(weekStart.getDate() - 6);
            weekStart.setHours(0, 0, 0, 0);

            weeksData.push({
                weekStart,
                weekEnd,
                label: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                count: 0
            });
        }

        // Count sessions per week
        sessions.forEach(session => {
            const sessionDate = session.session_start || session.created_at;
            if (!sessionDate) return;

            const date = new Date(sessionDate);

            weeksData.forEach(week => {
                if (date >= week.weekStart && date <= week.weekEnd) {
                    week.count++;
                }
            });
        });

        // Calculate stats
        const counts = weeksData.map(w => w.count);
        const total = counts.reduce((sum, c) => sum + c, 0);
        const avg = total / weeks;
        const max = Math.max(...counts, 1);

        // Calculate trend (comparing recent half to older half)
        const halfPoint = Math.floor(weeks / 2);
        const olderHalf = counts.slice(0, halfPoint).reduce((sum, c) => sum + c, 0) / halfPoint;
        const recentHalf = counts.slice(halfPoint).reduce((sum, c) => sum + c, 0) / (weeks - halfPoint);
        const trendDirection = recentHalf > olderHalf * 1.1 ? 'up' : recentHalf < olderHalf * 0.9 ? 'down' : 'stable';

        return {
            weeklyData: weeksData,
            averagePerWeek: avg,
            maxSessions: max,
            trend: trendDirection
        };
    }, [sessions, weeks]);

    // Chart.js data
    const chartData = {
        labels: weeklyData.map(w => w.label),
        datasets: [{
            label: 'Sessions',
            data: weeklyData.map(w => w.count),
            backgroundColor: weeklyData.map((w, i) => {
                // Gradient from blue to green for more recent weeks
                const isRecent = i >= weeklyData.length - 2;
                const isAboveAverage = w.count > averagePerWeek;

                if (isRecent && isAboveAverage) return 'rgba(76, 175, 80, 0.8)'; // Green for recent high
                if (isRecent) return 'rgba(33, 150, 243, 0.8)'; // Blue for recent
                if (isAboveAverage) return 'rgba(76, 175, 80, 0.6)'; // Light green for above avg
                return 'rgba(100, 100, 100, 0.5)'; // Grey for below average
            }),
            borderColor: weeklyData.map((w, i) => {
                const isRecent = i >= weeklyData.length - 2;
                const isAboveAverage = w.count > averagePerWeek;

                if (isRecent && isAboveAverage) return '#4caf50';
                if (isRecent) return '#2196f3';
                if (isAboveAverage) return '#4caf50';
                return '#666';
            }),
            borderWidth: 1,
            borderRadius: 4,
            borderSkipped: false
        }]
    };

    // Chart.js options
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(30, 30, 30, 0.95)',
                titleColor: '#fff',
                bodyColor: '#ccc',
                padding: 12,
                displayColors: false,
                callbacks: {
                    title: (ctx) => {
                        const weekIndex = ctx[0].dataIndex;
                        const week = weeklyData[weekIndex];
                        const endDate = week.weekEnd.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric'
                        });
                        return `Week of ${week.label} - ${endDate}`;
                    },
                    label: (ctx) => {
                        const count = ctx.raw;
                        const comparison = count > averagePerWeek
                            ? `+${(count - averagePerWeek).toFixed(1)} above avg`
                            : count < averagePerWeek
                                ? `${(count - averagePerWeek).toFixed(1)} below avg`
                                : 'at average';
                        return [`${count} session${count !== 1 ? 's' : ''}`, comparison];
                    }
                }
            },
            annotation: {
                annotations: {
                    averageLine: {
                        type: 'line',
                        yMin: averagePerWeek,
                        yMax: averagePerWeek,
                        borderColor: 'rgba(255, 152, 0, 0.5)',
                        borderWidth: 2,
                        borderDash: [6, 4],
                        label: {
                            display: true,
                            content: `Avg: ${averagePerWeek.toFixed(1)}`,
                            position: 'end'
                        }
                    }
                }
            }
        },
        scales: {
            x: {
                ticks: {
                    color: '#888',
                    font: { size: 10 },
                    maxRotation: 45,
                    minRotation: 45
                },
                grid: { display: false }
            },
            y: {
                beginAtZero: true,
                ticks: {
                    color: '#888',
                    stepSize: 1,
                    font: { size: 11 }
                },
                grid: { color: '#333' },
                title: {
                    display: true,
                    text: 'Sessions',
                    color: '#666',
                    font: { size: 11 }
                }
            }
        }
    };

    const getTrendIcon = () => {
        switch (trend) {
            case 'up': return '📈';
            case 'down': return '📉';
            default: return '➡️';
        }
    };

    const getTrendColor = () => {
        switch (trend) {
            case 'up': return '#4caf50';
            case 'down': return '#f44336';
            default: return '#888';
        }
    };

    const getTrendText = () => {
        switch (trend) {
            case 'up': return 'Trending up';
            case 'down': return 'Trending down';
            default: return 'Stable';
        }
    };

    const totalSessions = weeklyData.reduce((sum, w) => sum + w.count, 0);
    const thisWeek = weeklyData[weeklyData.length - 1]?.count || 0;
    const lastWeek = weeklyData[weeklyData.length - 2]?.count || 0;

    return (
        <div style={{
            background: '#1e1e1e',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '20px',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            minHeight: 0
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
                    color: '#ccc'
                }}>
                    📊 Weekly Sessions
                </h3>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    color: getTrendColor()
                }}>
                    {getTrendIcon()} {getTrendText()}
                </div>
            </div>

            {/* Quick Stats */}
            <div style={{
                display: 'flex',
                gap: '16px',
                marginBottom: '20px',
                padding: '12px 16px',
                background: '#252525',
                borderRadius: '6px'
            }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#2196f3' }}>
                        {thisWeek}
                    </div>
                    <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase' }}>
                        This Week
                    </div>
                </div>
                <div style={{ width: '1px', background: '#444' }} />
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#666' }}>
                        {lastWeek}
                    </div>
                    <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase' }}>
                        Last Week
                    </div>
                </div>
                <div style={{ width: '1px', background: '#444' }} />
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff9800' }}>
                        {averagePerWeek.toFixed(1)}
                    </div>
                    <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase' }}>
                        Avg/Week
                    </div>
                </div>
                <div style={{ width: '1px', background: '#444' }} />
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#4caf50' }}>
                        {totalSessions}
                    </div>
                    <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase' }}>
                        Total ({weeks}w)
                    </div>
                </div>
            </div>

            {/* Chart */}
            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                <Bar ref={chartRef} data={chartData} options={chartOptions} />
            </div>

            {/* Average line legend */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginTop: '12px',
                fontSize: '11px',
                color: '#888'
            }}>
                <div style={{
                    width: '20px',
                    height: '2px',
                    background: 'rgba(255, 152, 0, 0.5)',
                    borderStyle: 'dashed'
                }} />
                <span>Average ({averagePerWeek.toFixed(1)} sessions/week)</span>
            </div>
        </div>
    );
}

export default WeeklyBarChart;
