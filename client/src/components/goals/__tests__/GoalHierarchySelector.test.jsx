import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import GoalHierarchySelector from '../GoalHierarchySelector';

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#22d3ee',
        getGoalSecondaryColor: () => '#0f766e',
        getGoalIcon: () => 'circle',
        getScopedCharacteristics: () => ({ icon: 'circle' }),
    }),
}));

vi.mock('../../atoms/GoalIcon', () => ({
    default: () => <span>icon</span>,
}));

describe('GoalHierarchySelector', () => {
    const goals = [
        { id: 'goal-root', name: 'Root Goal', type: 'UltimateGoal', childrenIds: ['goal-child'] },
        { id: 'goal-child', name: 'Child Goal', type: 'LongTermGoal', parent_id: 'goal-root', childrenIds: ['goal-grandchild'] },
        { id: 'goal-grandchild', name: 'Grandchild Goal', type: 'ShortTermGoal', parent_id: 'goal-child', childrenIds: [] },
    ];

    it('hides the ancestor and descendant bulk controls in single select mode', () => {
        render(
            <GoalHierarchySelector
                goals={goals}
                selectedGoalIds={[]}
                onSelectionChange={vi.fn()}
                selectionMode="single"
            />
        );

        expect(screen.queryByLabelText(/Select all ancestors/i)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/Select all descendants/i)).not.toBeInTheDocument();
    });

    it('selects all descendants recursively and allows child goals to be unchecked independently', () => {
        const handleSelectionChange = vi.fn();
        const view = render(
            <GoalHierarchySelector
                goals={goals}
                selectedGoalIds={[]}
                onSelectionChange={handleSelectionChange}
                selectionMode="multiple"
            />
        );

        fireEvent.click(screen.getByLabelText('Select all descendants of Root Goal'));
        expect(handleSelectionChange).toHaveBeenLastCalledWith(['goal-child', 'goal-grandchild']);

        view.rerender(
            <GoalHierarchySelector
                goals={goals}
                selectedGoalIds={['goal-child', 'goal-grandchild']}
                onSelectionChange={handleSelectionChange}
                selectionMode="multiple"
            />
        );

        fireEvent.click(screen.getByLabelText('Select Child Goal'));
        expect(handleSelectionChange).toHaveBeenLastCalledWith(['goal-grandchild']);
    });

    it('selects all ancestors recursively', () => {
        const handleSelectionChange = vi.fn();
        render(
            <GoalHierarchySelector
                goals={goals}
                selectedGoalIds={[]}
                onSelectionChange={handleSelectionChange}
                selectionMode="multiple"
            />
        );

        fireEvent.click(screen.getByLabelText('Select all ancestors of Grandchild Goal'));
        expect(handleSelectionChange).toHaveBeenLastCalledWith(['goal-child', 'goal-root']);
    });
});
