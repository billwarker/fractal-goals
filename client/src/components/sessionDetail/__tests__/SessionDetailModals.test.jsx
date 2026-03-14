import React from 'react';
import { render, screen } from '@testing-library/react';

import SessionDetailModals from '../SessionDetailModals';

const goalDetailModalSpy = vi.fn();

vi.mock('../ConfirmationModal', () => ({
    default: () => <div data-testid="confirmation-modal" />,
}));

vi.mock('../../ActivityBuilder', () => ({
    default: () => <div data-testid="activity-builder" />,
}));

vi.mock('../../GoalDetailModal', () => ({
    default: (props) => {
        goalDetailModalSpy(props);
        return <div data-testid="goal-detail-modal" />;
    },
}));

vi.mock('../ActivityAssociationModal', () => ({
    default: () => <div data-testid="activity-association-modal" />,
}));

describe('SessionDetailModals', () => {
    beforeEach(() => {
        goalDetailModalSpy.mockClear();
    });

    it('passes the goal completion handler to the session detail goal modal', async () => {
        const onToggleGoalCompletion = vi.fn();

        render(
            <SessionDetailModals
                rootId="root-1"
                activities={[]}
                showDeleteConfirm={false}
                onCloseDeleteConfirm={vi.fn()}
                onConfirmDelete={vi.fn()}
                showBuilder={false}
                builderActivity={null}
                onCloseBuilder={vi.fn()}
                onActivityCreated={vi.fn()}
                selectedGoal={{ id: 'goal-1', name: 'Goal 1', attributes: { id: 'goal-1', type: 'ImmediateGoal' } }}
                onCloseGoal={vi.fn()}
                onUpdateGoal={vi.fn()}
                onToggleGoalCompletion={onToggleGoalCompletion}
                onGoalAssociationsChanged={vi.fn()}
                showAssociationModal={false}
                onCloseAssociationModal={vi.fn()}
                associationContext={null}
                allAvailableGoals={[]}
                onAssociateActivity={vi.fn()}
            />
        );

        expect(await screen.findByTestId('goal-detail-modal')).toBeInTheDocument();
        expect(goalDetailModalSpy).toHaveBeenCalledWith(expect.objectContaining({
            onToggleCompletion: onToggleGoalCompletion,
        }));
    });
});
