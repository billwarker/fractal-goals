import React, { useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { useTheme } from '../../contexts/ThemeContext';

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
function GoalTimeDistribution({ goals, chartRef }) {
    const { getGoalColor } = useTheme();
    // Roll-up toggle: when true, child goal time is aggregated to parents
    const [rollUpEnabled, setRollUpEnabled] = useState(false);
    // Duration mode: 'activity' = activity instance duration, 'session' = full session duration
    const [durationMode, setDurationMode] = useState('activity');

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

        // Build a map of goals by ID for parent lookup
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

                // Determine target goal for this duration (for roll-up)
                let targetGoalId = goal.id;

                if (rollUpEnabled && goal.parent_id) {
                    // Roll up to the highest ancestor
                    let current = goal;
                    while (current.parent_id && goalMap[current.parent_id]) {
                        current = goalMap[current.parent_id];
                    }
                    targetGoalId = current.id;
                }

                if (!goalTimeData[targetGoalId]) {
                    goalTimeData[targetGoalId] = {};
                }

                if (!goalTimeData[targetGoalId][dateKey]) {
                    goalTimeData[targetGoalId][dateKey] = 0;
                }
                goalTimeData[targetGoalId][dateKey] += item.duration_seconds || 0;
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
        // Chart.js renders datasets in order - first = bottom, last = top
        const goalTypesHierarchy = [
            'NanoGoal', 'MicroGoal', 'ImmediateGoal',
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
    }, [goals, rollUpEnabled, durationMode]);

    const chartOptions = useMemo(() => ({
        indexAxis: 'x', // Explicit: vertical bars (dates on X-axis)
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
                    padding: 12,
                    font: { size: 10 },
                    boxWidth: 8
                }
            },
            tooltip: {
                backgroundColor: 'rgba(30, 30, 30, 0.95)',
                titleColor: '#fff',
                bodyColor: '#ccc',
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
                    color: '#888',
                    font: { size: 12 }
                },
                ticks: {
                    color: '#888',
                    maxRotation: 45,
                    minRotation: 0,
                    autoSkip: true,
                    maxTicksLimit: 15
                },
                grid: { color: '#333' }
            },
            y: {
                stacked: true,
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'Time (hours)',
                    color: '#888',
                    font: { size: 12 }
                },
                ticks: {
                    color: '#888',
                    callback: (value) => `${value}h`
                },
                grid: { color: '#333' }
            }
        }
    }), [chartData.sortedDates]);

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
                    <h3 style={{ margin: 0, fontSize: '14px', color: '#888' }}>
                        Time Invested Over Time
                    </h3>
                </div>

                <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    color: '#666',
                    padding: '40px'
                }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>⏱️</div>
                    <h3 style={{ fontSize: '16px', fontWeight: 500, color: '#888', margin: 0 }}>
                        No Time Recorded Yet
                    </h3>
                    <p style={{ fontSize: '13px', color: '#666', marginTop: '8px', textAlign: 'center', maxWidth: '300px' }}>
                        Start working on goals to see time distribution over time
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header with toggles */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                <h3 style={{ margin: 0, fontSize: '14px', color: '#888' }}>
                    Time Invested Over Time
                </h3>

                {/* Controls */}
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Duration Mode Toggle */}
                    <div style={{
                        display: 'flex',
                        gap: '4px',
                        background: '#252525',
                        borderRadius: '4px',
                        padding: '2px'
                    }}>
                        <button
                            onClick={() => setDurationMode('activity')}
                            style={{
                                padding: '4px 10px',
                                background: durationMode === 'activity' ? '#333' : 'transparent',
                                border: 'none',
                                borderRadius: '3px',
                                color: durationMode === 'activity' ? '#fff' : '#666',
                                fontSize: '11px',
                                cursor: 'pointer'
                            }}
                            title="Time spent on activities associated with each goal"
                        >
                            Activities
                        </button>
                        <button
                            onClick={() => setDurationMode('session')}
                            style={{
                                padding: '4px 10px',
                                background: durationMode === 'session' ? '#333' : 'transparent',
                                border: 'none',
                                borderRadius: '3px',
                                color: durationMode === 'session' ? '#fff' : '#666',
                                fontSize: '11px',
                                cursor: 'pointer'
                            }}
                            title="Full session duration when goal is associated"
                        >
                            Sessions
                        </button>
                    </div>

                    {/* Roll-up toggle */}
                    <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        color: '#888'
                    }}>
                        <input
                            type="checkbox"
                            checked={rollUpEnabled}
                            onChange={(e) => setRollUpEnabled(e.target.checked)}
                            style={{
                                width: '13px',
                                height: '13px',
                                cursor: 'pointer',
                                accentColor: '#2196f3'
                            }}
                        />
                        <span>Roll up</span>
                        <span
                            title="When enabled, time spent on child goals is aggregated and shown under their top-level parent goal."
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '13px',
                                height: '13px',
                                borderRadius: '50%',
                                background: '#333',
                                color: '#888',
                                fontSize: '9px',
                                cursor: 'help'
                            }}
                        >
                            ?
                        </span>
                    </label>
                </div>
            </div>

            {/* Chart */}
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                <Bar ref={chartRef} data={chartData} options={chartOptions} />
            </div>
        </div>
    );
}

export default GoalTimeDistribution;
