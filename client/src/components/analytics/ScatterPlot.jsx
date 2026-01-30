import React, { useState, useEffect } from 'react';
import { Scatter } from 'react-chartjs-2';
import { chartDefaults, useChartOptions } from './ChartJSWrapper'; // Import hook

/**
 * Scatter Plot component for visualizing activity metrics
 * Uses Chart.js via react-chartjs-2
 * Allows user to select X and Y axis metrics via dropdowns
 * Requires at least 2 metrics to be meaningful
 * Supports split filtering for split-enabled activities
 */
function ScatterPlot({ selectedActivity, activityInstances, activities, setsHandling = 'top', selectedSplit = 'all', chartRef }) {
    const [xMetric, setXMetric] = useState(null);
    const [yMetric, setYMetric] = useState(null);

    const activityDef = selectedActivity ? activities.find(a => a.id === selectedActivity.id) : null;
    const metrics = activityDef?.metric_definitions || [];

    // Reset metric selections when activity changes
    useEffect(() => {
        if (metrics.length >= 2) {
            setXMetric(metrics[0]);
            setYMetric(metrics[1]);
        } else {
            setXMetric(null);
            setYMetric(null);
        }
    }, [selectedActivity?.id]);

    // Use selected metrics or defaults
    const xMetricToPlot = xMetric || metrics[0];
    const yMetricToPlot = yMetric || metrics[1];

    // Get split name for title if applicable
    let titleSuffix = '';
    const hasSplits = activityDef?.has_splits && activityDef?.split_definitions?.length > 0;
    if (hasSplits && selectedSplit !== 'all') {
        const splitDef = activityDef.split_definitions.find(s => s.id === selectedSplit);
        if (splitDef) {
            titleSuffix = ` - ${splitDef.name}`;
        }
    }

    const xAxisLabel = xMetricToPlot ? `${xMetricToPlot.name} (${xMetricToPlot.unit})` : '';
    const yAxisLabel = yMetricToPlot ? `${yMetricToPlot.name} (${yMetricToPlot.unit})` : '';
    const chartTitle = selectedActivity ? `${selectedActivity.name}${titleSuffix} - Metrics Analysis` : '';

    // Use hook for options
    const baseOptions = useChartOptions({
        title: chartTitle,
        xAxisLabel,
        yAxisLabel,
        isTimeScale: false
    });

    if (!selectedActivity) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'var(--color-text-muted)',
                fontSize: '14px'
            }}>
                Select an activity to view analytics
            </div>
        );
    }

    const instances = activityInstances[selectedActivity.id] || [];

    if (!activityDef || instances.length === 0) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'var(--color-text-muted)',
                fontSize: '14px'
            }}>
                No data available for this activity
            </div>
        );
    }

    // Scatter plot requires at least 2 metrics
    if (metrics.length < 2) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: '16px',
                color: 'var(--color-text-muted)',
                textAlign: 'center',
                padding: '20px'
            }}>
                <div style={{ fontSize: '48px' }}>📊</div>
                <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                    Scatter Plot Unavailable
                </div>
                <div style={{ fontSize: '14px', maxWidth: '400px' }}>
                    Scatter plots require at least 2 metrics to compare.
                    This activity only has {metrics.length === 0 ? 'no metrics' : '1 metric'}.
                </div>
                <div style={{
                    fontSize: '13px',
                    color: 'var(--color-brand-primary)',
                    marginTop: '8px'
                }}>
                    Try the Line Graph view instead to see metric progression over time.
                </div>
            </div>
        );
    }

    // Collect data points from instances
    const dataPoints = [];
    instances.forEach(instance => {
        const basePoint = {
            session_name: instance.session_name,
            session_date: instance.session_date
        };

        // For activities with sets
        if (instance.has_sets && instance.sets) {
            const allSets = [];
            instance.sets.forEach((set, setIdx) => {
                const setPoint = { ...basePoint, set_number: setIdx + 1 };
                if (set.metrics) {
                    set.metrics.forEach(m => {
                        // Filter by split if applicable
                        if (hasSplits) {
                            if (selectedSplit !== 'all' && m.split_id !== selectedSplit) {
                                return;
                            }
                            if (selectedSplit === 'all' && !m.split_id) {
                                return;
                            }
                        } else {
                            if (m.split_id) return;
                        }

                        const metricDef = metrics.find(md => md.id === m.metric_id);
                        if (metricDef && m.value) {
                            setPoint[metricDef.id] = parseFloat(m.value);
                        }
                    });
                }
                // Only include if we have both selected metrics
                if (setPoint[xMetricToPlot.id] != null && setPoint[yMetricToPlot.id] != null) {
                    allSets.push(setPoint);
                }
            });

            if (allSets.length > 0) {
                if (setsHandling === 'top') {
                    // Find set with highest value of X metric
                    const topSet = allSets.reduce((max, current) =>
                        (current[xMetricToPlot.id] || 0) > (max[xMetricToPlot.id] || 0) ? current : max
                    );
                    topSet.aggregation = 'Top Set';
                    dataPoints.push(topSet);
                } else if (setsHandling === 'average') {
                    const avgPoint = { ...basePoint, aggregation: `Avg of ${allSets.length} sets` };
                    [xMetricToPlot, yMetricToPlot].forEach(metricDef => {
                        const values = allSets
                            .map(s => s[metricDef.id])
                            .filter(v => v != null);
                        if (values.length > 0) {
                            avgPoint[metricDef.id] = Math.round(
                                (values.reduce((sum, v) => sum + v, 0) / values.length) * 100
                            ) / 100;
                        }
                    });
                    if (avgPoint[xMetricToPlot.id] != null && avgPoint[yMetricToPlot.id] != null) {
                        dataPoints.push(avgPoint);
                    }
                }
            }
        }
        // For activities without sets
        else if (instance.metrics) {
            const point = { ...basePoint };
            instance.metrics.forEach(m => {
                if (hasSplits) {
                    if (selectedSplit !== 'all' && m.split_id !== selectedSplit) {
                        return;
                    }
                    if (selectedSplit === 'all' && !m.split_id) {
                        return;
                    }
                } else {
                    if (m.split_id) return;
                }

                const metricDef = metrics.find(md => md.id === m.metric_id);
                if (metricDef && m.value) {
                    point[metricDef.id] = parseFloat(m.value);
                }
            });
            if (point[xMetricToPlot.id] != null && point[yMetricToPlot.id] != null) {
                dataPoints.push(point);
            }
        }
    });

    if (dataPoints.length === 0) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: '20px'
            }}>
                <div style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>
                    No metric data available for the selected metrics
                </div>
                {/* Metric Selectors */}
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>X-Axis:</span>
                        <select
                            value={xMetricToPlot.id}
                            onChange={(e) => {
                                const metric = metrics.find(m => m.id === e.target.value);
                                setXMetric(metric);
                            }}
                            style={{
                                padding: '6px 12px',
                                background: 'var(--color-bg-input)',
                                border: '1px solid var(--color-border)',
                                borderRadius: '4px',
                                color: 'var(--color-text-primary)',
                                fontSize: '12px',
                                cursor: 'pointer'
                            }}
                        >
                            {metrics.map(metric => (
                                <option key={metric.id} value={metric.id}>
                                    {metric.name} ({metric.unit})
                                </option>
                            ))}
                        </select>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Y-Axis:</span>
                        <select
                            value={yMetricToPlot.id}
                            onChange={(e) => {
                                const metric = metrics.find(m => m.id === e.target.value);
                                setYMetric(metric);
                            }}
                            style={{
                                padding: '6px 12px',
                                background: 'var(--color-bg-input)',
                                border: '1px solid var(--color-border)',
                                borderRadius: '4px',
                                color: 'var(--color-text-primary)',
                                fontSize: '12px',
                                cursor: 'pointer'
                            }}
                        >
                            {metrics.map(metric => (
                                <option key={metric.id} value={metric.id}>
                                    {metric.name} ({metric.unit})
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
        );
    }

    // Prepare chart data
    const chartDataPoints = dataPoints.map(p => ({
        x: p[xMetricToPlot.id],
        y: p[yMetricToPlot.id],
        session_name: p.session_name,
        session_date: p.session_date,
        aggregation: p.aggregation,
        set_number: p.set_number
    }));

    const chartData = {
        datasets: [{
            label: selectedActivity.name,
            data: chartDataPoints,
            backgroundColor: 'rgba(33, 150, 243, 0.7)',
            borderColor: chartDefaults.borderColor,
            borderWidth: 1,
            pointRadius: 8,
            pointHoverRadius: 12,
            pointHoverBackgroundColor: chartDefaults.primaryColor,
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2
        }]
    };

    const options = {
        ...baseOptions,
        plugins: {
            ...baseOptions.plugins,
            tooltip: {
                ...baseOptions.plugins.tooltip,
                callbacks: {
                    title: function (context) {
                        const point = context[0].raw;
                        return point.session_name;
                    },
                    label: function (context) {
                        const point = context.raw;
                        const lines = [];

                        if (point.aggregation) {
                            lines.push(point.aggregation);
                        } else if (point.set_number) {
                            lines.push(`Set ${point.set_number}`);
                        }

                        lines.push(new Date(point.session_date).toLocaleDateString());
                        lines.push(`${xMetricToPlot.name}: ${point.x} ${xMetricToPlot.unit}`);
                        lines.push(`${yMetricToPlot.name}: ${point.y} ${yMetricToPlot.unit}`);

                        return lines;
                    }
                }
            }
        }
    };

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Metric Selectors */}
            <div style={{
                display: 'flex',
                gap: '16px',
                alignItems: 'center',
                padding: '0 20px',
                flexWrap: 'wrap'
            }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>X-Axis:</span>
                    <select
                        value={xMetricToPlot.id}
                        onChange={(e) => {
                            const metric = metrics.find(m => m.id === e.target.value);
                            setXMetric(metric);
                        }}
                        style={{
                            padding: '6px 12px',
                            background: 'var(--color-bg-input)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '4px',
                            color: 'var(--color-text-primary)',
                            fontSize: '12px',
                            cursor: 'pointer'
                        }}
                    >
                        {metrics.map(metric => (
                            <option key={metric.id} value={metric.id}>
                                {metric.name} ({metric.unit})
                            </option>
                        ))}
                    </select>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Y-Axis:</span>
                    <select
                        value={yMetricToPlot.id}
                        onChange={(e) => {
                            const metric = metrics.find(m => m.id === e.target.value);
                            setYMetric(metric);
                        }}
                        style={{
                            padding: '6px 12px',
                            background: 'var(--color-bg-input)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '4px',
                            color: 'var(--color-text-primary)',
                            fontSize: '12px',
                            cursor: 'pointer'
                        }}
                    >
                        {metrics.map(metric => (
                            <option key={metric.id} value={metric.id}>
                                {metric.name} ({metric.unit})
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Chart */}
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                <Scatter ref={chartRef} data={chartData} options={options} />
            </div>
        </div>
    );
}

export default ScatterPlot;
