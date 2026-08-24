import { describe, expect, it } from 'vitest';

import { buildProgramsCalendarEvents } from '../programViewModel';

describe('program calendar goal events', () => {
    it('adds configured SMART and completed icon metadata to deadline events', () => {
        const goal = {
            id: 'goal-smart',
            name: 'SMART deadline',
            type: 'ShortTermGoal',
            level_id: 'short-level',
            deadline: '2026-05-30',
            is_smart: true,
        };
        const completedGoal = {
            ...goal,
            id: 'goal-completed',
            name: 'Completed SMART deadline',
            completed: true,
            completed_at: '2026-05-29T12:00:00Z',
        };
        const events = buildProgramsCalendarEvents(
            [],
            [goal, completedGoal],
            (source) => source === 'Completed' ? '#22c55e' : '#8b6fff',
            () => '#ffffff',
            'UTC',
            {
                getGoalSecondaryColor: (source) => source === 'Completed' ? '#064e3b' : '#181329',
                getGoalIcon: () => 'triangle',
            },
        );

        expect(events.find((event) => event.extendedProps.goalId === goal.id)).toEqual(expect.objectContaining({
            backgroundColor: '#8b6fff',
            extendedProps: expect.objectContaining({
                goalIcon: {
                    shape: 'triangle',
                    color: '#8b6fff',
                    secondaryColor: '#181329',
                    isSmart: true,
                },
            }),
        }));
        expect(events.find((event) => event.extendedProps.goalId === completedGoal.id)).toEqual(expect.objectContaining({
            backgroundColor: '#8b6fff',
            extendedProps: expect.objectContaining({
                goalIcon: {
                    shape: 'triangle',
                    color: '#22c55e',
                    secondaryColor: '#064e3b',
                    isSmart: true,
                },
            }),
        }));
    });
});
