import {
    buildCalendarPeriodEvents,
    buildCompletedSessionEvents,
    nestContributingSessionsInProgramDays,
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

describe('buildCompletedSessionEvents', () => {
    const days = [
        { date: '2026-09-01', completed_sessions: [{
            id: 's1', name: 'Planche', template_id: 't1', template_name: 'Strength', template_color: '#336699',
        }, {
            id: 's4', name: 'Deadlift', template_id: 't1', template_name: 'Strength', template_color: '#336699',
        }] },
        { date: '2026-09-02', completed_sessions: [
            { id: 's2', name: 'Run' },
            { id: 's3', name: 'Stretch' },
        ] },
        { date: '2026-09-03', completed_sessions: [] },
    ];

    it('names sessions on scheduled and unscheduled dates with their template badge metadata', () => {
        const events = buildCompletedSessionEvents(days, 'program-1');

        expect(events.map((event) => [event.id, event.start, event.title])).toEqual([
            ['completed-session-s1', '2026-09-01', 'Planche'],
            ['completed-session-s2', '2026-09-02', 'Run'],
            ['completed-session-s3', '2026-09-02', 'Stretch'],
        ]);
        expect(events[0].extendedProps).toEqual(expect.objectContaining({
            type: 'completed_session', sessionId: 's1', programId: 'program-1',
            sessionIds: ['s1', 's4'], count: 2,
            templateName: 'Strength', templateColor: '#336699',
        }));
    });

    it('returns no events without read-model days', () => {
        expect(buildCompletedSessionEvents(undefined, 'program-1')).toEqual([]);
    });

    it('nests credited sessions under their matching program-day occurrence', () => {
        const ribbon = {
            id: 'pday-program-1-2026-09-01-day-1',
            start: '2026-09-01',
            extendedProps: { type: 'program_day', pDayId: 'day-1' },
        };
        const session = {
            id: 'completed-session-s1',
            start: '2026-09-01',
            title: 'Planche',
            extendedProps: { type: 'completed_session', programDayIds: ['day-1'] },
        };

        expect(nestContributingSessionsInProgramDays([ribbon, session])).toEqual([{
            ...ribbon,
            extendedProps: { ...ribbon.extendedProps, contributingSessions: [session] },
        }]);
        expect(nestContributingSessionsInProgramDays([ribbon, {
            ...session, extendedProps: { type: 'completed_session', programDayIds: [] },
        }])).toHaveLength(2);
    });
});

describe('getProgramDayStatusSymbol', () => {
    it.each([
        [{ state: 'scheduled_met', closed: true }, 'complete'],
        [{ state: 'scheduled_pending', manualStatus: 'complete' }, 'complete'],
        [{ state: 'scheduled_met', closed: true, programDayCompleted: false }, 'missed'],
        [{ state: 'scheduled_pending', closed: false, programDayCompleted: true }, 'complete'],
        [{ state: 'scheduled_pending', manualStatus: 'rest', programDayCompleted: true }, 'rest'],
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
