import React from 'react';
import { fireEvent, screen } from '@testing-library/react';

import { renderWithProviders } from '../../../test/test-utils';
import ProgramBlockView from '../ProgramBlockView';

vi.mock('../../../contexts/GoalLevelsContext', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useGoalLevels: () => ({
            getGoalColor: (type) => (type === 'MidTermGoal' ? '#3b82f6' : '#14b8a6'),
            getGoalSecondaryColor: () => '#0f172a',
            getGoalIcon: (type) => (type === 'MidTermGoal' ? 'diamond' : 'square'),
        }),
    };
});

vi.mock('../../../contexts/TimezoneContext', () => ({
    useTimezone: () => ({ timezone: 'UTC' }),
}));

vi.mock('../../atoms/GoalIcon', () => ({
    default: ({ shape }) => <span data-testid="goal-icon">{shape}</span>,
}));

describe('ProgramBlockView', () => {
    it('renders only explicitly block-attached goals with icons in the block header', () => {
        const onGoalClick = vi.fn();
        const explicitGoal = {
            id: 'goal-block',
            name: 'Explicit Block Goal',
            type: 'MidTermGoal',
            deadline: '2026-03-12',
        };

        renderWithProviders(
            <ProgramBlockView
                blocks={[
                    {
                        id: 'block-1',
                        name: 'Block 1',
                        start_date: '2026-03-10',
                        end_date: '2026-03-16',
                        color: '#3A86FF',
                        goal_ids: [],
                        days: [],
                    },
                ]}
                blockGoalsByBlockId={new Map([['block-1', [explicitGoal]]])}
                sessions={[]}
                onEditDay={vi.fn()}
                onAttachGoal={vi.fn()}
                onEditBlock={vi.fn()}
                onDeleteBlock={vi.fn()}
                onAddDay={vi.fn()}
                onGoalClick={onGoalClick}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        expect(screen.getByText('Explicit Block Goal')).toBeInTheDocument();
        expect(screen.getByTestId('goal-icon')).toBeInTheDocument();
        expect(screen.queryByText('Program Level Goal')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('Explicit Block Goal'));
        expect(onGoalClick).toHaveBeenCalledWith(explicitGoal);
    });

    it('renders optional template state and keeps long template names available in block day cards', () => {
        renderWithProviders(
            <ProgramBlockView
                blocks={[
                    {
                        id: 'block-1',
                        name: 'Block 1',
                        start_date: '2026-03-10',
                        end_date: '2026-03-16',
                        color: '#3A86FF',
                        goal_ids: [],
                        days: [
                            {
                                id: 'day-1',
                                name: 'Daily Practice',
                                day_of_week: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
                                templates: [
                                    {
                                        id: 'template-1',
                                        name: 'Very Long Hand Healthy Repertoire Template Name',
                                        is_required: false,
                                    },
                                ],
                            },
                        ],
                    },
                ]}
                blockGoalsByBlockId={new Map()}
                sessions={[]}
                onEditDay={vi.fn()}
                onAttachGoal={vi.fn()}
                onEditBlock={vi.fn()}
                onDeleteBlock={vi.fn()}
                onAddDay={vi.fn()}
                onGoalClick={vi.fn()}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        expect(screen.getByText('Very Long Hand Healthy Repertoire Template Name')).toBeInTheDocument();
        expect(screen.getByText('Optional')).toBeInTheDocument();
    });

    it('counts completed program day occurrences instead of raw completed sessions in the day card summary', () => {
        renderWithProviders(
            <ProgramBlockView
                blocks={[
                    {
                        id: 'block-1',
                        name: 'Block 1',
                        start_date: '2026-03-09',
                        end_date: '2026-03-11',
                        color: '#3A86FF',
                        goal_ids: [],
                        days: [
                            {
                                id: 'day-1',
                                name: 'Daily Practice',
                                day_of_week: ['Monday', 'Tuesday', 'Wednesday'],
                                templates: [
                                    { id: 'template-1', name: 'Warmup', is_required: true },
                                    { id: 'template-2', name: 'Repertoire', is_required: true },
                                ],
                            },
                        ],
                    },
                ]}
                blockGoalsByBlockId={new Map()}
                sessions={[
                    { id: 'session-1', program_day_id: 'day-1', template_id: 'template-1', completed: true, session_start: '2026-03-09T12:00:00Z' },
                    { id: 'session-2', program_day_id: 'day-1', template_id: 'template-2', completed: true, session_start: '2026-03-09T13:00:00Z' },
                    { id: 'session-3', program_day_id: 'day-1', template_id: 'template-1', completed: true, session_start: '2026-03-10T12:00:00Z' },
                    { id: 'session-4', program_day_id: 'day-1', template_id: 'template-1', completed: true, session_start: '2026-03-11T12:00:00Z' },
                    { id: 'session-5', program_day_id: 'day-1', template_id: 'template-1', completed: true, session_start: '2026-03-11T13:00:00Z' },
                    { id: 'session-6', program_day_id: 'day-1', template_id: 'template-2', completed: true, session_start: '2026-03-11T14:00:00Z' },
                ]}
                onEditDay={vi.fn()}
                onAttachGoal={vi.fn()}
                onEditBlock={vi.fn()}
                onDeleteBlock={vi.fn()}
                onAddDay={vi.fn()}
                onGoalClick={vi.fn()}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        expect(screen.getByLabelText('2 completed program days')).toBeInTheDocument();
        expect(screen.queryByLabelText('6 completed program days')).not.toBeInTheDocument();
    });
});
