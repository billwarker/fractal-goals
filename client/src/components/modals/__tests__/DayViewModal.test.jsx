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
    const baseProps = {
        isOpen: true,
        onClose: vi.fn(),
        date: '2026-03-09',
        program: { id: 'program-1', blocks: [] },
        goals: [
            { id: 'goal-1', name: 'Finish Grade 1', deadline: '2026-03-09', type: 'ShortTermGoal' },
            { id: 'goal-2', name: 'Cascade Goal', deadline: '2026-03-15', type: 'ImmediateGoal' },
        ],
        onSetGoalDeadline: vi.fn(),
        onScheduleDay: vi.fn(),
        onCreateDayForDate: vi.fn(),
        onUnscheduleDay: vi.fn(),
        blocks: [],
        sessions: [],
    };

    it('uses the shared goal picker for setting a goal deadline on the selected date', () => {
        render(<DayViewModal {...baseProps} />);

        fireEvent.click(screen.getByText('🎯 Set Goal Deadline for This Date'));

        expect(screen.getByText('Finish Grade 1')).toBeInTheDocument();
        expect(screen.getByText('Due Today')).toBeInTheDocument();
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

        fireEvent.click(screen.getByText('📅 Schedule Day for This Date'));
        fireEvent.click(screen.getByText('+ Create New Day From Scratch'));

        expect(onCreateDayForDate).toHaveBeenCalledWith('block-1', '2026-03-09');
    });

    it('hides goals whose parent deadline makes the selected date invalid', () => {
        render(
            <DayViewModal
                {...baseProps}
                date="2026-03-16"
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

        fireEvent.click(screen.getByText('🎯 Set Goal Deadline for This Date'));

        expect(screen.getByText('Parent Goal')).toBeInTheDocument();
        expect(screen.queryByText('Child Goal')).not.toBeInTheDocument();
    });
});
