import React, { useMemo } from 'react';

import { useFlowtreeSessionMetrics } from '../../../hooks/useSessionQueries';
import { getDefaultFlowTreeSessionMetricsSummary } from '../../../hooks/useFlowTreeMetrics';
import { formatDurationSeconds } from '../../../utils/formatters';

const METRIC_DEFINITIONS = [
    {
        key: 'recentSessionsCount',
        label: 'Recent Sessions',
        value: (summary) => summary.recent_sessions_count,
        subLabel: (summary) => `Last ${summary.window_days} days`,
    },
    {
        key: 'completedSessionsCount',
        label: 'Completed Sessions',
        value: (summary) => summary.completed_sessions_count,
        subLabel: () => 'All visible goals',
    },
    {
        key: 'recentInstancesCount',
        label: 'Recent Activities',
        value: (summary) => summary.recent_instances_count,
        subLabel: (summary) => `Last ${summary.window_days} days`,
    },
    {
        key: 'completedInstancesCount',
        label: 'Completed Activities',
        value: (summary) => summary.completed_instances_count,
        subLabel: () => 'All visible goals',
    },
    {
        key: 'recentSessionDuration',
        label: 'Recent Time',
        value: (summary) => formatDurationSeconds(summary.recent_session_duration_seconds),
        subLabel: (summary) => `Last ${summary.window_days} days`,
    },
    {
        key: 'totalSessionDuration',
        label: 'Total Time',
        value: (summary) => formatDurationSeconds(summary.total_session_duration_seconds),
        subLabel: () => 'Completed sessions',
    },
    {
        key: 'programFocus',
        label: 'Program Focus',
        value: (summary) => {
            if (!summary.recent_sessions_count) return '0%';
            return `${Math.round((summary.recent_program_sessions_count / summary.recent_sessions_count) * 100)}%`;
        },
        subLabel: (summary) => `${summary.recent_program_sessions_count} program sessions`,
    },
];

const METRIC_BY_KEY = new Map(METRIC_DEFINITIONS.map((metric) => [metric.key, metric]));

export default function MetricCardWidget({ state, onStateChange, sharedData, configureMode }) {
    const rootId = sharedData?.rootId;
    const visibleGoalIds = Array.isArray(sharedData?.visibleGoalIds) ? sharedData.visibleGoalIds : [];
    const activeGoalWindowDays = sharedData?.activeGoalWindowDays;
    const selectedKey = state?.metricKey || 'recentSessionsCount';
    const selectedMetric = METRIC_BY_KEY.get(selectedKey) || METRIC_DEFINITIONS[0];

    const { data, isLoading } = useFlowtreeSessionMetrics(rootId, visibleGoalIds, {
        enabled: visibleGoalIds.length > 0,
        days: activeGoalWindowDays,
    });

    const summary = useMemo(() => ({
        ...getDefaultFlowTreeSessionMetricsSummary(activeGoalWindowDays),
        ...(data || {}),
    }), [activeGoalWindowDays, data]);

    return (
        <div className="surface-metric-card" data-no-panel-drag="true">
            {configureMode && (
                <label className="surface-metric-picker">
                    <span>Metric</span>
                    <select
                        value={selectedMetric.key}
                        onChange={(event) => onStateChange?.({ metricKey: event.target.value })}
                    >
                        {METRIC_DEFINITIONS.map((metric) => (
                            <option key={metric.key} value={metric.key}>
                                {metric.label}
                            </option>
                        ))}
                    </select>
                </label>
            )}
            <div className="surface-metric-card-body">
                <div className="surface-metric-value">
                    {isLoading ? '...' : selectedMetric.value(summary)}
                </div>
                <div className="surface-metric-label">{selectedMetric.label}</div>
                <div className="surface-metric-sub-label">{selectedMetric.subLabel(summary)}</div>
            </div>
        </div>
    );
}
