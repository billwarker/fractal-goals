import { blockWeeks } from '../programBlockWeeks';
import { blockStatus, buildBlockCards } from '../programBlocksViewModel';

describe('programBlocksViewModel', () => {
    it.each([
        [1, [['2026-03-02', '2026-03-02', true]]],
        [7, [['2026-03-02', '2026-03-08', false]]],
        [8, [['2026-03-02', '2026-03-08', false], ['2026-03-09', '2026-03-09', true]]],
        [14, [['2026-03-02', '2026-03-08', false], ['2026-03-09', '2026-03-15', false]]],
    ])('counts a %i-day block in weeks from its start', (length, expected) => {
        const end = new Date(Date.UTC(2026, 2, 1 + length)).toISOString().slice(0, 10);
        expect(blockWeeks('2026-03-02', end).map((week) => [week.start, week.end, week.partial])).toEqual(expected);
    });

    it('rejects invalid week ranges', () => {
        expect(blockWeeks('2026-03-10', '2026-03-02')).toEqual([]);
        expect(blockWeeks(null, '2026-03-02')).toEqual([]);
    });

    it.each([
        ['2026-03-01', 'upcoming'],
        ['2026-03-02', 'active'],
        ['2026-03-15', 'active'],
        ['2026-03-16', 'completed'],
    ])('reads a block on %s as %s', (today, status) => {
        expect(blockStatus('2026-03-02', '2026-03-15', today)).toBe(status);
    });

    it('joins blocks with whole-program metrics', () => {
        const [card] = buildBlockCards({
            blocks: [{ id: 'b', name: 'Base', start_date: '2026-03-02', end_date: '2026-03-15', days: [] }],
            metrics: {
                window: { as_of: '2026-03-10' },
                blocks: [{
                    block_id: 'b',
                    consistency: { met_days: 1, scheduled_days_observed: 2, rate: 0.5 },
                    status_counts: { complete: 1, missed: 1, rest: 0, pending: 2, scheduled: 4 },
                    longest_streak: 1,
                    goals: { due: 3, completed: 1 },
                }],
            },
        });

        expect(card).toMatchObject({
            status: 'active',
            weekCount: 2,
            currentWeekIndex: 2,
            statusCounts: { scheduled: 4 },
            longestStreak: 1,
            goals: { due: 3, completed: 1 },
        });
    });

    it('builds cards before metrics load', () => {
        const [card] = buildBlockCards({ blocks: [{ id: 'b', start_date: '2026-03-02', end_date: '2026-03-08' }] });
        expect(card).toMatchObject({ status: null, statusCounts: null, goals: null, weekCount: 1 });
    });
});
