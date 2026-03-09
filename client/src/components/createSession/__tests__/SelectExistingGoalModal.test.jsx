import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import SelectExistingGoalModal from '../SelectExistingGoalModal';

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#4caf50',
    }),
}));

describe('SelectExistingGoalModal', () => {
    it('renders through the shared modal shell and preserves selection flow', () => {
        const onConfirm = vi.fn();

        render(
            <SelectExistingGoalModal
                isOpen={true}
                existingImmediateGoals={[
                    { id: 'goal-1', name: 'Immediate Goal One', description: 'Desc' },
                ]}
                alreadyAddedGoalIds={[]}
                onClose={vi.fn()}
                onConfirm={onConfirm}
            />
        );

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Select Existing Immediate Goal(s)')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Immediate Goal One'));
        fireEvent.click(screen.getByRole('button', { name: 'Add Selected (1)' }));

        expect(onConfirm).toHaveBeenCalledWith(['goal-1']);
    });
});
