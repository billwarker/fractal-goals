import React, { useMemo } from 'react';

import { bucketRows, localDayKey } from '../../../../utils/chartGrain';
import BucketBarChart, { MeasureControl } from '../shared/BucketBarChart';
import GrainControl from '../shared/GrainControl';

const MEASURE_OPTIONS = [
    { value: 'instances', label: 'Times done' },
    { value: 'duration', label: 'Time' },
];

function getActivityInstanceDay(instance) {
    const value = instance?.session_date || instance?.time_start || instance?.created_at;
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? localDayKey(date) : null;
}

function isCompletedActivityInstance(instance) {
    const completed = instance?.completed ?? instance?.attributes?.completed;
    if (typeof completed === 'boolean') return completed;
    return Boolean(
        instance?.completed_at
        || instance?.time_stop
        || (instance?.duration_seconds || 0) > 0
        || (Array.isArray(instance?.metrics) && instance.metrics.length > 0)
        || (Array.isArray(instance?.sets) && instance.sets.length > 0)
    );
}

const countInstances = (count) => `${count} ${count === 1 ? 'time' : 'times'} done`;

/** One measure per chart. Saved views from before chose a `metrics` list; they show its first. */
export function activityTrendMeasure(state = {}) {
    if (state.measure === 'instances' || state.measure === 'duration') return state.measure;
    return Array.isArray(state.metrics) && state.metrics[0] === 'duration' ? 'duration' : 'instances';
}

const completedInstances = (activityInstances) => Object.values(activityInstances).flat().filter(isCompletedActivityInstance);

/**
 * Completed activity instances and their time per calendar bucket across the range (or the dated
 * instances).
 * @returns {{ grain: 'day' | 'week' | 'month', rows: Array<{ key: string, instances: number, durationSeconds: number }> }}
 */
export function getActivityTrendRows(activityInstances = {}, { grain = 'auto', range = null } = {}) {
    const result = bucketRows(completedInstances(activityInstances), {
        dayOf: getActivityInstanceDay, secondsOf: (instance) => instance.duration_seconds || 0, grain, range,
    });
    return { grain: result.grain, rows: result.rows.map((row) => ({ key: row.key, instances: row.count, durationSeconds: row.seconds })) };
}

export function ActivityTrendsChart({ activityInstances = {}, chartRef, grain = 'auto', measure = 'instances', range = null }) {
    const result = useMemo(() => bucketRows(completedInstances(activityInstances), {
        dayOf: getActivityInstanceDay, secondsOf: (instance) => instance.duration_seconds || 0, grain, range,
    }), [activityInstances, grain, range]);
    return (
        <BucketBarChart
            rows={result.rows}
            grain={result.grain}
            byTime={measure === 'duration'}
            countLabel={countInstances}
            seriesLabel={measure === 'duration' ? 'Activity time' : 'Times done'}
            chartRef={chartRef}
            emptyDescription="Activity trends appear once activities have been done in the selected scope."
        />
    );
}

export function ActivityTrendsControls({ context }) {
    return (
        <>
            <MeasureControl
                options={MEASURE_OPTIONS}
                value={activityTrendMeasure(context.visualizationState || {})}
                onChange={(measure) => context.updateVisualizationState({ measure })}
            />
            <GrainControl context={context} />
        </>
    );
}
