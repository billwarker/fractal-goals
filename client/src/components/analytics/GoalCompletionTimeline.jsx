import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * GoalCompletionTimeline - Stacked area chart showing cumulative goal completions over time
 * 
 * Each goal type is represented as a layer in the stacked chart, using cosmic colors.
 * The y-axis shows cumulative count of completed goals.
 * The x-axis shows the timeline based on completion dates.
 */
function GoalCompletionTimeline({ goals, chartRef }) {
    const { getGoalColor } = useTheme();
    // Goal types in hierarchy order from PARENT (bottom of stack) to CHILD (top of stack)
    // This ensures parent goals form the base of the stacked area chart
    const goalTypesHierarchy = [
        'UltimateGoal',   // Level 0 - Bottom of stack
        'LongTermGoal',   // Level 1
        'MidTermGoal',    // Level 2
        'ShortTermGoal',  // Level 3
        'ImmediateGoal',  // Level 4
        'MicroGoal',      // Level 5
        'NanoGoal'        // Level 6 - Top of stack
    ];

    // Process goals to build cumulative completion data
    const chartData = useMemo(() => {
        if (!goals || goals.length === 0) {
            return { labels: [], datasets: [], goalsPerDate: {} };
        }

        // Get all completed goals with completion dates
        const completedGoals = goals
            .filter(g => g.completed && g.completed_at)
            .map(g => ({
                ...g,
                completedDate: new Date(g.completed_at)
            }))
            .sort((a, b) => a.completedDate - b.completedDate);

        if (completedGoals.length === 0) {
            return { labels: [], datasets: [], goalsPerDate: {} };
        }

        // Build timeline: create data points for each completion event
        // For each date, we track cumulative count per goal type
        const timelineData = [];
        const cumulativeCounts = {};
        goalTypesHierarchy.forEach(type => cumulativeCounts[type] = 0);

        // Group completions by date (to handle multiple completions on same day)
        const completionsByDate = {};
        completedGoals.forEach(goal => {
            const dateKey = goal.completedDate.toISOString().split('T')[0];
            if (!completionsByDate[dateKey]) {
                completionsByDate[dateKey] = [];
            }
            completionsByDate[dateKey].push(goal);
        });

        // Also track goal names by date and type for tooltip
        const goalsPerDate = {};

        // Sort dates and build cumulative data
        const sortedDates = Object.keys(completionsByDate).sort();

        sortedDates.forEach(dateKey => {
            const goalsOnDate = completionsByDate[dateKey];

            // Track goal names per type for this date
            goalsPerDate[dateKey] = {};
            goalsOnDate.forEach(goal => {
                if (!goalsPerDate[dateKey][goal.type]) {
                    goalsPerDate[dateKey][goal.type] = [];
                }
                goalsPerDate[dateKey][goal.type].push(goal.name);
            });

            // Update cumulative counts for this date
            goalsOnDate.forEach(goal => {
                if (cumulativeCounts.hasOwnProperty(goal.type)) {
                    cumulativeCounts[goal.type]++;
                }
            });

            // Create data point with cumulative counts at this date
            timelineData.push({
                date: new Date(dateKey),
                dateKey: dateKey,
                counts: { ...cumulativeCounts }
            });
        });

        // If there's only one data point, add a starting point at the beginning
        if (timelineData.length === 1) {
            const firstDate = new Date(timelineData[0].date);
            firstDate.setDate(firstDate.getDate() - 1);
            const zeroCounts = {};
            goalTypesHierarchy.forEach(type => zeroCounts[type] = 0);
            const prevDateKey = firstDate.toISOString().split('T')[0];
            timelineData.unshift({
                date: firstDate,
                dateKey: prevDateKey,
                counts: zeroCounts
            });
        }

        // Build Chart.js datasets in hierarchy order
        // Parents (UltimateGoal) at bottom, children (NanoGoal) at top
        // Chart.js stacks in order of array, so first dataset = bottom layer
        const datasets = goalTypesHierarchy
            .filter(type => {
                // Only include types that have at least one completion
                return timelineData.some(d => d.counts[type] > 0);
            })
            .map((type, index, filteredArray) => {
                const color = getGoalColor(type);

                // Create semi-transparent version for fill
                const hexToRgba = (hex, alpha) => {
                    const r = parseInt(hex.slice(1, 3), 16);
                    const g = parseInt(hex.slice(3, 5), 16);
                    const b = parseInt(hex.slice(5, 7), 16);
                    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                };

                return {
                    label: type.replace('Goal', ''),
                    goalType: type, // Keep full type name for tooltip lookup
                    data: timelineData.map(d => ({
                        x: d.date,
                        y: d.counts[type],
                        dateKey: d.dateKey
                    })),
                    borderColor: color,
                    backgroundColor: hexToRgba(color, 0.6),
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4,
                    pointHoverRadius: 7,
                    borderWidth: 2,
                    // Order controls z-index: lower = rendered first (bottom)
                    // Parents should be at bottom, so give them lower order
                    order: filteredArray.length - 1 - index
                };
            });

        return {
            labels: timelineData.map(d => d.date),
            datasets,
            goalsPerDate
        };
    }, [goals]);

    const chartOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                position: 'top',
                labels: {
                    color: '#ccc',
                    usePointStyle: true,
                    pointStyle: 'circle',
                    padding: 16,
                    font: {
                        size: 11
                    }
                }
            },
            tooltip: {
                backgroundColor: 'rgba(30, 30, 30, 0.95)',
                titleColor: '#fff',
                bodyColor: '#ccc',
                padding: 12,
                displayColors: true,
                callbacks: {
                    title: (ctx) => {
                        // Use the dateKey stored in the raw data point
                        const dateKey = ctx[0]?.raw?.dateKey;
                        if (dateKey) {
                            // Parse YYYY-MM-DD format properly
                            const [year, month, day] = dateKey.split('-').map(Number);
                            const date = new Date(year, month - 1, day);
                            return date.toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                            });
                        }
                        return '';
                    },
                    label: (ctx) => {
                        const goalType = ctx.dataset.goalType;
                        const dateKey = ctx.raw?.dateKey;
                        const goalsForDate = chartData.goalsPerDate[dateKey];
                        const goalNamesOnDate = goalsForDate?.[goalType] || [];

                        // Build label with cumulative count
                        const lines = [`${ctx.dataset.label}: ${ctx.parsed.y} total`];

                        // If goals were completed on this date for this type, show them
                        if (goalNamesOnDate.length > 0) {
                            lines.push(`  ✓ Completed: ${goalNamesOnDate.join(', ')}`);
                        }

                        return lines;
                    }
                }
            }
        },
        interaction: {
            mode: 'index',
            intersect: false
        },
        scales: {
            x: {
                type: 'time',
                time: {
                    unit: 'day',
                    displayFormats: {
                        day: 'MMM d'
                    }
                },
                title: {
                    display: true,
                    text: 'Completion Date',
                    color: '#888',
                    font: { size: 12 }
                },
                ticks: { color: '#888' },
                grid: { color: '#333' }
            },
            y: {
                stacked: true,
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'Cumulative Goals Completed',
                    color: '#888',
                    font: { size: 12 }
                },
                ticks: {
                    color: '#888',
                    stepSize: 1
                },
                grid: { color: '#333' }
            }
        }
    }), [chartData.goalsPerDate]);

    // Empty state
    if (!chartData.datasets.length) {
        return (
            <div style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                color: '#666',
                padding: '40px'
            }}>
                <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>📈</div>
                <h3 style={{ fontSize: '16px', fontWeight: 500, color: '#888', margin: 0 }}>
                    No Completed Goals Yet
                </h3>
                <p style={{ fontSize: '13px', color: '#666', marginTop: '8px', textAlign: 'center', maxWidth: '300px' }}>
                    Complete goals to see your cumulative progress visualized over time
                </p>
            </div>
        );
    }

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <Line ref={chartRef} data={chartData} options={chartOptions} />
        </div>
    );
}

export default GoalCompletionTimeline;
