import { getSessionTrendRows } from '../visualizations/sessions/SessionTrends';

describe('SessionTrends aggregation', () => {
    const sessions = [
        { id: 's1', session_start: '2026-05-04T10:00:00', total_duration_seconds: 1800 },
        { id: 's2', session_start: '2026-05-04T15:00:00', total_duration_seconds: 900 },
        { id: 's3', session_start: '2026-05-11T09:00:00', total_duration_seconds: 3600 },
        { id: 's4', session_start: '2026-06-02T09:00:00', total_duration_seconds: 1200 },
    ];

    it('aggregates session counts and summed duration by day', () => {
        expect(getSessionTrendRows(sessions, 'day')).toEqual([
            { key: '2026-05-04', label: 'May 4', sessions: 2, durationSeconds: 2700 },
            { key: '2026-05-11', label: 'May 11', sessions: 1, durationSeconds: 3600 },
            { key: '2026-06-02', label: 'Jun 2', sessions: 1, durationSeconds: 1200 },
        ]);
    });

    it('aggregates using week, month, and year grain', () => {
        expect(getSessionTrendRows(sessions, 'week').map((row) => ({
            key: row.key,
            sessions: row.sessions,
            durationSeconds: row.durationSeconds,
        }))).toEqual([
            { key: '2026-05-04', sessions: 2, durationSeconds: 2700 },
            { key: '2026-05-11', sessions: 1, durationSeconds: 3600 },
            { key: '2026-06-01', sessions: 1, durationSeconds: 1200 },
        ]);

        expect(getSessionTrendRows(sessions, 'month').map((row) => ({
            key: row.key,
            sessions: row.sessions,
            durationSeconds: row.durationSeconds,
        }))).toEqual([
            { key: '2026-05', sessions: 3, durationSeconds: 6300 },
            { key: '2026-06', sessions: 1, durationSeconds: 1200 },
        ]);

        expect(getSessionTrendRows(sessions, 'year').map((row) => ({
            key: row.key,
            sessions: row.sessions,
            durationSeconds: row.durationSeconds,
        }))).toEqual([
            { key: '2026', sessions: 4, durationSeconds: 7500 },
        ]);
    });
});
