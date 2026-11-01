import React, { useMemo } from 'react';

import { bucketRows, localDayKey } from '../../../../utils/chartGrain';
import BucketBarChart, { MeasureControl } from '../shared/BucketBarChart';
import GrainControl from '../shared/GrainControl';

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

export function SessionTrendsChart({ sessions = [], chartRef, grain = 'auto', measure = 'sessions', range = null }) {
    const result = useMemo(() => bucketRows(sessions, {
        dayOf: getSessionDay, secondsOf: (session) => session.total_duration_seconds || 0, grain, range,
    }), [grain, range, sessions]);
    return (
        <BucketBarChart
            rows={result.rows}
            grain={result.grain}
            byTime={measure === 'duration'}
            countLabel={countSessions}
            seriesLabel={measure === 'duration' ? 'Session time' : 'Sessions'}
            chartRef={chartRef}
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
        </>
    );
}
