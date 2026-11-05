import { getSessionTrendRows, sessionTrendMeasure } from '../visualizations/sessions/SessionTrends';

describe('SessionTrends aggregation', () => {
    const sessions = [
        { id: 's1', session_start: '2026-05-04T10:00:00', total_duration_seconds: 1800 },
        { id: 's2', session_start: '2026-05-04T15:00:00', total_duration_seconds: 900 },
        { id: 's3', session_start: '2026-05-11T09:00:00', total_duration_seconds: 3600 },
        { id: 's4', session_start: '2026-06-02T09:00:00', total_duration_seconds: 1200 },
        { id: 'undated' },
    ];
    const nonEmpty = ({ rows }) => rows.filter((row) => row.sessions > 0)
        .map(({ key, sessions: count, durationSeconds }) => ({ key, sessions: count, durationSeconds }));

    it('counts sessions and their time per day, with every day in between', () => {
        const result = getSessionTrendRows(sessions, { grain: 'day' });
        expect(result.grain).toBe('day');
        expect(result.rows).toHaveLength(30);
        expect(nonEmpty(result)).toEqual([
            { key: '2026-05-04', sessions: 2, durationSeconds: 2700 },
            { key: '2026-05-11', sessions: 1, durationSeconds: 3600 },
            { key: '2026-06-02', sessions: 1, durationSeconds: 1200 },
        ]);
    });

    it('buckets by Monday weeks and calendar months', () => {
        expect(nonEmpty(getSessionTrendRows(sessions, { grain: 'week' }))).toEqual([
            { key: '2026-05-04', sessions: 2, durationSeconds: 2700 },
            { key: '2026-05-11', sessions: 1, durationSeconds: 3600 },
            { key: '2026-06-01', sessions: 1, durationSeconds: 1200 },
        ]);
        expect(getSessionTrendRows(sessions, { grain: 'month' }).rows).toEqual([
            { key: '2026-05-01', sessions: 3, durationSeconds: 6300 },
            { key: '2026-06-01', sessions: 1, durationSeconds: 1200 },
        ]);
    });

    it('spans the chosen range and picks the grain from it', () => {
        const result = getSessionTrendRows(sessions, { range: { start: '2026-01-01', end: '2026-12-31' } });
        expect(result.grain).toBe('week');
        expect(result.rows[0].key).toBe('2025-12-29');
        expect(result.rows.at(-1).key).toBe('2026-12-28');
        expect(getSessionTrendRows([], {})).toEqual({ grain: 'day', rows: [] });
    });

    it('shows one measure, reading the first of an old metrics list', () => {
        expect(sessionTrendMeasure({ measure: 'duration' })).toBe('duration');
        expect(sessionTrendMeasure({ metrics: ['duration', 'sessions'] })).toBe('duration');
        expect(sessionTrendMeasure({ metrics: ['sessions', 'duration'] })).toBe('sessions');
        expect(sessionTrendMeasure({})).toBe('sessions');
    });
});
