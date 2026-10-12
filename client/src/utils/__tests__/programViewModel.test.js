import { describe, expect, it } from 'vitest';

import {
    buildProgramDayOccurrences,
    buildProgramBlockLabels,
    buildProgramSummaryLabels,
    buildProgramCalendarEvents,
    buildProgramSidePaneData,
    buildProgramsCalendarEvents,
    getProgramColor,
    formatSpecificDatesSummary,
    formatWeekdaySchedule,
    getProgramDayScheduleLabel,
    getProgramDaySpecificDates,
} from '../programViewModel';

import { program } from '../../test/programs/programViewModelFixtures';

describe('programViewModel calendar builders', () => {
    it('uses explicit program color before block colors and fallback palette', () => {
        expect(getProgramColor({ ...program, color: '#EF476F' })).toBe('#EF476F');
        expect(getProgramColor(program)).toBe('#3A86FF');
        expect(getProgramColor({ blocks: [] }, 1)).toBe('#06A77D');
    });

    it('keeps block labels out of FullCalendar event data', () => {
        const events = buildProgramCalendarEvents({
            program,
            goals: [],
            sessions: [],
            getGoalColor: () => '#3A86FF',
            getGoalTextColor: () => '#ffffff',
        });

        expect(events.some((event) => event.extendedProps?.type === 'block_background')).toBe(true);
        expect(events.some((event) => event.extendedProps?.type === 'block_label')).toBe(false);
    });

    it('places reusable days on explicit schedule dates alongside weekday recurrences', () => {
        const scheduledProgram = {
            ...program,
            end_date: '2026-05-23',
            days: [{
                    id: 'day-1',
                    name: 'Planche Focus',
                    // 2026-05-19 is a Tuesday; the 21st duplicates it; the 24th is outside the program.
                    day_of_week: ['Tuesday'],
                    scheduled_dates: ['2026-05-21', '2026-05-19', '2026-05-24'],
                    templates: [],
                }],
        };

        const dates = buildProgramDayOccurrences({ program: scheduledProgram }).map((row) => row.date);

        expect(dates).toEqual(['2026-05-19', '2026-05-21']);
    });

    it('places a reusable day with only explicit schedules and no weekdays', () => {
        const scheduledProgram = {
            ...program,
            end_date: '2026-05-23',
            days: [{ id: 'day-1', day_of_week: [], scheduled_dates: ['2026-05-23'], templates: [] }],
        };

        expect(buildProgramDayOccurrences({ program: scheduledProgram }).map((row) => row.date))
            .toEqual(['2026-05-23']);
    });

    it('builds explicit block-label metadata for the first date of each block', () => {
        expect(buildProgramBlockLabels({ program, includeProgramId: true })).toEqual([
            expect.objectContaining({
                id: 'block-label-program-1-block-1',
                title: 'Block 1',
                date: '2026-05-17',
                startDate: '2026-05-17',
                endDate: '2026-05-23',
                programId: 'program-1',
                blockId: 'block-1',
                blockColor: '#3A86FF',
            }),
        ]);
    });

    it('adds week chips for a block that tracks weeks', () => {
        // May 17, 2026 is a Sunday; Monday weeks make Week 1 a single day.
        const tracked = { ...program, blocks: [{ ...program.blocks[0], track_weeks: true, week_start_day: 0 }] };
        const labels = buildProgramBlockLabels({ program: tracked });

        expect(labels[0]).toMatchObject({ title: 'Block 1', weekChip: 'W1', weekTitle: 'Block 1, week 1 of 2' });
        expect(labels.slice(1)).toEqual([expect.objectContaining({
            labelType: 'week', title: 'W2', date: '2026-05-18', weekTitle: 'Block 1, week 2 of 2',
        })]);
        expect(buildProgramBlockLabels({ program })[0].weekChip).toBeNull();
    });

    it('builds program labels from summary fields without requiring block data', () => {
        expect(buildProgramSummaryLabels([{
            id: 'past-1', name: 'Past program', color: '#EF476F',
            start_date: '2025-01-02', end_date: '2025-02-01',
        }])).toEqual([expect.objectContaining({
            title: 'Past program',
            date: '2025-01-02',
            programId: 'past-1',
            labelType: 'program',
        })]);
    });

    it('keeps aggregate program calendar events free of metadata-only labels', () => {
        const events = buildProgramsCalendarEvents(
            [program],
            [],
            () => '#3A86FF',
            () => '#ffffff',
            'UTC',
        );

        expect(events.some((event) => event.id === 'program-bg-program-1')).toBe(true);
        expect(events.some((event) => event.extendedProps?.type === 'block_label')).toBe(false);
    });

    it('renders only summary backgrounds when no program is scoped for detail', () => {
        const summary = { id: 'past-1', name: 'Past program', color: '#EF476F', start_date: '2025-01-01', end_date: '2025-02-01' };
        const events = buildProgramsCalendarEvents([summary], [], undefined, undefined, 'UTC', {}, null);

        expect(events.map((event) => event.extendedProps?.type)).toEqual(['program_background']);
        expect(events[0].extendedProps.program).not.toHaveProperty('blocks');
    });

    it('adds detailed events for only the currently scoped program', () => {
        const summaries = [
            { id: 'past-1', name: 'Past program', color: '#EF476F', start_date: '2025-01-01', end_date: '2025-02-01' },
            { id: 'active-1', name: 'Active program', color: '#3A86FF', start_date: '2026-01-01', end_date: '2026-02-01' },
        ];
        const detailedProgram = {
            ...program,
            id: 'active-1',
            start_date: '2026-01-01',
            end_date: '2026-02-01',
            blocks: [{ ...program.blocks[0], start_date: '2026-01-01', end_date: '2026-01-07' }],
        };
        const events = buildProgramsCalendarEvents(summaries, [], undefined, undefined, 'UTC', {}, detailedProgram);

        expect(events.filter((event) => event.extendedProps?.type === 'program_background')).toHaveLength(2);
        expect(events.filter((event) => event.extendedProps?.type === 'block_background').map((event) => event.extendedProps.programId))
            .toEqual(['active-1']);
    });

    it('deduplicates goal deadline events across program scopes', () => {
        const goal = {
            id: 'goal-1',
            name: 'Complete Pickup Music Intermediate',
            type: 'ShortTermGoal',
            deadline: '2026-05-30',
        };
        const programA = {
            ...program,
            id: 'program-a',
            goal_ids: ['goal-1'],
        };
        const programB = {
            ...program,
            id: 'program-b',
            goal_ids: ['goal-1'],
        };

        const events = buildProgramsCalendarEvents(
            [programA, programB],
            [goal],
            () => '#3A86FF',
            () => '#ffffff',
            'UTC',
        );

        const goalEvents = events.filter((event) => event.extendedProps?.type === 'goal' && event.extendedProps?.id === 'goal-1');
        expect(goalEvents).toHaveLength(1);
    });

    it('uses program-window goal scope for side pane fallback data', () => {
        const scopedProgram = {
            ...program,
            start_date: '2026-05-22',
            end_date: '2026-05-26',
            goal_ids: ['root'],
            blocks: [],
        };
        const rootGoal = {
            id: 'root',
            name: 'Root',
            type: 'LongTermGoal',
            children: [
                {
                    id: 'before',
                    name: 'Completed Before',
                    type: 'MidTermGoal',
                    completed: true,
                    completed_at: '2026-05-01T12:00:00Z',
                    children: [],
                },
                {
                    id: 'during',
                    name: 'Completed During',
                    type: 'MidTermGoal',
                    completed: true,
                    completed_at: '2026-05-24T12:00:00Z',
                    children: [],
                },
                {
                    id: 'active',
                    name: 'Active',
                    type: 'MidTermGoal',
                    completed: false,
                    children: [],
                },
            ],
        };
        const goals = [
            rootGoal,
            ...rootGoal.children,
        ];
        const byId = Object.fromEntries(goals.map((goal) => [goal.id, goal]));

        const data = buildProgramSidePaneData({
            program: scopedProgram,
            goals,
            getGoalDetails: (goalId) => byId[goalId] || null,
        });

        expect(data.programGoalSeeds).toHaveLength(1);
        expect(data.programGoalSeeds[0].children.map((goal) => goal.id)).toEqual(['during', 'active']);
        expect(data.programMetrics.totalGoals).toBe(3);
    });

    it('expands recurring program days into scheduled calendar occurrences', () => {
        const recurringProgram = {
            ...program,
            end_date: '2026-05-23',
            days: [
                        {
                            id: 'daily-day',
                            name: 'Daily Practice',
                            day_of_week: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
                            templates: [{ id: 'template-1', name: 'Practice' }],
                        },
                        {
                            id: 'out-of-range',
                            name: 'Outside',
                            scheduled_dates: ['2026-05-31'],
                            templates: [{ id: 'template-2', name: 'Outside' }],
                        },
                    ],
        };

        const occurrences = buildProgramDayOccurrences({ program: recurringProgram });

        expect(occurrences).toHaveLength(7);
        expect(occurrences.map((occurrence) => occurrence.date)).toEqual([
            '2026-05-17',
            '2026-05-18',
            '2026-05-19',
            '2026-05-20',
            '2026-05-21',
            '2026-05-22',
            '2026-05-23',
        ]);
    });
});

describe('program day schedule labels', () => {
    it.each([
        [{ day_of_week: ['Friday', 'Monday'] }, 'Mon · Fri'],
        [{ day_of_week: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] }, 'Daily'],
        [{ day_of_week: ['Monday'], scheduled_dates: ['2026-09-12'] }, 'Mon · +1 date'],
        [{ day_of_week: [], scheduled_dates: ['2026-09-26'] }, 'Sep 26'],
        [{ day_of_week: [], scheduled_dates: ['2026-10-03', '2026-09-26'] }, 'Sep 26, Oct 3'],
        [{ day_of_week: [], scheduled_dates: ['2026-09-26', '2026-09-28', '2026-10-01', '2026-10-03'] }, 'Sep 26 +3 more'],
        [{ scheduled_dates: ['2026-09-26T00:00:00Z'], day_of_week: [] }, 'Sep 26'],
        [{ day_of_week: [] }, ''],
    ])('labels %o as %s', (day, expected) => {
        expect(getProgramDayScheduleLabel(day)).toBe(expected);
    });

    it('sorts explicit dates without duplicates', () => {
        expect(getProgramDaySpecificDates({ scheduled_dates: ['2026-09-26T00:00:00Z', '2026-09-20', '2026-09-26'] }))
            .toEqual(['2026-09-20', '2026-09-26']);
    });

    it('summarizes weekly and specific-date schedules', () => {
        expect(formatWeekdaySchedule(['Friday', 'Monday', 'Wednesday'])).toBe('Every Monday, Wednesday and Friday in the program.');
        expect(formatSpecificDatesSummary(['2026-09-26'])).toBe('1 date · Sep 26');
        expect(formatSpecificDatesSummary(['2026-10-10', '2026-09-26'])).toBe('2 dates · Sep 26 – Oct 10');
    });
});
