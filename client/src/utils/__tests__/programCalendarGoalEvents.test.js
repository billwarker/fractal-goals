import { afterEach, describe, expect, it, vi } from 'vitest';

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

    describe('due tone', () => {
        afterEach(() => vi.useRealTimers());

        it('colours open goals by how soon they are due, and completed goals not at all', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
            const helpers = [() => '#000', () => '#fff', 'UTC', { getGoalSecondaryColor: () => '#111', getGoalIcon: () => 'circle' }];
            const goal = (id, deadline, extra = {}) => ({ id, name: id, type: 'ShortTermGoal', deadline, ...extra });
            const events = buildProgramsCalendarEvents([], [
                goal('later', '2026-12-01'),
                goal('soon', '2026-10-22'),
                goal('late', '2026-10-10'),
                goal('done', '2026-10-10', { completed: true, completed_at: '2026-10-09T10:00:00Z' }),
            ], ...helpers);
            const tone = (id) => events.find((event) => event.extendedProps.goalId === id).extendedProps.dueTone;

            expect([tone('later'), tone('soon'), tone('late'), tone('done')]).toEqual(['normal', 'soon', 'overdue', null]);
        });
    });
});
