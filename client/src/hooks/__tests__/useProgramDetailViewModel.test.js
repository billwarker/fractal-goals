import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import moment from 'moment';

import { useProgramDetailViewModel } from '../useProgramDetailViewModel';

describe('useProgramDetailViewModel', () => {
    it('derives sorted blocks, active block metrics, and attached goal calendar events', () => {
        const today = moment().format('YYYY-MM-DD');
        const tomorrow = moment().add(1, 'day').format('YYYY-MM-DD');
        const yesterday = moment().subtract(1, 'day').format('YYYY-MM-DD');

        const program = {
            id: 'program-1',
            end_date: tomorrow,
            blocks: [
                {
                    id: 'block-late',
                    name: 'Later Block',
                    start_date: tomorrow,
                    end_date: moment().add(2, 'day').format('YYYY-MM-DD'),
                    color: '#123456',
                    goal_ids: [],
                    days: [],
                },
                {
                    id: 'block-active',
                    name: 'Active Block',
                    start_date: yesterday,
                    end_date: tomorrow,
                    color: '#3366ff',
                    goal_ids: ['goal-parent'],
                    days: [
                        {
                            id: 'day-1',
                            name: 'Day 1',
                            templates: [{ id: 'template-1', name: 'Warmup' }],
                        },
                    ],
                },
            ],
        };

        const goals = [
            {
                id: 'goal-parent',
                type: 'MidTermGoal',
                name: 'Parent Goal',
                deadline: today,
                children: [{ id: 'goal-child' }],
            },
            {
                id: 'goal-child',
                type: 'ShortTermGoal',
                name: 'Child Goal',
                deadline: tomorrow,
                completed: true,
                completed_at: today,
                children: [],
            },
        ];

        const goalById = Object.fromEntries(goals.map((goal) => [goal.id, goal]));
        const sessions = [
            {
                id: 'session-1',
                name: 'Warmup',
                session_start: `${today}T12:00:00Z`,
                completed: true,
                program_day_id: 'day-1',
                template_id: 'template-1',
                total_duration_seconds: 600,
            },
        ];

        const attachedGoalIds = new Set(['goal-parent', 'goal-child']);

        const { result } = renderHook(() => useProgramDetailViewModel({
            program,
            goals,
            sessions,
            timezone: 'UTC',
            getGoalColor: () => '#00aaff',
            getGoalTextColor: () => '#ffffff',
            getGoalDetails: (goalId) => goalById[goalId] || null,
            attachBlockId: 'block-active',
            attachedGoalIds,
            hierarchyGoalSeeds: [],
            expandAssociatedGoalIds: (goalIds) => {
                if (goalIds.includes('goal-parent')) {
                    return ['goal-parent', 'goal-child'];
                }
                return goalIds;
            },
        }));

        expect(result.current.sortedBlocks.map((block) => block.id)).toEqual(['block-active', 'block-late']);
        expect(result.current.activeBlock?.id).toBe('block-active');
        expect(result.current.attachBlock?.id).toBe('block-active');
        expect(result.current.programMetrics).toMatchObject({
            completedSessions: 1,
            scheduledSessions: 1,
            totalGoals: 2,
        });
        expect(result.current.blockMetrics).toMatchObject({
            totalGoals: 2,
            completedSessions: 1,
        });
        expect(result.current.calendarEvents.some((event) => event.id === 'block-bg-block-active')).toBe(true);
        expect(result.current.calendarEvents.some((event) => event.id === 'goal-goal-parent')).toBe(true);
        expect(result.current.calendarEvents.some((event) => event.id === 'goal-goal-child')).toBe(true);
    });
});
