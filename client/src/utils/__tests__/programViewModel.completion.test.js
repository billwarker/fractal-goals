import { describe, expect, it } from 'vitest';

import { buildProgramCalendarEvents } from '../programViewModel';

describe('program calendar occurrence completion', () => {
    it('projects completion onto same-date program-day events independently', () => {
        const program = {
            id: 'program-1',
            start_date: '2026-05-17',
            end_date: '2026-05-30',
            blocks: [{
                id: 'block-1',
                start_date: '2026-05-17',
                end_date: '2026-05-23',
                days: [
                    {
                        id: 'complete-day',
                        name: 'Daily practice',
                        date: '2026-05-17',
                        templates: [{ id: 'template-1', name: 'Practice' }],
                    },
                    {
                        id: 'incomplete-day',
                        name: 'Daily practice',
                        date: '2026-05-17',
                        templates: [{ id: 'template-2', name: 'Review' }],
                    },
                ],
            }],
        };
        const events = buildProgramCalendarEvents({
            program,
            sessions: [{
                id: 'session-1',
                program_day_id: 'complete-day',
                template_id: 'template-1',
                session_start: '2026-05-17T12:00:00Z',
                completed: true,
            }],
            timezone: 'UTC',
        }).filter((event) => event.extendedProps?.type === 'program_day');

        expect(events).toHaveLength(2);
        expect(events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                extendedProps: expect.objectContaining({
                    pDayId: 'complete-day', isCompleted: true,
                }),
            }),
            expect.objectContaining({
                extendedProps: expect.objectContaining({
                    pDayId: 'incomplete-day', isCompleted: false,
                }),
            }),
        ]));
    });
});
