import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import DayViewModal from '../DayViewModal';

vi.mock('../../../contexts/GoalLevelsContext', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useGoalLevels: () => ({
            getGoalColor: () => '#3b82f6',
            getGoalSecondaryColor: () => '#0f172a',
            getGoalIcon: () => 'diamond',
        }),
    };
});

vi.mock('../../../contexts/TimezoneContext', () => ({
    useTimezone: () => ({ timezone: 'UTC' }),
}));

vi.mock('../../atoms/GoalIcon', () => ({
    default: ({ shape }) => <span data-testid="goal-icon">{shape}</span>,
}));

describe('DayViewModal', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-08T12:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const baseProps = {
        isOpen: true,
        onClose: vi.fn(),
        date: '2026-03-09',
        program: { id: 'program-1', goal_ids: ['goal-root'], blocks: [] },
        goals: [
            { id: 'goal-root', name: 'Root Program Goal', type: 'MidTermGoal' },
            { id: 'goal-1', parent_id: 'goal-root', name: 'Finish Grade 1', deadline: '2026-03-09', type: 'ShortTermGoal' },
            { id: 'goal-2', name: 'Cascade Goal', deadline: '2026-03-15', type: 'ImmediateGoal' },
        ],
        onSetGoalDeadline: vi.fn(),
        onScheduleDay: vi.fn(),
        onCreateDayForDate: vi.fn(),
        onUnscheduleDay: vi.fn(),
        blocks: [],
        sessions: [],
    };

    it('uses the program-scoped goal hierarchy selector for setting a goal deadline on the selected date', () => {
        render(<DayViewModal {...baseProps} />);

        fireEvent.click(screen.getByRole('button', { name: /Set Goal Deadline for This Date/i }));

        expect(screen.getByPlaceholderText('Search program goals...')).toBeInTheDocument();
        expect(screen.getByText('Root Program Goal')).toBeInTheDocument();
        expect(screen.getAllByText('Finish Grade 1').length).toBeGreaterThan(0);
        expect(screen.queryByText('Cascade Goal')).not.toBeInTheDocument();
        expect(screen.getAllByTestId('goal-icon')).toHaveLength(2);
        expect(screen.queryByText('Choose a goal...')).not.toBeInTheDocument();
    });

    it('routes create-from-scratch through the dated day creation callback', () => {
        const onCreateDayForDate = vi.fn();

        render(
            <DayViewModal
                {...baseProps}
                onCreateDayForDate={onCreateDayForDate}
                blocks={[
                    {
                        id: 'block-1',
                        name: 'Test Block',
                        start_date: '2026-03-01',
                        end_date: '2026-03-12',
                        days: [],
                    },
                ]}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /Schedule Day for This Date/i }));
        fireEvent.click(screen.getByRole('button', { name: /Create New Day From Scratch/i }));

        expect(onCreateDayForDate).toHaveBeenCalledWith('block-1', '2026-03-09');
    });

    it('hides goals whose parent deadline makes the selected date invalid', () => {
        render(
            <DayViewModal
                {...baseProps}
                date="2026-03-16"
                program={{ id: 'program-1', goal_ids: ['goal-parent'], blocks: [] }}
                goals={[
                    {
                        id: 'goal-parent',
                        name: 'Parent Goal',
                        deadline: '2026-03-13',
                        type: 'MidTermGoal',
                    },
                    {
                        id: 'goal-child',
                        name: 'Child Goal',
                        deadline: '2026-03-10',
                        type: 'ShortTermGoal',
                        parent_id: 'goal-parent',
                    },
                ]}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /Set Goal Deadline for This Date/i }));

        expect(screen.getByText('Parent Goal')).toBeInTheDocument();
        expect(screen.queryByText('Child Goal')).not.toBeInTheDocument();
    });
});
