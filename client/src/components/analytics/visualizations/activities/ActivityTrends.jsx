import React, { useMemo } from 'react';

import { GROUP_DIMENSION_LABELS, instanceGroups } from '../../../../utils/analyticsGroupBy';
import { bucketRows, groupedBucketRows, localDayKey } from '../../../../utils/chartGrain';
import BucketBarChart, { MeasureControl } from '../shared/BucketBarChart';
import GrainControl from '../shared/GrainControl';
import GroupByControl from '../shared/GroupByControl';

export const ACTIVITY_TREND_GROUPS = ['activity', 'activityGroup', 'tag', 'template', 'programDay'];

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

/** Completed instances with the activity each belongs to (the map is keyed by activity id). */
const completedItems = (activityInstances) => Object.entries(activityInstances).flatMap(([activityId, instances]) => (
    (instances || []).filter(isCompletedActivityInstance).map((instance) => ({ instance, activityId }))
));
const itemDay = ({ instance }) => getActivityInstanceDay(instance);
const itemSeconds = ({ instance }) => instance.duration_seconds || 0;

/**
 * Completed activity instances and their time per calendar bucket across the range (or the dated
 * instances).
 * @returns {{ grain: 'day' | 'week' | 'month', rows: Array<{ key: string, instances: number, durationSeconds: number }> }}
 */
export function getActivityTrendRows(activityInstances = {}, { grain = 'auto', range = null } = {}) {
    const result = bucketRows(completedItems(activityInstances), { dayOf: itemDay, secondsOf: itemSeconds, grain, range });
    return { grain: result.grain, rows: result.rows.map((row) => ({ key: row.key, instances: row.count, durationSeconds: row.seconds })) };
}

/**
 * @param {{ activityInstances?: object, chartRef?: any, grain?: string, measure?: string, range?: any,
 *   groupBy?: import('../../../../utils/analyticsGroupBy').GroupBy | null, overlap?: boolean,
 *   lookups?: { activitiesById: Map<string, any>, groupsById: Map<string, any>, sessionsById: Map<string, any> } }} props
 */
export function ActivityTrendsChart({
    activityInstances = {}, chartRef, grain = 'auto', measure = 'instances', range = null, groupBy = null, overlap = false, lookups = null,
}) {
    const result = useMemo(() => {
        const items = completedItems(activityInstances);
        if (!groupBy) return { ...bucketRows(items, { dayOf: itemDay, secondsOf: itemSeconds, grain, range }), grouped: null };
        const grouped = groupedBucketRows(items, {
            dayOf: itemDay,
            secondsOf: itemSeconds,
            grain,
            range,
            groupsOf: ({ instance, activityId }) => instanceGroups(instance, groupBy, {
                activity: lookups?.activitiesById.get(activityId) || { id: activityId },
                groupsById: lookups?.groupsById,
                session: lookups?.sessionsById.get(instance.session_id),
            }),
        });
        return { ...grouped, grouped: { groups: grouped.groups, values: grouped.values, title: GROUP_DIMENSION_LABELS[groupBy.dimension] } };
    }, [activityInstances, grain, groupBy, lookups, range]);
    return (
        <BucketBarChart
            rows={result.rows}
            grain={result.grain}
            byTime={measure === 'duration'}
            countLabel={countInstances}
            seriesLabel={measure === 'duration' ? 'Activity time' : 'Times done'}
            chartRef={chartRef}
            grouped={result.grouped ? { ...result.grouped, overlap } : null}
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
            <GroupByControl context={context} dimensions={ACTIVITY_TREND_GROUPS} />
        </>
    );
}
