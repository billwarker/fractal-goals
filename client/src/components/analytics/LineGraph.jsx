import React from 'react';
import { Line } from 'react-chartjs-2';
import { chartDefaults, useChartOptions } from './ChartJSWrapper'; // Import hook

/**
 * Line Graph component for visualizing metric progression over time
 * Supports dual Y-axis: Y1 (left) and Y2 (right)
 * Uses Chart.js via react-chartjs-2
 * Supports split filtering for split-enabled activities
 */
function LineGraph({
    selectedActivity,
    activityInstances,
    activities,
    selectedMetric,
    setSelectedMetric,
    selectedMetricY2 = null,
    setSelectedMetricY2 = null,
    setsHandling = 'top',
    selectedSplit = 'all',
    chartRef
}) {
    console.log('LineGraph called', { selectedActivity, selectedMetric, selectedMetricY2, selectedSplit });

    const activityDef = selectedActivity ? activities.find(a => a.id === selectedActivity.id) : null;
    const instances = activityInstances[selectedActivity?.id] || [];

    // Prepare metric definitions
    const metrics = activityDef?.metric_definitions || [];
    const hasSplits = activityDef?.has_splits && activityDef?.split_definitions?.length > 0;

    // Set default metric if not selected
    const metricToPlotY1 = selectedMetric || metrics[0];
    const metricToPlotY2 = selectedMetricY2; // Can be null (no second axis)

    // Check if we're plotting the product metric for each axis
    const isProductMetricY1 = metricToPlotY1?.id === '__product__';
    const isProductMetricY2 = metricToPlotY2?.id === '__product__';

    // Filter metrics for product calculation (only those marked as multiplicative)
    const multiplicativeMetrics = metrics.filter(m => m.is_multiplicative !== false);

    // Get split name for title if applicable
    let titleSuffix = '';
    if (hasSplits && selectedSplit !== 'all') {
        const splitDef = activityDef?.split_definitions?.find(s => s.id === selectedSplit);
        if (splitDef) {
            titleSuffix = ` - ${splitDef.name}`;
        }
    }

    // Generate labels for metrics
    const getMetricLabel = (metricToPlot, isProductMetric) => {
        if (!metricToPlot) return '';
        return isProductMetric
            ? multiplicativeMetrics.map(m => m.name).join(' × ')
            : metricToPlot.name;
    };

    const getMetricUnit = (metricToPlot, isProductMetric) => {
        if (!metricToPlot) return '';
        return isProductMetric
            ? multiplicativeMetrics.map(m => m.unit).join(' × ')
            : metricToPlot.unit;
    };

    const metricLabelY1 = getMetricLabel(metricToPlotY1, isProductMetricY1);
    const metricUnitY1 = getMetricUnit(metricToPlotY1, isProductMetricY1);
    const metricLabelY2 = metricToPlotY2 ? getMetricLabel(metricToPlotY2, isProductMetricY2) : '';
    const metricUnitY2 = metricToPlotY2 ? getMetricUnit(metricToPlotY2, isProductMetricY2) : '';

    // Build title
    const titleParts = [(selectedActivity?.name || '') + titleSuffix];
    if (metricLabelY1) titleParts.push(metricLabelY1);
    if (metricLabelY2) titleParts.push(metricLabelY2);
    const chartTitle = titleParts.length > 1 ? `${titleParts[0]} - ${titleParts.slice(1).join(' & ')} Over Time` : `${titleParts[0]} Over Time`;

    // Use the hook to get theme-aware options
    const baseOptions = useChartOptions({
        title: chartTitle,
        xAxisLabel: 'Date',
        yAxisLabel: `${metricLabelY1} (${metricUnitY1})`,
        isTimeScale: true
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

    if (metrics.length === 0) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'var(--color-text-muted)',
                fontSize: '14px'
            }}>
                This activity has no metrics to display
            </div>
        );
    }

    // Helper function to check if a metric should be included based on split filter
    const shouldIncludeMetric = (metric) => {
        if (hasSplits) {
            if (selectedSplit !== 'all' && metric.split_id !== selectedSplit) {
                return false; // Skip metrics that don't match selected split
            }
            if (selectedSplit === 'all' && !metric.split_id) {
                return false; // Skip non-split metrics when viewing all splits
            }
        } else {
            // For non-split activities, skip metrics with split_id
            if (metric.split_id) return false;
        }
        return true;
    };

    // Helper function to extract metric value from a set or instance
    const extractMetricValue = (metricsArray, metricToPlot, isProductMetric) => {
        if (isProductMetric) {
            // Calculate product using only multiplicative metrics
            let product = 1;
            let hasAllMetrics = true;

            multiplicativeMetrics.forEach(metricDef => {
                const metricValue = metricsArray.find(m =>
                    m.metric_id === metricDef.id && shouldIncludeMetric(m)
                );
                if (metricValue && metricValue.value) {
                    product *= parseFloat(metricValue.value);
                } else {
                    hasAllMetrics = false;
                }
            });

            if (hasAllMetrics && multiplicativeMetrics.length > 0) {
                return product;
            }
            return null;
        } else {
            const metricValue = metricsArray.find(m =>
                m.metric_id === metricToPlot.id && shouldIncludeMetric(m)
            );
            if (metricValue && metricValue.value) {
                return parseFloat(metricValue.value);
            }
            return null;
        }
    };

    // Find the metric designated as the "top set" metric
    const topSetMetric = metrics.find(m => m.is_top_set_metric) || metrics[0];

    // Collect data points with timestamps for both Y1 and Y2
    const collectDataPoints = (metricToPlot, isProductMetric) => {
        if (!metricToPlot) return [];

        const dataPoints = [];
        instances.forEach(instance => {
            const timestamp = new Date(instance.session_date);

            // For activities with sets
            if (instance.has_sets && instance.sets) {
                if (setsHandling === 'top') {
                    // Find the top set based on the designated top_set_metric
                    let topSetIndex = -1;
                    let topSetValue = -Infinity;

                    instance.sets.forEach((set, setIdx) => {
                        if (set.metrics) {
                            const metricValue = set.metrics.find(m =>
                                m.metric_id === (isProductMetric ? topSetMetric.id : metricToPlot.id) &&
                                shouldIncludeMetric(m)
                            );
                            if (metricValue && metricValue.value) {
                                const value = parseFloat(metricValue.value);
                                if (value > topSetValue) {
                                    topSetValue = value;
                                    topSetIndex = setIdx;
                                }
                            }
                        }
                    });

                    // Now get the value from the top set
                    if (topSetIndex >= 0) {
                        const topSet = instance.sets[topSetIndex];
                        const value = extractMetricValue(topSet.metrics, metricToPlot, isProductMetric);
                        if (value !== null) {
                            dataPoints.push({
                                timestamp,
                                value,
                                session_name: instance.session_name,
                                set_number: topSetIndex + 1,
                                aggregation: 'Top Set'
                            });
                        }
                    }
                } else if (setsHandling === 'average') {
                    // Calculate average across all sets
                    const setValues = [];

                    instance.sets.forEach((set) => {
                        if (set.metrics) {
                            const value = extractMetricValue(set.metrics, metricToPlot, isProductMetric);
                            if (value !== null) {
                                setValues.push(value);
                            }
                        }
                    });

                    if (setValues.length > 0) {
                        const avgValue = setValues.reduce((sum, v) => sum + v, 0) / setValues.length;
                        dataPoints.push({
                            timestamp,
                            value: Math.round(avgValue * 100) / 100,
                            session_name: instance.session_name,
                            set_number: null,
                            aggregation: `Avg of ${setValues.length} sets`
                        });
                    }
                }
            }
            // For activities without sets
            else if (instance.metrics) {
                const value = extractMetricValue(instance.metrics, metricToPlot, isProductMetric);
                if (value !== null) {
                    dataPoints.push({
                        timestamp,
                        value,
                        session_name: instance.session_name,
                        set_number: 1
                    });
                }
            }
        });

        // Sort by timestamp
        dataPoints.sort((a, b) => a.timestamp - b.timestamp);
        return dataPoints;
    };

    const dataPointsY1 = collectDataPoints(metricToPlotY1, isProductMetricY1);
    const dataPointsY2 = metricToPlotY2 ? collectDataPoints(metricToPlotY2, isProductMetricY2) : [];

    if (dataPointsY1.length === 0 && dataPointsY2.length === 0) {
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
                    No data available for the selected metric(s)
                </div>
                {renderMetricSelectors(metrics, metricToPlotY1, setSelectedMetric, metricToPlotY2, setSelectedMetricY2, activityDef, multiplicativeMetrics)}
            </div>
        );
    }

    // Colors for Y1 and Y2
    const lineColorY1 = isProductMetricY1 ? chartDefaults.secondaryColor : chartDefaults.primaryColor;
    const borderLineColorY1 = isProductMetricY1 ? '#c2185b' : chartDefaults.borderColor;
    const lineColorY2 = '#ff9800'; // Orange for Y2 axis
    const borderLineColorY2 = '#e65100';

    // Prepare chart data
    const chartDataPointsY1 = dataPointsY1.map(p => ({
        x: p.timestamp,
        y: p.value,
        session_name: p.session_name,
        aggregation: p.aggregation,
        set_number: p.set_number
    }));

    const chartDataPointsY2 = dataPointsY2.map(p => ({
        x: p.timestamp,
        y: p.value,
        session_name: p.session_name,
        aggregation: p.aggregation,
        set_number: p.set_number
    }));

    const datasets = [
        {
            label: metricLabelY1,
            data: chartDataPointsY1,
            borderColor: lineColorY1,
            backgroundColor: `${lineColorY1}33`,
            borderWidth: 2,
            pointRadius: 6,
            pointHoverRadius: 10,
            pointBackgroundColor: lineColorY1,
            pointBorderColor: borderLineColorY1,
            pointBorderWidth: 1,
            pointHoverBackgroundColor: lineColorY1,
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2,
            fill: false,
            tension: 0.1,
            yAxisID: 'y'
        }
    ];

    if (metricToPlotY2 && chartDataPointsY2.length > 0) {
        datasets.push({
            label: metricLabelY2,
            data: chartDataPointsY2,
            borderColor: lineColorY2,
            backgroundColor: `${lineColorY2}33`,
            borderWidth: 2,
            pointRadius: 6,
            pointHoverRadius: 10,
            pointBackgroundColor: lineColorY2,
            pointBorderColor: borderLineColorY2,
            pointBorderWidth: 1,
            pointHoverBackgroundColor: lineColorY2,
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2,
            fill: false,
            tension: 0.1,
            yAxisID: 'y1'
        });
    }

    const chartData = { datasets };

    // Merge base options with specific needs
    const options = {
        ...baseOptions,
        scales: {
            ...baseOptions.scales,
            y: {
                ...baseOptions.scales.y,
                position: 'left',
                title: {
                    display: true,
                    text: `${metricLabelY1} (${metricUnitY1})`,
                    color: lineColorY1,
                    font: { size: 12, weight: 'bold' }
                },
                ticks: {
                    color: lineColorY1
                }
            },
            ...(metricToPlotY2 && chartDataPointsY2.length > 0 ? {
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: `${metricLabelY2} (${metricUnitY2})`,
                        color: lineColorY2,
                        font: { size: 12, weight: 'bold' }
                    },
                    ticks: {
                        color: lineColorY2
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            } : {})
        },
        plugins: {
            ...baseOptions.plugins,
            legend: {
                display: metricToPlotY2 !== null,
                position: 'top',
                labels: {
                    color: '#888', // Fallback
                    usePointStyle: true,
                    padding: 20
                }
            },
            tooltip: {
                ...baseOptions.plugins.tooltip,
                callbacks: {
                    title: function (context) {
                        const point = context[0].raw;
                        return point.session_name;
                    },
                    label: function (context) {
                        const point = context.raw;
                        const datasetLabel = context.dataset.label;
                        const isY2 = context.dataset.yAxisID === 'y1';
                        const unit = isY2 ? metricUnitY2 : metricUnitY1;
                        const isProduct = isY2 ? isProductMetricY2 : isProductMetricY1;

                        const lines = [];

                        if (point.aggregation) {
                            lines.push(point.aggregation);
                        } else if (point.set_number) {
                            lines.push(`Set ${point.set_number}`);
                        }

                        lines.push(point.x.toLocaleDateString());
                        lines.push(`${datasetLabel}: ${point.y}${isProduct ? ` (${unit})` : ` ${unit}`}`);

                        return lines;
                    }
                }
            }
        }
    };

    // Helper function to render metric selectors
    function renderMetricSelectors(metrics, metricY1, setMetricY1, metricY2, setMetricY2, activityDef, multiplicativeMetrics) {
        const selectStyle = {
            padding: '6px 12px',
            background: 'var(--color-bg-input)',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            color: 'var(--color-text-primary)',
            fontSize: '12px',
            cursor: 'pointer',
            minWidth: '150px'
        };

        return (
            <div style={{
                display: 'flex',
                gap: '24px',
                alignItems: 'center',
                padding: '0 20px',
                flexWrap: 'wrap'
            }}>
                {/* Y1 Axis Metric Selector */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        background: isProductMetricY1 ? chartDefaults.secondaryColor : chartDefaults.primaryColor
                    }} />
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Y-Axis (Left):</span>
                    <select
                        value={metricY1?.id || ''}
                        onChange={(e) => {
                            if (e.target.value === '__product__') {
                                setMetricY1({ id: '__product__', name: 'Product', unit: 'Product' });
                            } else {
                                const metric = metrics.find(m => m.id === e.target.value);
                                setMetricY1(metric);
                            }
                        }}
                        style={selectStyle}
                    >
                        {metrics.map(metric => (
                            <option key={metric.id} value={metric.id}>
                                {metric.name} ({metric.unit})
                            </option>
                        ))}
                        {/* Add Product option if activity has metrics_multiplicative */}
                        {activityDef.metrics_multiplicative && multiplicativeMetrics.length > 1 && (
                            <option value="__product__" style={{ color: '#e91e63' }}>
                                ({multiplicativeMetrics.map(m => m.name).join(' × ')})
                            </option>
                        )}
                    </select>
                </div>

                {/* Y2 Axis Metric Selector */}
                {setMetricY2 && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <div style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            background: '#ff9800'
                        }} />
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Y-Axis (Right):</span>
                        <select
                            value={metricY2?.id || ''}
                            onChange={(e) => {
                                if (e.target.value === '') {
                                    setMetricY2(null);
                                } else if (e.target.value === '__product__') {
                                    setMetricY2({ id: '__product__', name: 'Product', unit: 'Product' });
                                } else {
                                    const metric = metrics.find(m => m.id === e.target.value);
                                    setMetricY2(metric);
                                }
                            }}
                            style={{ ...selectStyle, borderColor: metricY2 ? '#ff9800' : 'var(--color-border)' }}
                        >
                            <option value="">None (Single Axis)</option>
                            {metrics.map(metric => (
                                <option key={metric.id} value={metric.id}>
                                    {metric.name} ({metric.unit})
                                </option>
                            ))}
                            {/* Add Product option if activity has metrics_multiplicative */}
                            {activityDef.metrics_multiplicative && multiplicativeMetrics.length > 1 && (
                                <option value="__product__" style={{ color: '#e91e63' }}>
                                    ({multiplicativeMetrics.map(m => m.name).join(' × ')})
                                </option>
                            )}
                        </select>
                    </div>
                )}

                {/* Swap Button */}
                {setMetricY2 && metricY2 && (
                    <button
                        onClick={() => {
                            const tempY1 = metricY1;
                            setMetricY1(metricY2);
                            setMetricY2(tempY1);
                        }}
                        style={{
                            padding: '6px 12px',
                            background: 'var(--color-bg-surface)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '4px',
                            color: 'var(--color-text-secondary)',
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}
                        title="Swap Y-Axis metrics"
                    >
                        ⇄ Swap Axes
                    </button>
                )}
            </div>
        );
    }

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {renderMetricSelectors(metrics, metricToPlotY1, setSelectedMetric, metricToPlotY2, setSelectedMetricY2, activityDef, multiplicativeMetrics)}
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                <Line ref={chartRef} data={chartData} options={options} />
            </div>
        </div>
    );
}

export default LineGraph;
