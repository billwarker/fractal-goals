import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { DISABLED_CHART_ANIMATION } from './ChartJSWrapper';
import styles from './WeeklyBarChart.module.css';

/**
 * WeeklyBarChart - Bar chart showing sessions per week
 * 
 * @param {Array} sessions - Array of session objects with session_start dates
 * @param {number} weeks - Number of weeks to display (default: 12)
 */
function WeeklyBarChart({ sessions = [], weeks = 12, chartRef, selectedDateRange = null, onDateRangeChange = null }) {
    const [brushState, setBrushState] = React.useState(null);
    const parsedStart = selectedDateRange?.start ? new Date(`${selectedDateRange.start}T00:00:00`) : null;
    const parsedEnd = selectedDateRange?.end ? new Date(`${selectedDateRange.end}T23:59:59`) : null;
    const filteredSessions = useMemo(() => (
        sessions.filter((session) => {
            if (!parsedStart && !parsedEnd) {
                return true;
            }
            const rawDate = session.session_start || session.created_at;
            if (!rawDate) {
                return false;
            }
            const date = new Date(rawDate);
            if (Number.isNaN(date.getTime())) {
                return false;
            }
            if (parsedStart && date < parsedStart) {
                return false;
            }
            if (parsedEnd && date > parsedEnd) {
                return false;
            }
            return true;
        })
    ), [sessions, parsedStart, parsedEnd]);

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
        filteredSessions.forEach(session => {
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
    }, [filteredSessions, weeks]);

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
                return 'rgba(128, 128, 128, 0.5)'; // Grey for below average (neutral)
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
        ...DISABLED_CHART_ANIMATION,
        layout: {
            padding: {
                top: 8,
                right: 16,
                bottom: 22,
                left: 8,
            }
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(30, 30, 30, 0.95)', // Keep dark tooltip for contrast
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
                            position: 'end',
                            color: 'rgba(255, 152, 0, 1)'
                        }
                    }
                }
            }
        },
        scales: {
            x: {
                ticks: {
                    color: '#888', // Neutral grey
                    font: { size: 10 },
                    maxRotation: 45,
                    minRotation: 45
                },
                grid: { display: false }
            },
            y: {
                beginAtZero: true,
                ticks: {
                    color: '#888', // Neutral grey
                    stepSize: 1,
                    font: { size: 11 }
                },
                grid: { color: 'rgba(128, 128, 128, 0.1)' }, // Subtle grid
                title: {
                    display: true,
                    text: 'Sessions',
                    color: '#888',
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

    const getTrendText = () => {
        switch (trend) {
            case 'up': return 'Trending up';
            case 'down': return 'Trending down';
            default: return 'Stable';
        }
    };

    const getTrendClassName = () => {
        switch (trend) {
            case 'up':
                return styles.trendUp;
            case 'down':
                return styles.trendDown;
            default:
                return styles.trendStable;
        }
    };

    const totalSessions = weeklyData.reduce((sum, w) => sum + w.count, 0);
    const thisWeek = weeklyData[weeklyData.length - 1]?.count || 0;
    const lastWeek = weeklyData[weeklyData.length - 2]?.count || 0;

    const formatDateInput = (value) => {
        if (!value) {
            return null;
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return null;
        }
        return date.toISOString().slice(0, 10);
    };

    const readChartIndex = (event) => {
        const chart = chartRef?.current;
        const canvas = chart?.canvas;
        const xScale = chart?.scales?.x;
        if (!canvas || !xScale) {
            return null;
        }

        const rect = canvas.getBoundingClientRect();
        const pixel = event.clientX - rect.left;
        const clampedPixel = Math.min(xScale.right, Math.max(xScale.left, pixel));
        const rawIndex = xScale.getValueForPixel(clampedPixel);
        const index = Math.round(rawIndex);
        if (Number.isNaN(index) || index < 0 || index >= weeklyData.length) {
            return null;
        }

        return {
            pixel: clampedPixel,
            index,
        };
    };

    const handleBrushStart = (event) => {
        if (!onDateRangeChange || event.target.tagName !== 'CANVAS') {
            return;
        }
        const point = readChartIndex(event);
        if (!point) {
            return;
        }
        setBrushState({
            startPixel: point.pixel,
            currentPixel: point.pixel,
            startIndex: point.index,
        });
    };

    const handleBrushMove = (event) => {
        if (!brushState) {
            return;
        }
        const point = readChartIndex(event);
        if (!point) {
            return;
        }
        setBrushState((current) => current ? { ...current, currentPixel: point.pixel } : current);
    };

    const handleBrushEnd = (event) => {
        if (!brushState) {
            return;
        }
        const point = readChartIndex(event) || { pixel: brushState.currentPixel, index: brushState.startIndex };
        if (Math.abs(point.pixel - brushState.startPixel) >= 8) {
            const startIndex = Math.min(brushState.startIndex, point.index);
            const endIndex = Math.max(brushState.startIndex, point.index);
            onDateRangeChange?.({
                start: formatDateInput(weeklyData[startIndex]?.weekStart),
                end: formatDateInput(weeklyData[endIndex]?.weekEnd),
            });
        }
        setBrushState(null);
    };

    return (
        <div className={styles.panel}>
            <div className={styles.header}>
                <h3 className={styles.title}>
                    📊 Weekly Sessions
                </h3>
                <div className={`${styles.trend} ${getTrendClassName()}`}>
                    {getTrendIcon()} {getTrendText()}
                </div>
            </div>

            {/* Quick Stats */}
            <div className={styles.stats}>
                <div className={styles.stat}>
                    <div className={`${styles.statValue} ${styles.statValueBrand}`}>
                        {thisWeek}
                    </div>
                    <div className={styles.statLabel}>
                        This Week
                    </div>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.stat}>
                    <div className={`${styles.statValue} ${styles.statValueSecondary}`}>
                        {lastWeek}
                    </div>
                    <div className={styles.statLabel}>
                        Last Week
                    </div>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.stat}>
                    <div className={`${styles.statValue} ${styles.statValueWarning}`}>
                        {averagePerWeek.toFixed(1)}
                    </div>
                    <div className={styles.statLabel}>
                        Avg/Week
                    </div>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.stat}>
                    <div className={`${styles.statValue} ${styles.statValueSuccess}`}>
                        {totalSessions}
                    </div>
                    <div className={styles.statLabel}>
                        Total ({weeks}w)
                    </div>
                </div>
            </div>

            {/* Chart */}
            <div
                className={styles.chartWrap}
                onMouseDown={handleBrushStart}
                onMouseMove={handleBrushMove}
                onMouseUp={handleBrushEnd}
                onMouseLeave={handleBrushEnd}
            >
                {brushState && (
                    <div
                        className={styles.brushOverlay}
                        style={{
                            left: `${Math.min(brushState.startPixel, brushState.currentPixel)}px`,
                            width: `${Math.abs(brushState.currentPixel - brushState.startPixel)}px`,
                        }}
                    />
                )}
                <Bar ref={chartRef} data={chartData} options={chartOptions} />
            </div>

            {/* Average line legend */}
            <div className={styles.legend}>
                <div className={styles.legendLine} />
                <span>Average ({averagePerWeek.toFixed(1)} sessions/week)</span>
            </div>
        </div>
    );
}

export default WeeklyBarChart;
