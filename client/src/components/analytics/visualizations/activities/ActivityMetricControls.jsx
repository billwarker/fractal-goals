import React from 'react';

export default function ActivityMetricControls({ context }) {
    const {
        metricDefinitions,
        metricOptions,
        onOpenActivityModal,
        selectedActivityDef,
        selectedMetricId,
        selectedMetricXId,
        selectedMetricYId,
        selectedMetricY2Id,
        updateVisualizationState,
        visualization,
        visualizationState,
    } = context;

    const usesScatterMetrics = visualization.id === 'scatterPlot';
    const usesLineMetrics = visualization.id === 'lineGraph';

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

            {selectedActivityDef?.has_sets && (
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

            {usesLineMetrics && metricOptions.length > 0 && (
                <>
                    <label className="sessions-query-field" style={{ marginTop: 12 }}>
                        <span>Left Axis</span>
                        <select
                            value={selectedMetricId}
                            onChange={(event) => {
                                const metric = metricOptions.find((item) => item.id === event.target.value);
                                updateVisualizationState({ metric: metric || null });
                            }}
                        >
                            {metricOptions.map((metric) => (
                                <option key={metric.id} value={metric.id}>{metric.name}{metric.unit ? ` (${metric.unit})` : ''}</option>
                            ))}
                        </select>
                    </label>
                    <label className="sessions-query-field" style={{ marginTop: 12 }}>
                        <span>Right Axis</span>
                        <select
                            value={selectedMetricY2Id}
                            onChange={(event) => {
                                if (!event.target.value) {
                                    updateVisualizationState({ metricY2: null });
                                    return;
                                }
                                const metric = metricOptions.find((item) => item.id === event.target.value);
                                updateVisualizationState({ metricY2: metric || null });
                            }}
                        >
                            <option value="">None</option>
                            {metricOptions.map((metric) => (
                                <option key={metric.id} value={metric.id}>{metric.name}{metric.unit ? ` (${metric.unit})` : ''}</option>
                            ))}
                        </select>
                    </label>
                </>
            )}
        </>
    );
}
