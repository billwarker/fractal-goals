import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import AttachGoalModal from '../AttachGoalModal';

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

vi.mock('../../atoms/GoalIcon', () => ({
    default: ({ shape }) => <span data-testid="goal-icon">{shape}</span>,
}));

describe('AttachGoalModal', () => {
    it('renders associated goals with icons and resets selected goal and deadline when reopened', () => {
        const goals = [
            { id: 'goal-1', name: 'Goal One', deadline: '2026-03-08', attributes: { type: 'MidTermGoal' } },
            { id: 'goal-2', name: 'Goal Two', attributes: { type: 'ShortTermGoal' } },
        ];
        const block = {
            id: 'block-1',
            name: 'Base Phase',
            start_date: '2026-03-01',
            end_date: '2026-03-31',
        };

        const { rerender } = render(
            <AttachGoalModal
                isOpen={true}
                onClose={vi.fn()}
                onSave={vi.fn()}
                goals={goals}
                block={block}
                associatedGoalIds={['goal-1']}
            />
        );

        expect(screen.getAllByTestId('goal-icon')).toHaveLength(2);
        expect(screen.getByText('Attached')).toBeInTheDocument();
        expect(screen.getByText('Current deadline: Mar 8, 2026')).toBeInTheDocument();
        expect(screen.getAllByRole('radio')[0]).not.toBeChecked();

        fireEvent.click(screen.getAllByRole('radio')[0]);
        expect(screen.getByDisplayValue('2026-03-08')).toBeInTheDocument();

        fireEvent.click(screen.getAllByRole('radio')[1]);
        fireEvent.change(screen.getByDisplayValue(''), { target: { value: '2026-03-10' } });

        rerender(
            <AttachGoalModal
                isOpen={false}
                onClose={vi.fn()}
                onSave={vi.fn()}
                goals={goals}
                block={block}
                associatedGoalIds={['goal-1']}
            />
        );

        rerender(
            <AttachGoalModal
                isOpen={true}
                onClose={vi.fn()}
                onSave={vi.fn()}
                goals={goals}
                block={block}
                associatedGoalIds={['goal-1']}
            />
        );

        expect(screen.getAllByRole('radio')[0]).not.toBeChecked();
        expect(screen.queryByDisplayValue('2026-03-10')).not.toBeInTheDocument();
    });
});
