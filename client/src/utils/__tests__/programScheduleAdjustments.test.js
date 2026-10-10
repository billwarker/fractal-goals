import { describe, expect, it, vi } from 'vitest';
import { getProgramDayScheduledDates } from '../programViewModel';
import { findDraftDayConflicts, occupiedProgramDates } from '../programCalendarConflicts';
import { duplicateProgramStructure } from '../programDuplication';
import { fractalApi } from '../api';

vi.mock('../api', () => ({ fractalApi: { createProgramDay: vi.fn().mockResolvedValue({}), createBlock: vi.fn() } }));
const program = {
    start_date: '2026-09-01', end_date: '2026-09-30',
    days: [{ id: 'strength', name: 'Strength', day_of_week: ['Monday'], excluded_dates: ['2026-09-07'], scheduled_dates: ['2026-09-08'] }],
};

describe('schedule exception projections', () => {
    it('uses identical occupied dates for calendar previews and conflict hints', () => {
        const dates = getProgramDayScheduledDates(program.days[0], program);
        expect(dates).toEqual(['2026-09-08', '2026-09-14', '2026-09-21', '2026-09-28']);
        expect([...occupiedProgramDates(program).keys()]).toEqual(dates);
    });
    it('preserves exceptions when previewing definition edits, but explicit dates restore them', () => {
        const owners = new Map([['2026-09-07', 'Mobility']]);
        expect(findDraftDayConflicts(program, owners, { weekdays: ['Monday'], excludedDates: ['2026-09-07'] })).toEqual([]);
        expect(findDraftDayConflicts(program, owners, { weekdays: ['Monday'], dates: ['2026-09-07'], excludedDates: ['2026-09-07'] }))
            .toEqual([{ date: '2026-09-07', dayName: 'Mobility' }]);
    });
    it('copies shifted exclusions with a program so removed occurrences stay removed', async () => {
        await duplicateProgramStructure({ rootId: 'root', programId: 'copy', source: program, startDate: '2026-10-01' });
        expect(fractalApi.createProgramDay).toHaveBeenCalledWith('root', 'copy', expect.objectContaining({
            day_of_week: ['Monday'], excluded_dates: ['2026-10-07'], scheduled_dates: ['2026-10-08'],
        }));
    });
});
