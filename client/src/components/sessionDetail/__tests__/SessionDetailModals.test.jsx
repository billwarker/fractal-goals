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

vi.mock('../../ConnectedGoalDetailModal', () => ({
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
                activityGroups={[{ id: 'group-1', name: 'Technique', parent_id: null }]}
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
            activityGroups: [{ id: 'group-1', name: 'Technique', parent_id: null }],
        }));
    });

    it('passes session hierarchy goal targets through to the goal detail modal', async () => {
        const selectedGoal = {
            id: 'goal-1',
            name: 'Goal 1',
            attributes: { id: 'goal-1', type: 'ShortTermGoal' },
            targets: [
                { id: 'target-1', name: 'Section 1', activity_id: 'activity-1' },
            ],
        };

        render(
            <SessionDetailModals
                rootId="root-1"
                activities={[]}
                activityGroups={[]}
                showDeleteConfirm={false}
                onCloseDeleteConfirm={vi.fn()}
                onConfirmDelete={vi.fn()}
                showBuilder={false}
                builderActivity={null}
                onCloseBuilder={vi.fn()}
                onActivityCreated={vi.fn()}
                selectedGoal={selectedGoal}
                onCloseGoal={vi.fn()}
                onUpdateGoal={vi.fn()}
                onToggleGoalCompletion={vi.fn()}
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
            goal: selectedGoal,
        }));
    });
});
