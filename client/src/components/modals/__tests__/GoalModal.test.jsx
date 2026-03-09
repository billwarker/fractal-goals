import React from 'react';
import { render, screen } from '@testing-library/react';

import GoalModal from '../GoalModal';

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#4caf50',
        getGoalTextColor: () => '#111111',
        getGoalIcon: () => 'circle',
        getDeadlineConstraints: () => ({}),
        getLevelCharacteristics: () => ({
            description_required: false,
            default_deadline_offset_value: null,
            default_deadline_offset_unit: null,
        }),
    }),
}));

describe('GoalModal', () => {
    it('renders through the shared modal shell for child-goal creation', () => {
        render(
            <GoalModal
                isOpen={true}
                onClose={vi.fn()}
                onSubmit={vi.fn()}
                parent={{ id: 'parent-1', name: 'Parent Goal', type: 'ShortTermGoal' }}
            />
        );

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Add Immediate Goal')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    });
});
