import {
    calendarConflictMessage,
    findBlockOverlap,
    findDraftDayConflicts,
    occupiedProgramDates,
    programDayDates,
    takenWeekdays,
    weekdayOf,
} from '../programCalendarConflicts';

// 2026-09-07 is a Monday. Days belong to the program; weekdays repeat across its span.
const program = {
    id: 'p1', start_date: '2026-09-07', end_date: '2026-09-20',
    blocks: [{ id: 'b1', start_date: '2026-09-07', end_date: '2026-09-13' }],
    days: [
        { id: 'legs', name: 'Leg Day', day_of_week: ['Monday'], scheduled_dates: [] },
        { id: 'test', name: 'Test Day', day_of_week: [], scheduled_dates: ['2026-09-10', '2026-10-01'] },
        { id: 'reusable', name: 'Reusable', day_of_week: [], scheduled_dates: [] },
    ],
};

describe('programCalendarConflicts', () => {
    it('names weekdays from ISO dates', () => {
        expect(weekdayOf('2026-09-07')).toBe('Monday');
        expect(weekdayOf('2026-09-13')).toBe('Sunday');
    });

    it('finds overlapping blocks with inclusive edges and skips the block being edited', () => {
        const blocks = [
            { id: 'a', name: 'Week 1', start_date: '2026-09-01', end_date: '2026-09-07' },
            { id: 'b', name: 'Week 2', start_date: '2026-09-08', end_date: '2026-09-14' },
        ];

        expect(findBlockOverlap(blocks, { startDate: '2026-09-07', endDate: '2026-09-10' })?.name).toBe('Week 1');
        expect(findBlockOverlap(blocks, { startDate: '2026-09-15', endDate: '2026-09-20' })).toBeNull();
        expect(findBlockOverlap(blocks, { id: 'b', startDate: '2026-09-08', endDate: '2026-09-14' })).toBeNull();
    });

    it('expands weekly and specific dates across the whole program, not just a block', () => {
        expect([...programDayDates(program.days[0], program)]).toEqual(['2026-09-07', '2026-09-14']);
        expect([...programDayDates(program.days[1], program)]).toEqual(['2026-09-10']);
        expect(programDayDates(program.days[2], program).size).toBe(0);
    });

    it('maps occupied dates and weekdays to their day, excluding the edited day', () => {
        const owners = occupiedProgramDates(program, { excludeDayId: 'legs' });

        expect([...owners]).toEqual([['2026-09-10', 'Test Day']]);
        expect([...takenWeekdays(occupiedProgramDates(program))]).toEqual([
            ['Monday', 'Leg Day'], ['Thursday', 'Test Day'],
        ]);
    });

    it('lists a draft definition\'s conflicting dates, earliest first', () => {
        const owners = occupiedProgramDates(program);

        expect(findDraftDayConflicts(program, owners, { weekdays: ['Thursday'], dates: ['2026-09-14'] })).toEqual([
            { date: '2026-09-10', dayName: 'Test Day' },
            { date: '2026-09-14', dayName: 'Leg Day' },
        ]);
        expect(findDraftDayConflicts(program, owners, { weekdays: ['Friday'] })).toEqual([]);
    });

    it('turns only calendar invariant errors into inline messages', () => {
        expect(calendarConflictMessage({ response: { data: { code: 'program_block_overlap', error: 'Overlaps.' } } }))
            .toBe('Overlaps.');
        expect(calendarConflictMessage({ response: { data: { code: 'program_day_date_outside_program', error: 'Outside.' } } }))
            .toBe('Outside.');
        expect(calendarConflictMessage({ response: { data: { error: 'Server exploded' } } })).toBeNull();
        expect(calendarConflictMessage(new Error('offline'))).toBeNull();
    });
});
