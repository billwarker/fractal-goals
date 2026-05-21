import React from 'react';

import { ActivityTotalsControls } from './activities/ActivityTotals';

function EmptyControls() {
    return (
        <div className="sessions-query-empty">
            This visualization uses the global filters only.
        </div>
    );
}

function ActivityPickerControls({ context }) {
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

export function HeatmapControls({ context }) {
    return (
        <div className="sessions-query-chip-group">
            {[
                { value: 12, label: '1 Year' },
                { value: 6, label: '6 Months' },
                { value: 3, label: '3 Months' },
                { value: 1, label: '1 Month' },
            ].map((option) => (
                <button
                    key={option.value}
                    type="button"
                    className={`sessions-query-chip ${(context.visualizationState.months || 12) === option.value ? 'active' : ''}`}
                    onClick={() => context.updateVisualizationState({ months: option.value })}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

export function GoalDetailControls({ context }) {
    return (
        <>
            <button
                type="button"
                className="sessions-query-picker-button"
                onClick={context.onOpenGoalModal}
                disabled={context.profileGoals.length === 0}
            >
                {context.selectedGoalDef ? context.selectedGoalDef.name : 'Choose Goal'}
            </button>
            {context.selectedGoalDef && (
                <div className="sessions-query-chip-group" style={{ marginTop: 10 }}>
                    {[
                        { value: 'duration', label: 'Duration' },
                        { value: 'activity', label: 'Activities' },
                    ].map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            className={`sessions-query-chip ${(context.visualizationState.chart || 'duration') === option.value ? 'active' : ''}`}
                            onClick={() => context.updateVisualizationState({ chart: option.value })}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            )}
        </>
    );
}

export function GoalTimeDistributionControls({ context }) {
    return (
        <>
            <div className="sessions-query-chip-group">
                {[
                    { value: 'activity', label: 'Activities' },
                    { value: 'session', label: 'Sessions' },
                ].map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        className={`sessions-query-chip ${(context.visualizationState.durationMode || 'activity') === option.value ? 'active' : ''}`}
                        onClick={() => context.updateVisualizationState({ durationMode: option.value })}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            <label className="sessions-query-field" style={{ marginTop: 12 }}>
                <span>Inheritance</span>
                <select
                    value={context.visualizationState.inheritanceMode || 'direct'}
                    onChange={(event) => context.updateVisualizationState({ inheritanceMode: event.target.value })}
                >
                    <option value="direct">Direct only</option>
                    <option value="descendants">Include descendants</option>
                    <option value="root">Roll up to root</option>
                </select>
            </label>
        </>
    );
}

export function ActivityMetricControls({ context }) {
    return <ActivityPickerControls context={context} />;
}

export function ActivityTotalsVisualizationControls({ context }) {
    return (
        <ActivityTotalsControls
            visualizationState={context.visualizationState}
            updateVisualizationState={context.updateVisualizationState}
            selectedWindowState={context.selectedWindowState}
            updateSelectedWindow={context.updateSelectedWindow}
        />
    );
}

export { EmptyControls };
