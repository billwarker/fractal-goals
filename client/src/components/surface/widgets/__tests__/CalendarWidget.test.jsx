import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import CalendarWidget from '../CalendarWidget';

const programCalendarProps = vi.hoisted(() => []);

vi.mock('../../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#3A86FF',
        getGoalTextColor: () => '#ffffff',
    }),
}));

vi.mock('../../../programs/ProgramCalendarView', () => ({
    default: (props) => {
        programCalendarProps.push(props);
        return (
            <div
                data-testid="program-calendar-view"
                data-event-count={props.calendarEvents.length}
                data-block-label-count={props.blockLabels.length}
                data-compact={String(Boolean(props.compact))}
                data-read-only={String(Boolean(props.readOnly))}
            />
        );
    },
}));

const program = {
    id: 'program-1',
    name: 'Development',
    color: '#57c39b',
    start_date: '2026-07-01',
    end_date: '2026-07-31',
    blocks: [
        {
            id: 'block-1',
            name: 'Block 4',
            color: '#b68a1b',
            start_date: '2026-07-12',
            end_date: '2026-07-31',
            days: [
                {
                    id: 'day-1',
                    name: 'Daily Practice',
                    day_of_week: ['Friday'],
                    templates: [
                        { id: 'template-1', name: 'Practice', is_required: true },
                    ],
                    sessions: [
                        {
                            id: 'session-1',
                            name: 'Practice',
                            template_id: 'template-1',
                            program_day_id: 'day-1',
                            completed: true,
                            session_start: '2026-07-17T15:00:00Z',
                        },
                    ],
                },
            ],
        },
    ],
};

describe('CalendarWidget', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('adapts goals-surface data into the shared ProgramCalendarView', () => {
        programCalendarProps.length = 0;
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-03T12:00:00Z'));

        render(
            <CalendarWidget
                sharedData={{
                    programs: [program],
                    goals: [],
                    timezone: 'UTC',
                }}
            />
        );

        expect(screen.getByTestId('program-calendar-view')).toHaveAttribute('data-compact', 'true');
        expect(screen.getByTestId('program-calendar-view')).toHaveAttribute('data-read-only', 'true');
        expect(screen.getByTestId('program-calendar-view')).toHaveAttribute('data-block-label-count', '1');

        const props = programCalendarProps[0];
        expect(props.calendarEvents).toEqual(expect.arrayContaining([
            expect.objectContaining({
                extendedProps: expect.objectContaining({ type: 'program_background' }),
            }),
            expect.objectContaining({
                extendedProps: expect.objectContaining({ type: 'block_background' }),
            }),
            expect.objectContaining({
                extendedProps: expect.objectContaining({ type: 'program_day' }),
            }),
        ]));
        expect(props.blockLabels[0]).toEqual(expect.objectContaining({
            title: 'Block 4',
            startDate: '2026-07-12',
            endDate: '2026-07-31',
        }));
        expect(props.initialDate).toEqual(new Date('2026-07-03T12:00:00Z'));
    });
});
