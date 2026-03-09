import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ActivityAssociationModal from '../ActivityAssociationModal';

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#22d3ee',
        getGoalSecondaryColor: () => '#0f766e',
        getGoalIcon: () => 'circle',
    }),
}));

vi.mock('../../atoms/GoalIcon', () => ({
    default: () => <span>icon</span>,
}));

describe('ActivityAssociationModal', () => {
    const goals = [
        { id: 'goal-1', name: 'Goal One', type: 'ImmediateGoal' },
        { id: 'goal-2', name: 'Goal Two', type: 'ImmediateGoal' },
    ];

    it('rehydrates selection from the latest initial goal ids when reopened', async () => {
        const onAssociate = vi.fn(() => Promise.resolve(true));
        const onClose = vi.fn();
        const view = render(
            <ActivityAssociationModal
                key="goal-1"
                isOpen={true}
                onClose={onClose}
                onAssociate={onAssociate}
                goals={goals}
                initialActivityName="Metronome"
                initialSelectedGoalIds={['goal-1']}
            />
        );

        fireEvent.click(screen.getByText('Goal Two'));
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Associate 2 Goals' })).toBeEnabled();
        });

        view.rerender(
            <ActivityAssociationModal
                key="closed"
                isOpen={false}
                onClose={onClose}
                onAssociate={onAssociate}
                goals={goals}
                initialActivityName="Metronome"
                initialSelectedGoalIds={['goal-1']}
            />
        );

        view.rerender(
            <ActivityAssociationModal
                key="goal-2"
                isOpen={true}
                onClose={onClose}
                onAssociate={onAssociate}
                goals={goals}
                initialActivityName="Metronome"
                initialSelectedGoalIds={['goal-2']}
            />
        );

        fireEvent.click(screen.getByText('Goal One'));
        fireEvent.click(screen.getByRole('button', { name: 'Associate 2 Goals' }));

        await waitFor(() => {
            expect(onAssociate).toHaveBeenCalledWith(['goal-2', 'goal-1']);
        });
    });

    it('waits for association persistence before closing', async () => {
        let resolveSave;
        const onAssociate = vi.fn(() => new Promise((resolve) => {
            resolveSave = resolve;
        }));
        const onClose = vi.fn();

        render(
            <ActivityAssociationModal
                isOpen={true}
                onClose={onClose}
                onAssociate={onAssociate}
                goals={goals}
                initialActivityName="Metronome"
                initialSelectedGoalIds={['goal-1']}
            />
        );

        fireEvent.click(screen.getByText('Goal Two'));
        fireEvent.click(screen.getByRole('button', { name: 'Associate 2 Goals' }));

        expect(onAssociate).toHaveBeenCalledWith(['goal-1', 'goal-2']);
        expect(onClose).not.toHaveBeenCalled();

        resolveSave(true);

        await waitFor(() => {
            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });
});
