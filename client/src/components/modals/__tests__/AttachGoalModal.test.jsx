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
    it('renders goal icons and resets selected goal and deadline when reopened', () => {
        const goals = [
            { id: 'goal-1', name: 'Goal One', attributes: { type: 'MidTermGoal' } },
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
            />
        );

        expect(screen.getByTestId('goal-icon')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('radio'));
        fireEvent.change(screen.getByDisplayValue(''), {
            target: { value: '2026-03-10' },
        });

        rerender(
            <AttachGoalModal
                isOpen={false}
                onClose={vi.fn()}
                onSave={vi.fn()}
                goals={goals}
                block={block}
            />
        );

        rerender(
            <AttachGoalModal
                isOpen={true}
                onClose={vi.fn()}
                onSave={vi.fn()}
                goals={goals}
                block={block}
            />
        );

        expect(screen.getByRole('radio')).not.toBeChecked();
        expect(screen.queryByDisplayValue('2026-03-10')).not.toBeInTheDocument();
    });
});
