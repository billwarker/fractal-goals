import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import ChildGoalIconRow from '../ChildGoalIconRow';

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: (level) => (level === 'Completed' ? '#00ff00' : '#3366ff'),
        getGoalSecondaryColor: () => '#111111',
        getGoalIcon: () => 'circle',
    }),
}));

const children = [
    { id: 'c1', name: 'Run a 5k', completed: true },
    { id: 'c2', attributes: { id: 'c2', name: 'Run a 10k', completed: false } },
    { id: 'c3', name: 'Half marathon' },
];

describe('ChildGoalIconRow', () => {
    it('shows one icon per child and the completed count', () => {
        render(<ChildGoalIconRow childGoals={children} childType="ShortTermGoal" />);

        expect(screen.getByRole('list', { name: 'Child goals: 1 of 3 complete' })).toBeInTheDocument();
        expect(screen.getAllByRole('listitem')).toHaveLength(3);
        expect(screen.getByRole('img', { name: 'Run a 5k (complete)' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Run a 10k' })).toBeInTheDocument();
        expect(screen.getByText('Completes when every child goal is complete', { exact: false }))
            .toHaveTextContent('Completes when every child goal is complete (1 / 3 complete)');
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(screen.getAllByRole('tooltip').map((tip) => tip.textContent))
            .toEqual(['Run a 5k (complete)', 'Run a 10k', 'Half marathon']);
    });

    it('opens a child when its icon is clicked', () => {
        const onGoalSelect = vi.fn();
        render(<ChildGoalIconRow childGoals={children} childType="ShortTermGoal" onGoalSelect={onGoalSelect} />);

        fireEvent.click(screen.getByRole('button', { name: 'Run a 10k' }));
        expect(onGoalSelect).toHaveBeenCalledWith(children[1]);
    });
});
