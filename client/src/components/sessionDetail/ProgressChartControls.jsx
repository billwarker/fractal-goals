import React from 'react';

import { useProgressChartMutation } from '../../hooks/useActivityTags';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import { MetricChipsField, MetricSelectField, SetsHandlingField } from '../analytics/visualizations/activities/ActivityMetricFields';
import { YIELD_METRIC_ID } from '../analytics/visualizations/activities/MetricTrends';
import { CHART_KINDS, chartMetrics, settingsForKind } from './progressChartSettings';
import styles from './ProgressChartControls.module.css';

const YIELD_OPTION = { id: YIELD_METRIC_ID, name: 'Yield', unit: '' };

/**
 * What the Progress chart plots, shown in the pane card's place while the chart is expanded:
 * the chart kind, its metrics (or yield), and how sets combine. Each change saves at once,
 * remembered for the activity in this session's template/program day. Uses the same fields as
 * Analytics' activity chart controls.
 */
export default function ProgressChartControls({ rootId, activityId, instance, series }) {
    const settings = series.chart_settings;
    const available = settings.available || { kinds: [], metric_ids: [] };
    const metrics = chartMetrics(series);
    const { setChart, isPending } = useProgressChartMutation(rootId, activityId);
    const save = async (changes) => {
        try {
            await setChart({ instanceId: instance.id, settings: { ...settings, ...changes }, version: settings.version });
        } catch (error) {
            notify.error(`Failed to change the chart: ${formatError(error)}`);
        }
    };
    const kinds = CHART_KINDS.filter(([kind]) => available.kinds.includes(kind));
    const isYield = settings.kind === 'activity_trend' && settings.trend_series === 'yield';
    const trendOptions = available.yield ? [...metrics, YIELD_OPTION] : metrics;
    const setsField = series.activity_definition?.has_sets && settings.kind !== 'goal' ? (
        <SetsHandlingField
            value={settings.set_aggregation || 'top'}
            allowTotal={isYield}
            onChange={(setAggregation) => void save({ set_aggregation: setAggregation })}
        />
    ) : null;

    return (
        <fieldset className={styles.controls} disabled={isPending} aria-label="Chart controls">
            {/* A two-column grid, Chart first. A scatter's axes share a row, so Sets sits beside Chart. */}
            <div className={styles.fields}>
                <label className="sessions-query-field">
                    <span>Chart</span>
                    <select
                        value={settings.kind}
                        disabled={kinds.length < 2}
                        onChange={(event) => void save(settingsForKind(event.target.value, settings, available, metrics))}
                    >
                        {kinds.map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
                    </select>
                </label>
                {settings.kind === 'scatter' ? setsField : null}
                {settings.kind === 'activity_trend' ? (
                    <MetricSelectField
                        label="Plot"
                        value={isYield ? YIELD_METRIC_ID : settings.metric_id}
                        options={trendOptions}
                        onChange={(metric) => void save(metric?.id === YIELD_METRIC_ID
                            ? { trend_series: 'yield', metric_id: null }
                            : {
                                trend_series: 'metric',
                                metric_id: metric?.id || null,
                                ...(settings.set_aggregation === 'total' ? { set_aggregation: 'top' } : {}),
                            })}
                    />
                ) : null}
                {settings.kind === 'scatter' ? (
                    <>
                        <MetricSelectField
                            label="X axis"
                            value={settings.x_metric_id}
                            options={metrics.filter((metric) => metric.id !== settings.y_metric_id)}
                            onChange={(metric) => void save({ x_metric_id: metric?.id || null })}
                        />
                        <MetricSelectField
                            label="Y axis"
                            value={settings.y_metric_id}
                            options={metrics.filter((metric) => metric.id !== settings.x_metric_id)}
                            onChange={(metric) => void save({ y_metric_id: metric?.id || null })}
                        />
                    </>
                ) : null}
                {settings.kind !== 'scatter' ? setsField : null}
            </div>
            {settings.kind === 'metric_trend' && metrics.length > 2 ? (
                <MetricChipsField
                    options={metrics}
                    selected={[settings.x_metric_id, settings.y_metric_id].filter(Boolean)}
                    onChange={(ids) => {
                        if (ids.length === 2) void save({ x_metric_id: ids[0], y_metric_id: ids[1] });
                    }}
                />
            ) : null}
        </fieldset>
    );
}
