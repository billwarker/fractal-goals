import React from 'react';
import PlotlyChart from './PlotlyChart';

/**
 * Line Graph component for visualizing metric progression over time
 * Shows a single metric on Y-axis and time on X-axis
 * Supports split filtering for split-enabled activities
 */
function LineGraph({ selectedActivity, activityInstances, activities, selectedMetric, setSelectedMetric, setsHandling = 'top', selectedSplit = 'all' }) {
    console.log('LineGraph called', { selectedActivity, selectedMetric, selectedSplit });

    if (!selectedActivity) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#666',
                fontSize: '14px'
            }}>
                Select an activity to view analytics
            </div>
        );
    }

    const instances = activityInstances[selectedActivity.id] || [];
    const activityDef = activities.find(a => a.id === selectedActivity.id);

    if (!activityDef || instances.length === 0) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#666',
                fontSize: '14px'
            }}>
                No data available for this activity
            </div>
        );
    }

    const metrics = activityDef.metric_definitions || [];
    const hasSplits = activityDef.has_splits && activityDef.split_definitions?.length > 0;

    if (metrics.length === 0) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#666',
                fontSize: '14px'
            }}>
                This activity has no metrics to display
            </div>
        );
    }

    // Set default metric if not selected
    const metricToPlot = selectedMetric || metrics[0];

    // Check if we're plotting the product metric
    const isProductMetric = metricToPlot.id === '__product__';

    // Find the metric designated as the "top set" metric
    const topSetMetric = metrics.find(m => m.is_top_set_metric) || metrics[0];

    // Filter metrics for product calculation (only those marked as multiplicative)
    const multiplicativeMetrics = metrics.filter(m => m.is_multiplicative !== false);

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

    // Collect data points with timestamps
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

                    if (isProductMetric) {
                        // Calculate product using only multiplicative metrics from the top set
                        let product = 1;
                        let hasAllMetrics = true;

                        multiplicativeMetrics.forEach(metricDef => {
                            const metricValue = topSet.metrics.find(m =>
                                m.metric_id === metricDef.id && shouldIncludeMetric(m)
                            );
                            if (metricValue && metricValue.value) {
                                product *= parseFloat(metricValue.value);
                            } else {
                                hasAllMetrics = false;
                            }
                        });

                        if (hasAllMetrics && multiplicativeMetrics.length > 0) {
                            dataPoints.push({
                                timestamp,
                                value: product,
                                session_name: instance.session_name,
                                set_number: topSetIndex + 1,
                                aggregation: 'Top Set'
                            });
                        }
                    } else {
                        // Normal single metric from top set
                        const metricValue = topSet.metrics.find(m =>
                            m.metric_id === metricToPlot.id && shouldIncludeMetric(m)
                        );
                        if (metricValue && metricValue.value) {
                            dataPoints.push({
                                timestamp,
                                value: parseFloat(metricValue.value),
                                session_name: instance.session_name,
                                set_number: topSetIndex + 1,
                                aggregation: 'Top Set'
                            });
                        }
                    }
                }
            } else if (setsHandling === 'average') {
                // Calculate average across all sets
                const setValues = [];

                instance.sets.forEach((set, setIdx) => {
                    if (set.metrics) {
                        if (isProductMetric) {
                            // Calculate product for this set using only multiplicative metrics
                            let product = 1;
                            let hasAllMetrics = true;

                            multiplicativeMetrics.forEach(metricDef => {
                                const metricValue = set.metrics.find(m =>
                                    m.metric_id === metricDef.id && shouldIncludeMetric(m)
                                );
                                if (metricValue && metricValue.value) {
                                    product *= parseFloat(metricValue.value);
                                } else {
                                    hasAllMetrics = false;
                                }
                            });

                            if (hasAllMetrics && multiplicativeMetrics.length > 0) {
                                setValues.push(product);
                            }
                        } else {
                            // Normal single metric
                            const metricValue = set.metrics.find(m =>
                                m.metric_id === metricToPlot.id && shouldIncludeMetric(m)
                            );
                            if (metricValue && metricValue.value) {
                                setValues.push(parseFloat(metricValue.value));
                            }
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
            if (isProductMetric) {
                // For product metric, multiply only multiplicative metric values
                let product = 1;
                let hasAllMetrics = true;
                multiplicativeMetrics.forEach(metricDef => {
                    const metricValue = instance.metrics.find(m =>
                        m.metric_id === metricDef.id && shouldIncludeMetric(m)
                    );
                    if (metricValue && metricValue.value) {
                        product *= parseFloat(metricValue.value);
                    } else {
                        hasAllMetrics = false;
                    }
                });
                if (hasAllMetrics && multiplicativeMetrics.length > 0) {
                    dataPoints.push({
                        timestamp,
                        value: product,
                        session_name: instance.session_name,
                        set_number: 1
                    });
                }
            } else {
                // Normal single metric
                instance.metrics.forEach(m => {
                    if (m.metric_id === metricToPlot.id && m.value && shouldIncludeMetric(m)) {
                        dataPoints.push({
                            timestamp,
                            value: parseFloat(m.value),
                            session_name: instance.session_name,
                            set_number: 1
                        });
                    }
                });
            }
        }
    });

    // Sort by timestamp
    dataPoints.sort((a, b) => a.timestamp - b.timestamp);

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
                <div style={{ color: '#666', fontSize: '14px' }}>
                    No data available for the selected metric
                </div>
                {/* Metric Selector */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#888' }}>Metric:</span>
                    <select
                        value={metricToPlot.id}
                        onChange={(e) => {
                            const metric = metrics.find(m => m.id === e.target.value);
                            setSelectedMetric(metric);
                        }}
                        style={{
                            padding: '6px 12px',
                            background: '#333',
                            border: '1px solid #444',
                            borderRadius: '4px',
                            color: 'white',
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
        );
    }

    // Generate label for product metric
    const metricLabel = isProductMetric
        ? multiplicativeMetrics.map(m => m.name).join(' × ')
        : metricToPlot.name;
    const metricUnitText = isProductMetric
        ? multiplicativeMetrics.map(m => m.unit).join(' × ')
        : metricToPlot.unit;

    // Get split name for title if applicable
    let titleSuffix = '';
    if (hasSplits && selectedSplit !== 'all') {
        const splitDef = activityDef.split_definitions.find(s => s.id === selectedSplit);
        if (splitDef) {
            titleSuffix = ` - ${splitDef.name}`;
        }
    }

    const plotData = [{
        x: dataPoints.map(p => p.timestamp),
        y: dataPoints.map(p => p.value),
        mode: 'lines+markers',
        type: 'scatter',
        line: {
            color: isProductMetric ? '#e91e63' : '#2196f3',
            width: 2
        },
        marker: {
            size: 8,
            color: isProductMetric ? '#e91e63' : '#2196f3',
            line: {
                color: isProductMetric ? '#c2185b' : '#1976d2',
                width: 1
            }
        },
        text: dataPoints.map(p =>
            `${p.session_name}<br>${p.aggregation || (p.set_number ? `Set ${p.set_number}` : '')}<br>${p.timestamp.toLocaleDateString()}`
        ),
        hovertemplate: '%{text}<br>' +
            `${metricLabel}: %{y}${isProductMetric ? ` (${metricUnitText})` : ` ${metricUnitText}`}<br>` +
            '<extra></extra>'
    }];

    const layout = {
        title: {
            text: `${selectedActivity.name}${titleSuffix} - ${metricLabel} Over Time`,
            font: { color: '#ccc', size: 16 }
        },
        paper_bgcolor: '#1e1e1e',
        plot_bgcolor: '#252525',
        font: { color: '#ccc' },
        margin: { l: 70, r: 40, t: 60, b: 80 }, // Increased left margin for longer labels
        autosize: true,
        xaxis: {
            title: {
                text: 'Date',
                font: { color: '#ccc', size: 12 }
            },
            gridcolor: '#333',
            zerolinecolor: '#444',
            type: 'date'
        },
        yaxis: {
            title: {
                text: `${metricLabel} (${metricUnitText})`,
                font: { color: '#ccc', size: 12 }
            },
            gridcolor: '#333',
            zerolinecolor: '#444'
        }
    };

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Metric Selector */}
            <div style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
                padding: '0 20px'
            }}>
                <span style={{ fontSize: '12px', color: '#888' }}>Y-Axis Metric:</span>
                <select
                    value={metricToPlot.id}
                    onChange={(e) => {
                        if (e.target.value === '__product__') {
                            setSelectedMetric({ id: '__product__', name: 'Product', unit: 'Product' });
                        } else {
                            const metric = metrics.find(m => m.id === e.target.value);
                            setSelectedMetric(metric);
                        }
                    }}
                    style={{
                        padding: '6px 12px',
                        background: '#333',
                        border: '1px solid #444',
                        borderRadius: '4px',
                        color: 'white',
                        fontSize: '12px',
                        cursor: 'pointer'
                    }}
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

            {/* Chart */}
            <div style={{ flex: 1 }}>
                <PlotlyChart data={plotData} layout={layout} />
            </div>
        </div>
    );
}

export default LineGraph;
