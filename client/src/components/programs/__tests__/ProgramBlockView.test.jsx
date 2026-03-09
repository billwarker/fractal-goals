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
});
