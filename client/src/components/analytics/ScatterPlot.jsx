import React from 'react';
import { Scatter } from 'react-chartjs-2';
import { chartDefaults, createChartOptions } from './ChartJSWrapper';

/**
 * Scatter Plot component for visualizing activity metrics
 * Uses Chart.js via react-chartjs-2
 * Note: Chart.js does not support 3D scatter plots, so we display 2D with the first two metrics
 * Supports split filtering for split-enabled activities
 */
function ScatterPlot({ selectedActivity, activityInstances, activities, setsHandling = 'top', selectedSplit = 'all' }) {
    console.log('ScatterPlot called', { selectedActivity, activityInstances, selectedSplit });

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

    console.log('Activity instances:', instances);
    console.log('Activity definition:', activityDef);

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

    console.log('Metrics:', metrics, 'Has splits:', hasSplits);

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

    // Collect data points from instances
    const dataPoints = [];
    instances.forEach(instance => {
        const basePoint = {
            session_name: instance.session_name,
            session_date: instance.session_date
        };

        // For activities with sets
        if (instance.has_sets && instance.sets) {
            // Collect metrics from all sets
            const allSets = [];
            instance.sets.forEach((set, setIdx) => {
                const setPoint = { ...basePoint, set_number: setIdx + 1 };
                if (set.metrics) {
                    set.metrics.forEach(m => {
                        // Filter by split if applicable
                        if (hasSplits) {
                            if (selectedSplit !== 'all' && m.split_id !== selectedSplit) {
                                return; // Skip metrics that don't match selected split
                            }
                            if (selectedSplit === 'all' && !m.split_id) {
                                return; // Skip non-split metrics when viewing all splits
                            }
                        } else {
                            // For non-split activities, skip metrics with split_id
                            if (m.split_id) return;
                        }

                        const metricDef = metrics.find(md => md.id === m.metric_id);
                        if (metricDef && m.value) {
                            setPoint[metricDef.name] = parseFloat(m.value);
                        }
                    });
                }
                if (Object.keys(setPoint).length > 3) { // Has at least one metric
                    allSets.push(setPoint);
                }
            });

            if (allSets.length > 0) {
                if (setsHandling === 'top') {
                    // Find set with highest value of first metric
                    const firstMetric = metrics[0].name;
                    const topSet = allSets.reduce((max, current) =>
                        (current[firstMetric] || 0) > (max[firstMetric] || 0) ? current : max
                    );
                    topSet.aggregation = 'Top Set';
                    dataPoints.push(topSet);
                } else if (setsHandling === 'average') {
                    // Calculate average for each metric
                    const avgPoint = { ...basePoint, aggregation: `Avg of ${allSets.length} sets` };
                    metrics.forEach(metricDef => {
                        const values = allSets
                            .map(s => s[metricDef.name])
                            .filter(v => v != null);
                        if (values.length > 0) {
                            avgPoint[metricDef.name] = Math.round(
                                (values.reduce((sum, v) => sum + v, 0) / values.length) * 100
                            ) / 100;
                        }
                    });
                    if (Object.keys(avgPoint).length > 3) {
                        dataPoints.push(avgPoint);
                    }
                }
            }
        }
        // For activities without sets
        else if (instance.metrics) {
            const point = { ...basePoint };
            instance.metrics.forEach(m => {
                // Filter by split if applicable
                if (hasSplits) {
                    if (selectedSplit !== 'all' && m.split_id !== selectedSplit) {
                        return; // Skip metrics that don't match selected split
                    }
                    if (selectedSplit === 'all' && !m.split_id) {
                        return; // Skip non-split metrics when viewing all splits
                    }
                } else {
                    // For non-split activities, skip metrics with split_id
                    if (m.split_id) return;
                }

                const metricDef = metrics.find(md => md.id === m.metric_id);
                if (metricDef && m.value) {
                    point[metricDef.name] = parseFloat(m.value);
                }
            });
            if (Object.keys(point).length > 2) { // Has at least one metric
                dataPoints.push(point);
            }
        }
    });

    console.log('Data points:', dataPoints);

    if (dataPoints.length === 0) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#666',
                fontSize: '14px'
            }}>
                No metric data available for this activity
            </div>
        );
    }

    // Determine which metrics to plot (Chart.js only supports 2D)
    const metricsToPlot = metrics.slice(0, 2);
    const hasSecondMetric = metricsToPlot.length >= 2;

    console.log('Metrics to plot:', metricsToPlot);

    // Prepare chart data
    const chartDataPoints = dataPoints
        .filter(p => p[metricsToPlot[0].name] != null && (!hasSecondMetric || p[metricsToPlot[1]?.name] != null))
        .map(p => ({
            x: p[metricsToPlot[0].name],
            y: hasSecondMetric ? p[metricsToPlot[1].name] : p[metricsToPlot[0].name],
            label: `${p.session_name}\n${p.aggregation || (p.set_number ? `Set ${p.set_number}` : '')}\n${new Date(p.session_date).toLocaleDateString()}`
        }));

    console.log('Chart data points:', chartDataPoints);

    if (chartDataPoints.length === 0) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#666',
                fontSize: '14px'
            }}>
                No valid metric values found
            </div>
        );
    }

    // Get split name for title if applicable
    let titleSuffix = '';
    if (hasSplits && selectedSplit !== 'all') {
        const splitDef = activityDef.split_definitions.find(s => s.id === selectedSplit);
        if (splitDef) {
            titleSuffix = ` - ${splitDef.name}`;
        }
    }

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

    const xAxisLabel = `${metricsToPlot[0].name} (${metricsToPlot[0].unit})`;
    const yAxisLabel = hasSecondMetric
        ? `${metricsToPlot[1].name} (${metricsToPlot[1].unit})`
        : `${metricsToPlot[0].name} (${metricsToPlot[0].unit})`;

    const options = {
        ...createChartOptions({
            title: `${selectedActivity.name}${titleSuffix} - Metrics Analysis`,
            xAxisLabel,
            yAxisLabel,
            isTimeScale: false
        }),
        plugins: {
            ...createChartOptions({}).plugins,
            tooltip: {
                ...createChartOptions({}).plugins.tooltip,
                callbacks: {
                    label: function (context) {
                        const point = context.raw;
                        const lines = [
                            point.label,
                            `${metricsToPlot[0].name}: ${point.x} ${metricsToPlot[0].unit}`
                        ];
                        if (hasSecondMetric) {
                            lines.push(`${metricsToPlot[1].name}: ${point.y} ${metricsToPlot[1].unit}`);
                        }
                        return lines;
                    }
                }
            }
        }
    };

    console.log('Rendering Chart.js scatter plot with data:', chartData);

    // Show notice if 3D was intended but we're using 2D
    const show3DNotice = metrics.length >= 3;

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            {show3DNotice && (
                <div style={{
                    padding: '8px 16px',
                    background: 'rgba(255, 152, 0, 0.15)',
                    border: '1px solid rgba(255, 152, 0, 0.3)',
                    borderRadius: '4px',
                    marginBottom: '12px',
                    fontSize: '12px',
                    color: '#ff9800'
                }}>
                    📊 This activity has {metrics.length} metrics. Showing first 2 metrics in 2D view.
                </div>
            )}
            <div style={{ flex: 1, minHeight: 0 }}>
                <Scatter data={chartData} options={options} />
            </div>
        </div>
    );
}

export default ScatterPlot;
