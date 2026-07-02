import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';;
import EmptyState from '../common/EmptyState';
import { DISABLED_CHART_ANIMATION, useChartThemeDefaults } from './ChartJSWrapper';

/**
 * GoalTimeDistribution - Stacked bar chart showing time spent working towards goals over time
 * 
 * Features:
 * - X-axis: Dates
 * - Y-axis: Duration (hours) spent per day
 * - Stacked by goal, using cosmic colors based on goal type
 * - Option to roll-up child goal time to parent goals
 * - Option to measure by activity duration vs session duration
 */
function GoalTimeDistribution({
    goals,
    chartRef,
    inheritanceMode = 'direct',
    durationMode = 'activity',
}) {
    const { getGoalColor } = useGoalLevels();;
    const chartTheme = useChartThemeDefaults();

    // Format duration in hours and minutes
    const formatDuration = (seconds) => {
        if (!seconds || seconds === 0) return '0m';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
            return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
        }
        return `${minutes}m`;
    };

    // Process goals data into time series
    const chartData = useMemo(() => {
        if (!goals || goals.length === 0) {
            return { labels: [], datasets: [] };
        }

        const goalMap = {};
        goals.forEach(goal => {
            goalMap[goal.id] = goal;
        });

        // Collect all unique dates and build time series data per goal
        const dateSet = new Set();
        const goalTimeData = {}; // { goalId: { date: seconds } }

        goals.forEach(goal => {
            // Use appropriate data source based on duration mode
            const durations = durationMode === 'activity'
                ? (goal.activity_durations_by_date || goal.session_durations_by_date || [])
                : (goal.session_durations_by_date || []);

            durations.forEach(item => {
                const dateKey = item.date;
                dateSet.add(dateKey);

                const targetGoalIds = [goal.id];

                if (inheritanceMode === 'descendants') {
                    let current = goal;
                    while (current.parent_id && goalMap[current.parent_id]) {
                        current = goalMap[current.parent_id];
                        targetGoalIds.push(current.id);
                    }
                } else if (inheritanceMode === 'root') {
                    let current = goal;
                    while (current.parent_id && goalMap[current.parent_id]) {
                        current = goalMap[current.parent_id];
                    }
                    targetGoalIds.splice(0, targetGoalIds.length, current.id);
                }

                targetGoalIds.forEach((targetGoalId) => {
                    if (!goalTimeData[targetGoalId]) {
                        goalTimeData[targetGoalId] = {};
                    }

                    if (!goalTimeData[targetGoalId][dateKey]) {
                        goalTimeData[targetGoalId][dateKey] = 0;
                    }
                    goalTimeData[targetGoalId][dateKey] += item.duration_seconds || 0;
                });
            });
        });

        // Sort dates chronologically
        const sortedDates = Array.from(dateSet).sort();

        if (sortedDates.length === 0) {
            return { labels: [], datasets: [] };
        }

        // Format date labels
        const labels = sortedDates.map(d => {
            const date = new Date(d);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });

        // Create datasets - one per goal that has time data
        const goalsWithData = Object.keys(goalTimeData).filter(goalId => {
            const goal = goalMap[goalId];
            return goal && Object.values(goalTimeData[goalId]).some(v => v > 0);
        });

        // Sort goals by type hierarchy: children first (bottom of stack), parents last (top of stack)
        const goalTypesHierarchy = [
            'ImmediateGoal',
            'ShortTermGoal', 'MidTermGoal', 'LongTermGoal', 'UltimateGoal'
        ];

        goalsWithData.sort((a, b) => {
            const goalA = goalMap[a];
            const goalB = goalMap[b];
            const typeIndexA = goalTypesHierarchy.indexOf(goalA?.type);
            const typeIndexB = goalTypesHierarchy.indexOf(goalB?.type);
            // If type not found, put at end
            return (typeIndexA === -1 ? 999 : typeIndexA) - (typeIndexB === -1 ? 999 : typeIndexB);
        });

        const datasets = goalsWithData.map((goalId, index) => {
            const goal = goalMap[goalId];
            const color = getGoalColor(goal?.type);

            // Create semi-transparent version for fill
            const hexToRgba = (hex, alpha) => {
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            };

            const data = sortedDates.map(dateKey => {
                const seconds = goalTimeData[goalId][dateKey] || 0;
                return seconds / 3600; // Convert to hours
            });

            return {
                label: goal?.name || 'Unknown',
                data,
                backgroundColor: hexToRgba(color, 0.7),
                borderColor: color,
                borderWidth: 1,
                goalId,
                goalType: goal?.type,
                // Store raw seconds for tooltip
                rawData: sortedDates.map(dateKey => goalTimeData[goalId][dateKey] || 0)
            };
        });

        return {
            labels,
            datasets,
            sortedDates // Keep for tooltip formatting
        };
    }, [goals, inheritanceMode, durationMode]);

    const chartOptions = useMemo(() => ({
        indexAxis: 'x', // Explicit: vertical bars (dates on X-axis)
        responsive: true,
        maintainAspectRatio: false,
        ...DISABLED_CHART_ANIMATION,
        plugins: {
            legend: {
                display: true,
                position: 'top',
                labels: {
                    color: chartTheme.textColor,
                    usePointStyle: true,
                    pointStyle: 'circle',
                    padding: 12,
                    font: { size: 10 },
                    boxWidth: 8
                }
            },
            tooltip: {
                backgroundColor: chartTheme.tooltipBg,
                titleColor: chartTheme.tooltipText,
                bodyColor: chartTheme.tooltipBody,
                padding: 12,
                callbacks: {
                    title: (ctx) => {
                        const dataIndex = ctx[0]?.dataIndex;
                        if (dataIndex !== undefined && chartData.sortedDates) {
                            const dateStr = chartData.sortedDates[dataIndex];
                            // Handle ISO datetime strings (YYYY-MM-DDTHH:MM:SS) or date strings (YYYY-MM-DD)
                            const datePart = dateStr.split('T')[0];
                            const [year, month, day] = datePart.split('-').map(Number);
                            const date = new Date(year, month - 1, day);
                            return date.toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                            });
                        }
                        return ctx[0]?.label || '';
                    },
                    label: (ctx) => {
                        const rawSeconds = ctx.dataset.rawData?.[ctx.dataIndex] || 0;
                        if (rawSeconds > 0) {
                            return `${ctx.dataset.label}: ${formatDuration(rawSeconds)}`;
                        }
                        return null;
                    }
                }
            }
        },
        scales: {
            x: {
                stacked: true,
                title: {
                    display: true,
                    text: 'Date',
                    color: chartTheme.textColor,
                    font: { size: 12 }
                },
                ticks: {
                    color: chartTheme.textColor,
                    maxRotation: 45,
                    minRotation: 0,
                    autoSkip: true,
                    maxTicksLimit: 15
                },
                grid: { color: chartTheme.gridColor }
            },
            y: {
                stacked: true,
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'Time (hours)',
                    color: chartTheme.textColor,
                    font: { size: 12 }
                },
                ticks: {
                    color: chartTheme.textColor,
                    callback: (value) => `${value}h`
                },
                grid: { color: chartTheme.gridColor }
            }
        }
    }), [chartData.sortedDates, chartTheme]);

    // Empty state
    if (!chartData.datasets.length) {
        return (
            <div style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* Header with toggle */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px'
                }}>
                    <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                        Time Invested Over Time
                    </h3>
                </div>

                <EmptyState
                    compact
                    title="No Time Recorded Yet"
                    description="Start working on goals to see time distribution over time."
                />
            </div>
        );
    }

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{
                display: 'flex',
                justifyContent: 'flex-start',
                alignItems: 'center',
                marginBottom: '12px',
            }}>
                <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                    Time Invested Over Time
                </h3>
            </div>

            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                <Bar ref={chartRef} data={chartData} options={chartOptions} />
            </div>
        </div>
    );
}

export default GoalTimeDistribution;
