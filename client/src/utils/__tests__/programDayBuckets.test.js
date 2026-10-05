import { bucketScope, buildDayBuckets, pickBucketDate } from '../programDayBuckets';

// 2026-09-01 is a Tuesday.
const blocks = [
    // Listed out of order: buckets follow the calendar.
    { id: 'b2', name: 'Month 2', color: '#00f', start_date: '2026-10-01', end_date: '2026-10-14' },
    { id: 'b1', name: 'Month 1', color: '#f00', start_date: '2026-09-01', end_date: '2026-09-20', track_weeks: true, week_start_day: 6 },
];
const occurrence = (date, state = 'scheduled_pending') => ({
    date, templates: [], state, manual_status: null, program_day_completed: state === 'scheduled_met',
});
const occurrences = [
    occurrence('2026-09-01', 'scheduled_met'),
    occurrence('2026-09-08', 'scheduled_met'),
    occurrence('2026-09-10'),
    occurrence('2026-09-25'),
    occurrence('2026-10-02'),
];

describe('programDayBuckets', () => {
    it('groups a day\'s dates by block, then by week in each block', () => {
        const buckets = buildDayBuckets(blocks, occurrences);

        expect(buckets.blocks.map((block) => [block.name, block.length, block.dates, block.completed])).toEqual([
            ['Month 1', 20, ['2026-09-01', '2026-09-08', '2026-09-10'], 2],
            ['Month 2', 14, ['2026-10-02'], 0],
        ]);
        // Tracked weeks start on Sunday, so week 1 is partial.
        expect(buckets.blocks[0].weeks.map((week) => [week.index, week.start, week.length, week.dates])).toEqual([
            [1, '2026-09-01', 5, ['2026-09-01']],
            [2, '2026-09-06', 7, ['2026-09-08', '2026-09-10']],
            [3, '2026-09-13', 7, []],
            [4, '2026-09-20', 1, []],
        ]);
        // Untracked blocks step seven days from their start.
        expect(buckets.blocks[1].weeks.map((week) => week.start)).toEqual(['2026-10-01', '2026-10-08']);
    });

    it('collects dates no block covers, only when there are some', () => {
        expect(buildDayBuckets(blocks, occurrences).outside).toEqual({ dates: ['2026-09-25'], completed: 0 });
        expect(buildDayBuckets(blocks, occurrences.filter((o) => o.date !== '2026-09-25')).outside).toBeNull();
        expect(buildDayBuckets([], occurrences).blocks).toEqual([]);
    });

    it('scopes a date to its block and week', () => {
        const buckets = buildDayBuckets(blocks, occurrences);

        const scope = bucketScope(buckets, '2026-09-10');
        expect([scope.block.name, scope.week.index, scope.outside]).toEqual(['Month 1', 2, false]);

        const outside = bucketScope(buckets, '2026-09-25');
        expect([outside.block, outside.week, outside.outside]).toEqual([null, null, true]);
    });

    it('jumps to the first date of a period, skipping the other column\'s date', () => {
        const dates = ['2026-09-01', '2026-09-08', '2026-09-10'];

        expect(pickBucketDate(dates)).toBe('2026-09-01');
        expect(pickBucketDate(dates, '2026-09-01')).toBe('2026-09-08');
        // The other column's date only when it is the period's only date (a swap).
        expect(pickBucketDate(['2026-09-08'], '2026-09-08')).toBe('2026-09-08');
        expect(pickBucketDate([])).toBeNull();
    });
});
