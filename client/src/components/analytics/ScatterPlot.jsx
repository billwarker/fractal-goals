import React, { useCallback, useRef } from 'react';
import { Scatter } from 'react-chartjs-2';
import { goalLineAnnotations } from '../../utils/goalConditionLines';
import { topSetPoint } from '../../utils/setAggregation';
import { applyChartDensity, useChartDensity, useChartOptions, useChartThemeDefaults } from './ChartJSWrapper';
import CompactChartFrame from './CompactChartFrame';
import { withScatterPointDensity } from './scatterPointProfile';
import useActiveChartPoint from './useActiveChartPoint';
import styles from './ScatterPlot.module.css';

/**
 * Scatter Plot component for visualizing activity metrics
 * Uses Chart.js via react-chartjs-2
 * Allows user to select X and Y axis metrics via dropdowns
 * Requires at least 2 metrics to be meaningful
 * Supports split filtering for split-enabled activities
 */
// Compact charts keep points small instead of growing them for repeated values.
const COMPACT_POINT_PROFILE = { baseRadius: 3, radiusStep: 1, hoverOffset: 2, maxRadius: 6 };

/** The canvas: a session hovered elsewhere becomes its active point (with tooltip unless compact). */
function ScatterCanvas({ chartRef, data, options, hoverInstanceId, compact }) {
    const ownRef = useRef(null);
    // Ours for the hover highlight, and the caller's (Analytics' chart menu) too.
    const setRef = useCallback((chart) => {
        ownRef.current = chart;
        if (chartRef) chartRef.current = chart;
    }, [chartRef]);
    const points = data.datasets[0]?.data || [];
    const active = hoverInstanceId
        ? points.flatMap((point, index) => (point.instance_id === hoverInstanceId ? [{ datasetIndex: 0, index }] : []))
        : [];
    useActiveChartPoint(ownRef, active, { tooltip: !compact });
    return <Scatter ref={setRef} data={data} options={options} />;
}

function ScatterPlot({
    selectedActivity,
    activityInstances,
    activities,
    setsHandling = 'top',
    selectedSplit = 'all',
    chartRef,
    selectedMetricX = null,
    selectedMetricY = null,
    goalLines = [],
    highlightInstanceId = null,
    hoverInstanceId = null,
    hideTitle = false,
}) {
    const chartTheme = useChartThemeDefaults();
    const density = useChartDensity();
    const activityDef = selectedActivity ? activities.find(a => a.id === selectedActivity.id) : null;
    const metrics = activityDef?.metric_definitions || [];

    // Use selected metrics or defaults
    const xMetricToPlot = metrics.find((metric) => metric.id === (selectedMetricX?.id || selectedMetricX)) || metrics[0];
    const yMetricToPlot = metrics.find((metric) => metric.id === (selectedMetricY?.id || selectedMetricY)) || metrics[1];

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
        title: hideTitle ? '' : chartTitle,
        xAxisLabel,
        yAxisLabel,
        isTimeScale: false
    });

    if (!selectedActivity) {
        return (
            <div className={styles.emptyStateContainer}>
                Select an activity to view analytics
            </div>
        );
    }

    const instances = activityInstances[selectedActivity.id] || [];

    if (!activityDef || instances.length === 0) {
        return (
            <div className={styles.emptyStateContainer}>
                No data available for this activity
            </div>
        );
    }

    // Scatter plot requires at least 2 metrics
    if (metrics.length < 2) {
        return (
            <div className={styles.unavailableContainer}>
                <div className={styles.unavailableIcon}>Scatter</div>
                <div className={styles.unavailableTitle}>
                    Scatter Plot Unavailable
                </div>
                <div className={styles.unavailableDescription}>
                    Scatter plots require at least 2 metrics to compare.
                    This activity only has {metrics.length === 0 ? 'no metrics' : '1 metric'}.
                </div>
                <div className={styles.unavailableSuggestion}>
                    Try Activity Trends to compare activity frequency and duration over time.
                </div>
            </div>
        );
    }

    // Collect data points from instances
    const dataPoints = [];
    instances.forEach(instance => {
        const tagNames = Array.isArray(instance.tags) && instance.tags.length > 0
            ? instance.tags.map((tag) => tag.name).join(', ')
            : null;
        const basePoint = {
            instance_id: instance.id,
            session_name: instance.session_name,
            session_date: instance.session_date,
            tag_label: tagNames,
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
                        if (metricDef && m.value != null && m.value !== '') {
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
                    // The best set by the Y metric's direction: one real set, not mixed values.
                    const topSet = { ...topSetPoint(allSets, yMetricToPlot), aggregation: 'Top Set' };
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
                if (metricDef && m.value != null && m.value !== '') {
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
            <div className={styles.noDataContainer}>
                <div className={styles.noDataText}>
                    No metric data available for the selected metrics
                </div>
            </div>
        );
    }

    // Prepare chart data
    const chartDataPoints = withScatterPointDensity(dataPoints.map(p => ({
        instance_id: p.instance_id,
        x: p[xMetricToPlot.id],
        y: p[yMetricToPlot.id],
        session_name: p.session_name,
        session_date: p.session_date,
        aggregation: p.aggregation,
        set_number: p.set_number,
        tag_label: p.tag_label,
    })), density === 'compact' ? COMPACT_POINT_PROFILE : undefined);

    const chartData = {
        datasets: [{
            label: selectedActivity.name,
            // Read by the chart's "Set goal here…" menu.
            metricX: xMetricToPlot?.id,
            metricY: yMetricToPlot?.id,
            data: chartDataPoints,
            backgroundColor: 'rgba(33, 150, 243, 0.7)',
            borderColor: chartTheme.borderColor,
            borderWidth: 1,
            // The highlighted instance (e.g. the session being edited) stands out.
            pointRadius: chartDataPoints.map((point) => point.pointRadius + (point.instance_id === highlightInstanceId ? 2 : 0)),
            pointBorderWidth: chartDataPoints.map((point) => (point.instance_id === highlightInstanceId ? 2 : 1)),
            pointBorderColor: chartDataPoints.map((point) => (
                point.instance_id === highlightInstanceId ? chartTheme.textColor : chartTheme.borderColor
            )),
            pointHoverRadius: chartDataPoints.map((point) => point.pointHoverRadius),
            pointHoverBackgroundColor: chartTheme.primaryColor,
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2
        }]
    };

    const options = {
        ...baseOptions,
        plugins: {
            ...baseOptions.plugins,
            annotation: {
                annotations: goalLineAnnotations(goalLines, {
                    ...(xMetricToPlot ? { [xMetricToPlot.id]: 'x' } : {}),
                    ...(yMetricToPlot ? { [yMetricToPlot.id]: 'y' } : {}),
                }),
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
                        const lines = [];

                        if (point.aggregation) {
                            lines.push(point.aggregation);
                        } else if (point.set_number) {
                            lines.push(`Set ${point.set_number}`);
                        }

                        lines.push(new Date(point.session_date).toLocaleDateString());
                        lines.push(`${xMetricToPlot.name}: ${point.x} ${xMetricToPlot.unit}`);
                        lines.push(`${yMetricToPlot.name}: ${point.y} ${yMetricToPlot.unit}`);
                        if (point.densityCount > 1) {
                            lines.push(`${point.densityCount} entries at this point`);
                        }

                        if (point.tag_label) {
                            lines.push(`Tags: ${point.tag_label}`);
                        }

                        return lines;
                    }
                }
            }
        }
    };

    const sessions = new Set(chartDataPoints.map((point) => point.instance_id)).size;
    const caption = density === 'compact'
        ? `${yMetricToPlot.name} vs ${xMetricToPlot.name} · ${sessions} session${sessions === 1 ? '' : 's'}`
        : null;
    return (
        <div className={styles.mainContainer}>
            <div className={styles.chartContainer}>
                <CompactChartFrame caption={caption}>
                    <ScatterCanvas
                        chartRef={chartRef}
                        data={chartData}
                        options={applyChartDensity(options, density)}
                        hoverInstanceId={hoverInstanceId}
                        compact={density === 'compact'}
                    />
                </CompactChartFrame>
            </div>
        </div>
    );
}

export default ScatterPlot;
