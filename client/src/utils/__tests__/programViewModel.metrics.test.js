import { describe, expect, it } from 'vitest';

import { buildBlockMetrics, buildDemoProgramMetrics } from '../programViewModel';
import { program } from '../../test/programs/programViewModelFixtures';

describe('programViewModel schedule metrics', () => {
    it('counts completed scheduled program days over total scheduled program days for program and block metrics', () => {
        const dailyProgram = {
            ...program,
            end_date: '2026-05-23',
            days: [
                        {
                            id: 'daily-day',
                            name: 'Daily Practice',
                            day_of_week: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
                            templates: [{ id: 'template-1', name: 'Practice' }],
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
            ['daily-day', dailyProgram.days[0]],
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
        // The May 24 session falls after the block, so only the program counts its time.
        expect(blockMetrics).toMatchObject({
            completedProgramDays: 2,
            scheduledProgramDays: 7,
            completedSessions: 2,
            scheduledSessions: 7,
            totalDuration: 2100,
        });
    });

    it('requires every template on a scheduled program day before counting the day complete', () => {
        const multiTemplateProgram = {
            ...program,
            end_date: '2026-05-23',
            days: [
                        {
                            id: 'stacked-day',
                            name: 'Stacked Day',
                            scheduled_dates: ['2026-05-18'],
                            templates: [
                                { id: 'template-1', name: 'Warmup' },
                                { id: 'template-2', name: 'Repertoire' },
                            ],
                        },
                    ],
        };
        const programDaysMap = new Map([
            ['stacked-day', multiTemplateProgram.days[0]],
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
            end_date: '2026-05-23',
            days: [
                        {
                            id: 'flex-day',
                            name: 'Flexible Day',
                            scheduled_dates: ['2026-05-18'],
                            completion_min_templates: 2,
                            templates: [
                                { id: 'template-1', name: 'Required', is_required: true },
                                { id: 'template-2', name: 'Optional 1', is_required: false },
                                { id: 'template-3', name: 'Optional 2', is_required: false },
                            ],
                        },
                    ],
        };
        const programDaysMap = new Map([
            ['flex-day', flexibleProgram.days[0]],
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
