import { describe, expect, it } from 'vitest';

// Shared with tests/unit/services/test_program_rollups.py so client and server weeks never drift.
import fixture from '../../../../tests/fixtures/block_weeks_cases.json';
import { blockWeekLabel, blockWeeks, trackedBlockWeeks, weekForDate } from '../programBlockWeeks';

const { cases } = fixture;

describe('blockWeeks', () => {
    it.each(cases.map((testCase) => [testCase.name, testCase]))('%s', (_name, testCase) => {
        const weeks = blockWeeks(testCase.start, testCase.end, testCase.week_start_day);

        expect(weeks.map((week) => [week.start, week.end, week.partial])).toEqual(testCase.weeks);
        expect(weeks.map((week) => week.index)).toEqual(weeks.map((_week, index) => index + 1));
    });
});

describe('tracked block weeks', () => {
    // Sep 1, 2026 is a Tuesday.
    const block = { name: 'Month 1', start_date: '2026-09-01', end_date: '2026-09-30', track_weeks: true, week_start_day: 6 };

    it('numbers only blocks that track weeks', () => {
        expect(trackedBlockWeeks({ ...block, track_weeks: false })).toEqual([]);
        expect(trackedBlockWeeks(block)).toHaveLength(5);
    });

    it('finds the week of a date and labels it', () => {
        expect(weekForDate(block, '2026-09-06')).toMatchObject({ index: 2, count: 5, start: '2026-09-06' });
        expect(weekForDate(block, '2026-10-01')).toBeNull();
        expect(blockWeekLabel(block, '2026-09-30')).toBe('Month 1 · Week 5');
        expect(blockWeekLabel({ ...block, track_weeks: false }, '2026-09-30')).toBe('Month 1');
        expect(blockWeekLabel(null, '2026-09-30')).toBe('');
    });
});
