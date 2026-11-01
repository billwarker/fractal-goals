import React, { useMemo } from 'react';

import { GROUP_DIMENSION_LABELS, sessionGroups } from '../../../../utils/analyticsGroupBy';
import { bucketRows, groupedBucketRows, localDayKey } from '../../../../utils/chartGrain';
import BucketBarChart, { MeasureControl } from '../shared/BucketBarChart';
import GrainControl from '../shared/GrainControl';
import GroupByControl from '../shared/GroupByControl';

export const SESSION_TREND_GROUPS = ['template', 'programDay'];

const MEASURE_OPTIONS = [
    { value: 'sessions', label: 'Sessions' },
    { value: 'duration', label: 'Time' },
];

function getSessionDay(session) {
    const value = session?.session_start || session?.created_at;
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? localDayKey(date) : null;
}

const countSessions = (count) => `${count} ${count === 1 ? 'session' : 'sessions'}`;

/**
 * One measure per chart. Saved views from before chose a `metrics` list; they show its first.
 */
export function sessionTrendMeasure(state = {}) {
    if (state.measure === 'sessions' || state.measure === 'duration') return state.measure;
    return Array.isArray(state.metrics) && state.metrics[0] === 'duration' ? 'duration' : 'sessions';
}

/**
 * Sessions and their time per calendar bucket across the range (or the dated sessions).
 * @returns {{ grain: 'day' | 'week' | 'month', rows: Array<{ key: string, sessions: number, durationSeconds: number }> }}
 */
export function getSessionTrendRows(sessions = [], { grain = 'auto', range = null } = {}) {
    const result = bucketRows(sessions, {
        dayOf: getSessionDay, secondsOf: (session) => session.total_duration_seconds || 0, grain, range,
    });
    return { grain: result.grain, rows: result.rows.map((row) => ({ key: row.key, sessions: row.count, durationSeconds: row.seconds })) };
}

const sessionSeconds = (session) => session.total_duration_seconds || 0;

export function SessionTrendsChart({ sessions = [], chartRef, grain = 'auto', measure = 'sessions', range = null, groupBy = null }) {
    const result = useMemo(() => {
        if (!groupBy) return { ...bucketRows(sessions, { dayOf: getSessionDay, secondsOf: sessionSeconds, grain, range }), grouped: null };
        const grouped = groupedBucketRows(sessions, {
            dayOf: getSessionDay, secondsOf: sessionSeconds, grain, range, groupsOf: (session) => sessionGroups(session, groupBy),
        });
        // A session has one template and one program day, so the groups stack.
        return { ...grouped, grouped: { groups: grouped.groups, values: grouped.values, overlap: false, title: GROUP_DIMENSION_LABELS[groupBy.dimension] } };
    }, [grain, groupBy, range, sessions]);
    return (
        <BucketBarChart
            rows={result.rows}
            grain={result.grain}
            byTime={measure === 'duration'}
            countLabel={countSessions}
            seriesLabel={measure === 'duration' ? 'Session time' : 'Sessions'}
            chartRef={chartRef}
            grouped={result.grouped}
            emptyDescription="Session trends appear once sessions have dates in the selected scope."
        />
    );
}

export function SessionTrendsControls({ context }) {
    return (
        <>
            <MeasureControl
                options={MEASURE_OPTIONS}
                value={sessionTrendMeasure(context.visualizationState || {})}
                onChange={(measure) => context.updateVisualizationState({ measure })}
            />
            <GrainControl context={context} />
            <GroupByControl context={context} dimensions={SESSION_TREND_GROUPS} />
        </>
    );
}
