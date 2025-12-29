import React from 'react';
import PlotlyChart from './PlotlyChart';

/**
 * Scatter Plot component for visualizing activity metrics
 * Supports both 2D and 3D scatter plots based on number of metrics
 */
function ScatterPlot({ selectedActivity, activityInstances, activities, setsHandling = 'top' }) {
    console.log('ScatterPlot called', { selectedActivity, activityInstances });

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

    console.log('Metrics:', metrics);

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

    // Determine which metrics to plot (up to 3)
    const metricsToPlot = metrics.slice(0, 3);
    const is3D = metricsToPlot.length === 3;

    console.log('Metrics to plot:', metricsToPlot, 'is3D:', is3D);

    // Prepare plot data
    const xData = dataPoints.map(p => p[metricsToPlot[0].name]).filter(v => v != null);
    const yData = metricsToPlot[1] ? dataPoints.map(p => p[metricsToPlot[1].name]).filter(v => v != null) : [];
    const zData = is3D ? dataPoints.map(p => p[metricsToPlot[2].name]).filter(v => v != null) : [];

    console.log('Plot data:', { xData, yData, zData });

    if (xData.length === 0) {
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

    const plotData = [{
        x: xData,
        y: yData.length > 0 ? yData : undefined,
        z: zData.length > 0 ? zData : undefined,
        mode: 'markers',
        type: is3D ? 'scatter3d' : 'scatter',
        marker: {
            size: 8,
            color: '#2196f3',
            opacity: 0.7,
            line: {
                color: '#1976d2',
                width: 1
            }
        },
        text: dataPoints.map(p =>
            `${p.session_name}<br>${p.aggregation || (p.set_number ? `Set ${p.set_number}` : '')}<br>${new Date(p.session_date).toLocaleDateString()}`
        ),
        hovertemplate: '%{text}<br>' +
            `${metricsToPlot[0].name}: %{x} ${metricsToPlot[0].unit}<br>` +
            (metricsToPlot[1] ? `${metricsToPlot[1].name}: %{y} ${metricsToPlot[1].unit}<br>` : '') +
            (is3D ? `${metricsToPlot[2].name}: %{z} ${metricsToPlot[2].unit}<br>` : '') +
            '<extra></extra>'
    }];

    const layout = {
        title: {
            text: `${selectedActivity.name} - Metrics Analysis`,
            font: { color: '#ccc', size: 16 }
        },
        paper_bgcolor: '#1e1e1e',
        plot_bgcolor: '#252525',
        font: { color: '#ccc' },
        margin: { l: 60, r: 40, t: 60, b: 80 }, // Increased bottom margin for axis labels
        autosize: true
    };

    // Add appropriate axes based on plot type
    if (is3D) {
        layout.scene = {
            xaxis: {
                title: {
                    text: `${metricsToPlot[0].name} (${metricsToPlot[0].unit})`,
                    font: { color: '#ccc', size: 12 }
                },
                gridcolor: '#333',
                backgroundcolor: '#252525'
            },
            yaxis: {
                title: {
                    text: `${metricsToPlot[1].name} (${metricsToPlot[1].unit})`,
                    font: { color: '#ccc', size: 12 }
                },
                gridcolor: '#333',
                backgroundcolor: '#252525'
            },
            zaxis: {
                title: {
                    text: `${metricsToPlot[2].name} (${metricsToPlot[2].unit})`,
                    font: { color: '#ccc', size: 12 }
                },
                gridcolor: '#333',
                backgroundcolor: '#252525'
            }
        };
    } else {
        layout.xaxis = {
            title: {
                text: `${metricsToPlot[0].name} (${metricsToPlot[0].unit})`,
                font: { color: '#ccc', size: 12 }
            },
            gridcolor: '#333',
            zerolinecolor: '#444'
        };
        if (metricsToPlot[1]) {
            layout.yaxis = {
                title: {
                    text: `${metricsToPlot[1].name} (${metricsToPlot[1].unit})`,
                    font: { color: '#ccc', size: 12 }
                },
                gridcolor: '#333',
                zerolinecolor: '#444'
            };
        }
    }

    console.log('Rendering plot with data:', plotData, 'layout:', layout);

    return <PlotlyChart data={plotData} layout={layout} />;
}

export default ScatterPlot;
