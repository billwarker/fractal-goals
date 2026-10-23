import React from 'react';

import { activityYieldIds, YIELD_METRIC_ID } from './MetricTrends';
import { MetricChipsField, MetricSelectField, SetsHandlingField } from './ActivityMetricFields';

export default function ActivityMetricControls({ context }) {
    const {
        metricDefinitions,
        onOpenActivityModal,
        selectedActivityDef,
        selectedMetricXId,
        selectedMetricYId,
        updateVisualizationState,
        visualization,
        visualizationState,
    } = context;

    const usesScatterMetrics = visualization.id === 'scatterPlot';
    const usesMetricTrendMetrics = visualization.id === 'metricTrends';
    const usesMetricProgressMetrics = visualization.id === 'metricProgress';
    const selectedTrendMetrics = visualizationState.metrics?.length
        ? visualizationState.metrics
        : metricDefinitions.slice(0, 2).map((metric) => metric.id);
    // Metric Trends can also plot the activity's yield.
    const trendOptions = activityYieldIds(selectedActivityDef).length >= 2
        ? [...metricDefinitions, { id: YIELD_METRIC_ID, name: 'Yield', unit: '' }]
        : metricDefinitions;
    const plotsYield = usesMetricTrendMetrics && selectedTrendMetrics.includes(YIELD_METRIC_ID);
    const progressMetricDefinitions = metricDefinitions.filter((metric) => metric.track_progress !== false);
    const selectedProgressMetricId = visualizationState?.metric?.id
        || visualizationState?.metric
        || progressMetricDefinitions[0]?.id
        || '';

    return (
        <>
            <button
                type="button"
                className="sessions-query-picker-button"
                onClick={onOpenActivityModal}
                disabled={context.profileActivities.length === 0}
            >
                {selectedActivityDef ? selectedActivityDef.name : 'Choose Activity'}
            </button>
            <div className="sessions-query-selection-preview">
                {selectedActivityDef ? selectedActivityDef.name : 'No activity selected'}
            </div>

            {selectedActivityDef?.has_sets && (usesScatterMetrics || usesMetricTrendMetrics) && (
                <SetsHandlingField
                    className="sessions-query-field-spaced"
                    value={visualizationState.setsHandling || 'top'}
                    allowTotal={plotsYield}
                    onChange={(setsHandling) => updateVisualizationState({ setsHandling })}
                />
            )}

            {selectedActivityDef?.has_splits && selectedActivityDef?.split_definitions?.length > 0 && (
                <label className="sessions-query-field sessions-query-field-spaced">
                    <span>Split</span>
                    <select
                        value={visualizationState.selectedSplit || 'all'}
                        onChange={(event) => updateVisualizationState({ selectedSplit: event.target.value })}
                    >
                        <option value="all">All Splits</option>
                        {selectedActivityDef.split_definitions.map((split) => (
                            <option key={split.id} value={split.id}>{split.name}</option>
                        ))}
                    </select>
                </label>
            )}

            {usesScatterMetrics && metricDefinitions.length > 0 && (
                <>
                    <MetricSelectField
                        className="sessions-query-field-spaced"
                        label="X Axis"
                        value={selectedMetricXId}
                        options={metricDefinitions}
                        onChange={(metric) => updateVisualizationState({ metricX: metric })}
                    />
                    <MetricSelectField
                        className="sessions-query-field-spaced"
                        label="Y Axis"
                        value={selectedMetricYId}
                        options={metricDefinitions}
                        onChange={(metric) => updateVisualizationState({ metricY: metric })}
                    />
                </>
            )}

            {usesMetricTrendMetrics && metricDefinitions.length > 0 && (
                <MetricChipsField
                    className="sessions-query-field-spaced"
                    options={trendOptions}
                    selected={selectedTrendMetrics}
                    onChange={(metrics) => updateVisualizationState({
                        metrics,
                        // Total only applies to yield.
                        ...(!metrics.includes(YIELD_METRIC_ID) && visualizationState.setsHandling === 'total' ? { setsHandling: 'top' } : {}),
                    })}
                />
            )}

            {usesMetricProgressMetrics && progressMetricDefinitions.length > 0 && (
                <MetricSelectField
                    className="sessions-query-field-spaced"
                    label="Metric"
                    value={selectedProgressMetricId}
                    options={progressMetricDefinitions}
                    onChange={(metric) => updateVisualizationState({ metric })}
                />
            )}
        </>
    );
}
