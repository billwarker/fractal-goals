import { pairAlignmentKeys, pickColumnDate, planAlignmentKeys, resolveDaysSelection } from '../programDaysView';

describe('plan column alignment', () => {
    it('keys the card, sections, and each activity or circuit by its occurrence index', () => {
        const keys = planAlignmentKeys('t1', [
            { name: 'Warm-up', items: [{ type: 'activity', activity_definition_id: 'a' }] },
            { name: 'Main', items: [
                { type: 'activity', activity_definition_id: 'a' },
                { type: 'activity', activity_id: 'b' },
                { type: 'circuit', circuit_definition_id: 'c' },
            ] },
        ]);

        expect(keys.card).toBe('t1|card');
        expect(keys.sections).toEqual(['t1|s:Warm-up#0', 't1|s:Main#0']);
        expect(keys.items).toEqual([
            ['t1|a:a#0'],
            ['t1|a:a#1', 't1|a:b#0', 't1|c:c#0'],
        ]);
    });

    it('pairs shared rows in order and skips rows only one side has', () => {
        expect(pairAlignmentKeys(
            ['card', 'a#0', 'extra', 'b#0', 'c#0'],
            ['card', 'a#0', 'b#0', 'new', 'c#0'],
        )).toEqual([[0, 0], [1, 1], [3, 2], [4, 4]]);
    });

    it('never crosses pairs when one side reordered its rows', () => {
        // b was moved above a on the right: only one of them can line up without crossing.
        expect(pairAlignmentKeys(['a#0', 'b#0'], ['b#0', 'a#0'])).toEqual([[0, 1]]);
        expect(pairAlignmentKeys([], ['a#0'])).toEqual([]);
    });
});

describe('Days tab column selection', () => {
    const days = [{ id: 'd', templates: [{ id: 't' }] }];
    const occurrence = (date, completed) => ({
        date, templates: [], closed: date < '2026-10-01', program_day_completed: completed,
        state: completed ? 'scheduled_met' : 'scheduled_missed',
    });
    const occurrencesByDay = new Map([['d', [
        occurrence('2026-09-14', true), occurrence('2026-09-21', false), occurrence('2026-09-28', false),
        occurrence('2026-10-05', false), occurrence('2026-10-12', false),
    ]]]);
    const resolve = (selection) => resolveDaysSelection({
        days, occurrencesByDay, selection, today: '2026-10-01', compare: true,
    });

    it('shows only the next day unless comparing', () => {
        const single = resolveDaysSelection({
            days, occurrencesByDay, selection: { dayId: 'd', compareDate: '2026-09-28' }, today: '2026-10-01',
        });
        expect(single.columnDates).toEqual(['2026-10-05']);
        expect(single.compareDate).toBeNull();
    });

    it('defaults to the latest completed day beside the next one', () => {
        expect(resolve(null).columnDates).toEqual(['2026-09-14', '2026-10-05']);
    });

    it('keeps a chosen comparison, and ignores one equal to the planned date', () => {
        expect(resolve({ dayId: 'd', date: '2026-10-12', compareDate: '2026-09-28' }).columnDates)
            .toEqual(['2026-09-28', '2026-10-12']);
        expect(resolve({ dayId: 'd', date: '2026-10-12', compareDate: '2026-10-12' }).columnDates)
            .toEqual(['2026-09-14', '2026-10-12']);
    });

    it('compares against the next date when nothing comes before the planned one', () => {
        expect(resolve({ dayId: 'd', date: '2026-09-14' }).columnDates).toEqual(['2026-09-21', '2026-09-14']);
    });

    it('shows one column for a day with a single date', () => {
        const single = new Map([['d', [occurrence('2026-10-05', false)]]]);
        expect(resolveDaysSelection({
            days, occurrencesByDay: single, selection: null, today: '2026-10-01', compare: true,
        }).columnDates)
            .toEqual(['2026-10-05']);
    });
});

describe('column rail picks', () => {
    const current = { date: '2026-10-05', compareDate: '2026-09-14' };

    it('plans another date in rail B and compares against a chosen date in rail A', () => {
        expect(pickColumnDate({ isFocus: true, nextDate: '2026-10-12', ...current })).toEqual({ date: '2026-10-12' });
        expect(pickColumnDate({ isFocus: false, nextDate: '2026-09-28', ...current }))
            .toEqual({ date: '2026-10-05', compareDate: '2026-09-28' });
    });

    it('swaps the columns when a rail picks the date the other column shows', () => {
        expect(pickColumnDate({ isFocus: true, nextDate: '2026-09-14', ...current }))
            .toEqual({ date: '2026-09-14', compareDate: '2026-10-05' });
        expect(pickColumnDate({ isFocus: false, nextDate: '2026-10-05', ...current }))
            .toEqual({ date: '2026-09-14', compareDate: '2026-10-05' });
    });
});
