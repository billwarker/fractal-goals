import {
    buildCalendarPeriodEvents,
    buildUnscheduledSessionEvents,
    getProgramDayStateMeta,
    getProgramDayStatusSymbol,
    indexProgramDayStates,
    PROGRAM_DAY_STATE_META,
} from '../programDayState';

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

describe('buildUnscheduledSessionEvents', () => {
    const days = [
        { date: '2026-09-01', completed_sessions: [{ id: 's1', name: 'Planche', color: '#336699' }] },
        { date: '2026-09-02', completed_sessions: [
            { id: 's2', name: 'Run', color: null },
            { id: 's3', name: 'Stretch', color: '#993366' },
        ] },
        { date: '2026-09-03', completed_sessions: [] },
    ];
    const ribbon = (date, programId) => ({
        start: date, extendedProps: { type: 'program_day', programId },
    });

    it('names each session only on dates without a selected-program ribbon', () => {
        const events = buildUnscheduledSessionEvents(days, 'program-1', [
            ribbon('2026-09-01', 'program-1'),
            ribbon('2026-09-02', 'other-program'),
        ]);

        expect(events.map((event) => [event.id, event.start, event.title])).toEqual([
            ['completed-session-s2', '2026-09-02', 'Run'],
            ['completed-session-s3', '2026-09-02', 'Stretch'],
        ]);
        expect(events[0].extendedProps).toEqual(expect.objectContaining({
            type: 'completed_session', sessionId: 's2', programId: 'program-1',
        }));
        expect(events[0].extendedProps.sortOrder).toBeLessThan(events[1].extendedProps.sortOrder);
    });

    it('returns no events without read-model days', () => {
        expect(buildUnscheduledSessionEvents(undefined, 'program-1', [])).toEqual([]);
    });
});

describe('getProgramDayStatusSymbol', () => {
    it.each([
        [{ state: 'scheduled_met', closed: true }, 'complete'],
        [{ state: 'scheduled_pending', manualStatus: 'complete' }, 'complete'],
        [{ state: 'scheduled_partial', closed: true }, 'missed'],
        [{ state: 'scheduled_missed', closed: true }, 'missed'],
        [{ state: 'scheduled_partial', closed: false }, 'scheduled'],
        [{ state: 'scheduled_pending', closed: false }, 'scheduled'],
        [{ state: 'rest', manualStatus: 'rest', closed: true }, 'rest'],
        [{ state: 'rest', closed: false }, 'rest'],
        [{ state: 'scheduled_met', manualStatus: 'rest', closed: true }, 'rest'],
        [{ state: 'rest', manualStatus: 'complete', closed: true }, 'complete'],
    ])('maps %o to %s', (input, expected) => {
        expect(getProgramDayStatusSymbol(input)).toBe(expected);
    });
});

describe('buildCalendarPeriodEvents', () => {
    it('spans each event inclusively with an exclusive FullCalendar end date', () => {
        const [event] = buildCalendarPeriodEvents([{
            id: 'p1', name: 'Lisbon', kind: 'vacation', start_date: '2026-09-10', end_date: '2026-09-17',
            protects_streaks: true,
        }], 'program-1');

        expect(event).toEqual(expect.objectContaining({
            id: 'calendar-period-p1', title: 'Lisbon', start: '2026-09-10', end: '2026-09-18', allDay: true,
        }));
        expect(event.extendedProps).toEqual(expect.objectContaining({
            type: 'calendar_period', programId: 'program-1', kindLabel: 'Vacation', sortOrder: -5,
        }));
        expect(buildCalendarPeriodEvents([{ id: 'p2', kind: 'unknown', start_date: '2026-09-01', end_date: '2026-09-01' }])[0]
            .extendedProps.kindLabel).toBe('Event');
        expect(buildCalendarPeriodEvents(undefined)).toEqual([]);
    });
});
