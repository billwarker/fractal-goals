import { getProgramDayStateMeta, indexProgramDayStates, PROGRAM_DAY_STATE_META } from '../programDayState';

describe('programDayState', () => {
    it('defines accessible metadata for every canonical state', () => {
        expect(Object.keys(PROGRAM_DAY_STATE_META)).toEqual([
            'scheduled_met', 'scheduled_partial', 'scheduled_missed', 'scheduled_pending',
            'unscheduled_evidence', 'rest', 'upcoming',
        ]);
        Object.values(PROGRAM_DAY_STATE_META).forEach((value) => {
            expect(value.label).toBeTruthy();
        });
    });

    it('indexes facts by local date and safely handles unknown states', () => {
        const fact = { date: '2026-09-02', state: 'scheduled_met' };
        expect(indexProgramDayStates([fact]).get(fact.date)).toBe(fact);
        expect(getProgramDayStateMeta('unknown')).toBeNull();
    });
});
