import { describe, expect, it } from 'vitest';

import {
    buildBlockMetrics,
    buildProgramDayOccurrences,
    buildProgramBlockLabels,
    buildProgramSummaryLabels,
    buildProgramCalendarEvents,
    buildDemoProgramMetrics,
    buildProgramSidePaneData,
    buildProgramsCalendarEvents,
    getProgramColor,
    formatSpecificDatesSummary,
    formatWeekdaySchedule,
    getProgramDayScheduleLabel,
    getProgramDaySpecificDates,
} from '../programViewModel';

const program = {
    id: 'program-1',
    name: 'Test Program',
    start_date: '2026-05-17',
    end_date: '2026-05-30',
    blocks: [
        {
            id: 'block-1',
            name: 'Block 1',
            start_date: '2026-05-17',
            end_date: '2026-05-23',
            color: '#3A86FF',
            days: [],
        },
    ],
};

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
            blocks: [{
                ...program.blocks[0],
                days: [{
                    id: 'day-1',
                    name: 'Planche Focus',
                    date: null,
                    // 2026-05-19 is a Tuesday; the 21st duplicates it; the 24th is outside the block.
                    day_of_week: ['Tuesday'],
                    scheduled_dates: ['2026-05-21', '2026-05-19', '2026-05-24'],
                    templates: [],
                }],
            }],
        };

        const dates = buildProgramDayOccurrences({ program: scheduledProgram }).map((row) => row.date);

        expect(dates).toEqual(['2026-05-19', '2026-05-21']);
    });

    it('places a reusable day with only explicit schedules and no weekdays', () => {
        const scheduledProgram = {
            ...program,
            blocks: [{
                ...program.blocks[0],
                days: [{ id: 'day-1', date: null, day_of_week: [], scheduled_dates: ['2026-05-23'], templates: [] }],
            }],
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
            blocks: [
                {
                    ...program.blocks[0],
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
                            date: '2026-05-31',
                            templates: [{ id: 'template-2', name: 'Outside' }],
                        },
                    ],
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

    it('counts completed scheduled program days over total scheduled program days for program and block metrics', () => {
        const dailyProgram = {
            ...program,
            blocks: [
                {
                    ...program.blocks[0],
                    days: [
                        {
                            id: 'daily-day',
                            name: 'Daily Practice',
                            day_of_week: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
                            templates: [{ id: 'template-1', name: 'Practice' }],
                        },
                    ],
                },
            ],
        };
        const sessions = [
            {
                id: 'completed-1',
                name: 'Practice',
                program_day_id: 'daily-day',
                template_id: 'template-1',
                session_start: '2026-05-17T12:00:00Z',
                completed: true,
                total_duration_seconds: 1200,
            },
            {
                id: 'completed-2',
                name: 'Practice',
                program_day_id: 'daily-day',
                template_id: 'template-1',
                session_start: '2026-05-18T12:00:00Z',
                completed: true,
                total_duration_seconds: 900,
            },
            {
                id: 'off-schedule',
                name: 'Practice',
                program_day_id: 'daily-day',
                template_id: 'template-1',
                session_start: '2026-05-24T12:00:00Z',
                completed: true,
                total_duration_seconds: 600,
            },
        ];
        const programDaysMap = new Map([
            ['daily-day', { ...dailyProgram.blocks[0].days[0], blockId: 'block-1' }],
        ]);

        const programMetrics = buildDemoProgramMetrics({
            program: dailyProgram,
            sessions,
            programDaysMap,
            attachedGoalIds: new Set(),
            getGoalDetails: () => null,
            timezone: 'UTC',
        });
        const blockMetrics = buildBlockMetrics({
            activeBlock: dailyProgram.blocks[0],
            sessions,
            program: dailyProgram,
            programDaysMap,
            blockGoalsByBlockId: new Map(),
            timezone: 'UTC',
        });

        expect(programMetrics).toMatchObject({
            completedProgramDays: 2,
            scheduledProgramDays: 7,
            completedSessions: 2,
            scheduledSessions: 7,
            totalDuration: 2700,
        });
        expect(blockMetrics).toMatchObject({
            completedProgramDays: 2,
            scheduledProgramDays: 7,
            completedSessions: 2,
            scheduledSessions: 7,
            totalDuration: 2700,
        });
    });

    it('requires every template on a scheduled program day before counting the day complete', () => {
        const multiTemplateProgram = {
            ...program,
            blocks: [
                {
                    ...program.blocks[0],
                    days: [
                        {
                            id: 'stacked-day',
                            name: 'Stacked Day',
                            date: '2026-05-18',
                            templates: [
                                { id: 'template-1', name: 'Warmup' },
                                { id: 'template-2', name: 'Repertoire' },
                            ],
                        },
                    ],
                },
            ],
        };
        const programDaysMap = new Map([
            ['stacked-day', { ...multiTemplateProgram.blocks[0].days[0], blockId: 'block-1' }],
        ]);

        const partialMetrics = buildDemoProgramMetrics({
            program: multiTemplateProgram,
            sessions: [
                {
                    id: 'session-1',
                    name: 'Warmup',
                    program_day_id: 'stacked-day',
                    template_id: 'template-1',
                    session_start: '2026-05-18T12:00:00Z',
                    completed: true,
                },
            ],
            programDaysMap,
            attachedGoalIds: new Set(),
            getGoalDetails: () => null,
            timezone: 'UTC',
        });

        expect(partialMetrics.completedProgramDays).toBe(0);

        const completeMetrics = buildDemoProgramMetrics({
            program: multiTemplateProgram,
            sessions: [
                {
                    id: 'session-1',
                    name: 'Warmup',
                    program_day_id: 'stacked-day',
                    template_id: 'template-1',
                    session_start: '2026-05-18T12:00:00Z',
                    completed: true,
                },
                {
                    id: 'session-2',
                    name: 'Repertoire',
                    program_day_id: 'stacked-day',
                    template_id: 'template-2',
                    session_start: '2026-05-18T13:00:00Z',
                    completed: true,
                },
            ],
            programDaysMap,
            attachedGoalIds: new Set(),
            getGoalDetails: () => null,
            timezone: 'UTC',
        });

        expect(completeMetrics.completedProgramDays).toBe(1);
    });

    it('allows optional templates to be missing and enforces minimum template thresholds', () => {
        const flexibleProgram = {
            ...program,
            blocks: [
                {
                    ...program.blocks[0],
                    days: [
                        {
                            id: 'flex-day',
                            name: 'Flexible Day',
                            date: '2026-05-18',
                            completion_min_templates: 2,
                            templates: [
                                { id: 'template-1', name: 'Required', is_required: true },
                                { id: 'template-2', name: 'Optional 1', is_required: false },
                                { id: 'template-3', name: 'Optional 2', is_required: false },
                            ],
                        },
                    ],
                },
            ],
        };
        const programDaysMap = new Map([
            ['flex-day', { ...flexibleProgram.blocks[0].days[0], blockId: 'block-1' }],
        ]);

        const requiredOnlyMetrics = buildDemoProgramMetrics({
            program: flexibleProgram,
            sessions: [
                {
                    id: 'session-1',
                    name: 'Required',
                    program_day_id: 'flex-day',
                    template_id: 'template-1',
                    session_start: '2026-05-18T12:00:00Z',
                    completed: true,
                },
            ],
            programDaysMap,
            attachedGoalIds: new Set(),
            getGoalDetails: () => null,
            timezone: 'UTC',
        });

        expect(requiredOnlyMetrics.completedProgramDays).toBe(0);

        const thresholdMetrics = buildDemoProgramMetrics({
            program: flexibleProgram,
            sessions: [
                {
                    id: 'session-1',
                    name: 'Required',
                    program_day_id: 'flex-day',
                    template_id: 'template-1',
                    session_start: '2026-05-18T12:00:00Z',
                    completed: true,
                },
                {
                    id: 'session-2',
                    name: 'Optional 1',
                    program_day_id: 'flex-day',
                    template_id: 'template-2',
                    session_start: '2026-05-18T13:00:00Z',
                    completed: true,
                },
            ],
            programDaysMap,
            attachedGoalIds: new Set(),
            getGoalDetails: () => null,
            timezone: 'UTC',
        });

        expect(thresholdMetrics.completedProgramDays).toBe(1);
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
        [{ date: '2026-09-26T00:00:00Z', day_of_week: [] }, 'Sep 26'],
        [{ day_of_week: [] }, ''],
    ])('labels %o as %s', (day, expected) => {
        expect(getProgramDayScheduleLabel(day)).toBe(expected);
    });

    it('merges legacy and explicit dates without duplicates', () => {
        expect(getProgramDaySpecificDates({ date: '2026-09-26', scheduled_dates: ['2026-09-26T00:00:00Z', '2026-09-20'] }))
            .toEqual(['2026-09-20', '2026-09-26']);
    });

    it('summarizes weekly and specific-date schedules', () => {
        expect(formatWeekdaySchedule(['Friday', 'Monday', 'Wednesday'])).toBe('Every Monday, Wednesday and Friday in the block.');
        expect(formatSpecificDatesSummary(['2026-09-26'])).toBe('1 date · Sep 26');
        expect(formatSpecificDatesSummary(['2026-10-10', '2026-09-26'])).toBe('2 dates · Sep 26 – Oct 10');
    });
});
