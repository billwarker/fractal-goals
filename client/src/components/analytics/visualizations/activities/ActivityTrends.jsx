import React, { useMemo } from 'react';

import { GROUP_DIMENSION_LABELS, instanceGroups } from '../../../../utils/analyticsGroupBy';
import { bucketRows, bucketStart, bucketStarts, groupedBucketRows, localDayKey } from '../../../../utils/chartGrain';
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

const GRAIN_DAYS = { day: 1, week: 7, month: 31 };

/** "YYYY-MM-DD" plus some days. */
function addDays(key, days) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * A running total: counts and time accumulate up to today's bucket; the axis runs on past today
 * (to the range's end, or a few buckets) so a future date can be picked for a goal, and those
 * buckets stay empty.
 * @param {{ grain: 'day' | 'week' | 'month', rows: Array<{ key: string, count: number, seconds: number }> }} result
 * @param {{ end?: string | null } | null} range
 * @param {string} [today]
 */
export function runningTotalRows(result, range, today = localDayKey(new Date())) {
    const todayKey = bucketStart(today, result.grain);
    const keys = result.rows.map((row) => row.key);
    const lastKey = [keys[keys.length - 1], todayKey].sort().pop();
    const extra = Math.max(4, Math.ceil(keys.length / 4));
    const futureEnd = range?.end && range.end > today ? bucketStart(range.end, result.grain) : null;
    const tail = futureEnd || bucketStart(addDays(lastKey, extra * GRAIN_DAYS[result.grain]), result.grain);
    const byKey = new Map(result.rows.map((row) => [row.key, row]));
    let count = 0;
    let seconds = 0;
    const rows = bucketStarts(keys[0] || todayKey, tail, result.grain).map((key) => {
        if (key > todayKey) return { key, count: null, seconds: null };
        count += byKey.get(key)?.count || 0;
        seconds += byKey.get(key)?.seconds || 0;
        return { key, count, seconds };
    });
    const todayIndex = rows.findIndex((row) => row.key === todayKey);
    return { rows, todayIndex, current: todayIndex >= 0 ? rows[todayIndex].count : count };
}

/**
 * @param {{ activityInstances?: object, chartRef?: any, grain?: string, measure?: string, range?: any,
 *   runningTotal?: boolean, singleActivity?: any,
 *   groupBy?: import('../../../../utils/analyticsGroupBy').GroupBy | null, overlap?: boolean,
 *   lookups?: { activitiesById: Map<string, any>, groupsById: Map<string, any>, sessionsById: Map<string, any> } }} props
 */
export function ActivityTrendsChart({
    activityInstances = {}, chartRef, grain = 'auto', measure = 'instances', range = null, groupBy = null, overlap = false, lookups = null,
    runningTotal = false, singleActivity = null,
}) {
    const result = useMemo(() => {
        const items = completedItems(activityInstances);
        if (runningTotal) {
            // A running total is one series, so a group-by doesn't apply.
            const base = bucketRows(items, { dayOf: itemDay, secondsOf: itemSeconds, grain, range });
            const running = runningTotalRows(base, range);
            return {
                grain: base.grain,
                rows: running.rows,
                grouped: null,
                // Read by the chart's goal surface: "this many by then".
                meta: {
                    runningTotal: {
                        activity: measure === 'instances' ? singleActivity : null,
                        current: running.current,
                        todayIndex: running.todayIndex,
                        bucketKeys: running.rows.map((row) => row.key),
                        grain: base.grain,
                    },
                },
            };
        }
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
    }, [activityInstances, grain, groupBy, lookups, measure, range, runningTotal, singleActivity]);
    return (
        <BucketBarChart
            rows={result.rows}
            grain={result.grain}
            byTime={measure === 'duration'}
            countLabel={countInstances}
            seriesLabel={`${measure === 'duration' ? 'Activity time' : 'Times done'}${runningTotal ? ' so far' : ''}`}
            chartRef={chartRef}
            grouped={result.grouped ? { ...result.grouped, overlap } : null}
            datasetMeta={result.meta || null}
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
            <label className="sessions-query-checkbox-row sessions-query-field-spaced">
                <input
                    type="checkbox"
                    checked={Boolean(context.visualizationState.runningTotal)}
                    onChange={(event) => context.updateVisualizationState({ runningTotal: event.target.checked })}
                />
                <span>Running total (set “by a date” goals)</span>
            </label>
            {!context.visualizationState.runningTotal && <GroupByControl context={context} dimensions={ACTIVITY_TREND_GROUPS} />}
        </>
    );
}
