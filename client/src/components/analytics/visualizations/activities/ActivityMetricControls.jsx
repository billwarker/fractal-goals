import React from 'react';

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
    const progressMetricDefinitions = metricDefinitions.filter((metric) => metric.track_progress !== false);
    const selectedProgressMetricId = visualizationState?.metric?.id
        || visualizationState?.metric
        || progressMetricDefinitions[0]?.id
        || '';

    const toggleTrendMetric = (metricId) => {
        const nextMetrics = selectedTrendMetrics.includes(metricId)
            ? selectedTrendMetrics.filter((id) => id !== metricId)
            : [...selectedTrendMetrics, metricId].slice(-2);
        updateVisualizationState({ metrics: nextMetrics.length ? nextMetrics : selectedTrendMetrics });
    };

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
                <label className="sessions-query-field" style={{ marginTop: 12 }}>
                    <span>Sets</span>
                    <select
                        value={visualizationState.setsHandling || 'top'}
                        onChange={(event) => updateVisualizationState({ setsHandling: event.target.value })}
                    >
                        <option value="top">Top Set</option>
                        <option value="average">Average</option>
                    </select>
                </label>
            )}

            {selectedActivityDef?.has_splits && selectedActivityDef?.split_definitions?.length > 0 && (
                <label className="sessions-query-field" style={{ marginTop: 12 }}>
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
                    <label className="sessions-query-field" style={{ marginTop: 12 }}>
                        <span>X Axis</span>
                        <select
                            value={selectedMetricXId}
                            onChange={(event) => {
                                const metric = metricDefinitions.find((item) => item.id === event.target.value);
                                updateVisualizationState({ metricX: metric || null });
                            }}
                        >
                            {metricDefinitions.map((metric) => (
                                <option key={metric.id} value={metric.id}>{metric.name}{metric.unit ? ` (${metric.unit})` : ''}</option>
                            ))}
                        </select>
                    </label>
                    <label className="sessions-query-field" style={{ marginTop: 12 }}>
                        <span>Y Axis</span>
                        <select
                            value={selectedMetricYId}
                            onChange={(event) => {
                                const metric = metricDefinitions.find((item) => item.id === event.target.value);
                                updateVisualizationState({ metricY: metric || null });
                            }}
                        >
                            {metricDefinitions.map((metric) => (
                                <option key={metric.id} value={metric.id}>{metric.name}{metric.unit ? ` (${metric.unit})` : ''}</option>
                            ))}
                        </select>
                    </label>
                </>
            )}

            {usesMetricTrendMetrics && metricDefinitions.length > 0 && (
                <>
                    <div className="sessions-query-sidebar-section-header" style={{ marginTop: 12 }}>
                        <h4>Metrics</h4>
                    </div>
                    <div className="sessions-query-chip-group">
                        {metricDefinitions.map((metric) => (
                            <button
                                key={metric.id}
                                type="button"
                                className={`sessions-query-chip ${selectedTrendMetrics.includes(metric.id) ? 'active' : ''}`}
                                onClick={() => toggleTrendMetric(metric.id)}
                            >
                                {metric.name}
                            </button>
                        ))}
                    </div>
                </>
            )}

            {usesMetricProgressMetrics && progressMetricDefinitions.length > 0 && (
                <label className="sessions-query-field" style={{ marginTop: 12 }}>
                    <span>Metric</span>
                    <select
                        value={selectedProgressMetricId}
                        onChange={(event) => {
                            const metric = progressMetricDefinitions.find((item) => item.id === event.target.value);
                            updateVisualizationState({ metric: metric || null });
                        }}
                    >
                        {progressMetricDefinitions.map((metric) => (
                            <option key={metric.id} value={metric.id}>{metric.name}{metric.unit ? ` (${metric.unit})` : ''}</option>
                        ))}
                    </select>
                </label>
            )}
        </>
    );
}
