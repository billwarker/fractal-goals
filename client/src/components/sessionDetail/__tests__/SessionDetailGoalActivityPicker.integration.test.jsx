import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import SessionDetailModals from '../SessionDetailModals';

const activityActions = {
    createActivityGroup: vi.fn(),
    setActivityGroupGoals: vi.fn(),
};

vi.mock('../../../contexts/ActivitiesContext', () => ({
    useActivities: () => activityActions,
    useOptionalActivities: () => activityActions,
}));

vi.mock('../../../hooks/useGoalQueries', () => ({
    useGoalAssociations: () => ({ activities: [] }),
}));

vi.mock('../../../utils/api', () => ({
    fractalApi: {
        updateGoal: vi.fn(() => Promise.resolve()),
        setGoalAssociationsBatch: vi.fn(() => Promise.resolve()),
    },
}));

vi.mock('../ConfirmationModal', () => ({
    default: () => <div data-testid="confirmation-modal" />,
}));

vi.mock('../../ActivityBuilder', () => ({
    default: () => <div data-testid="activity-builder" />,
}));

vi.mock('../ActivityAssociationModal', () => ({
    default: () => <div data-testid="activity-association-modal" />,
}));

vi.mock('../../ConnectedGoalDetailModal', async () => {
    const ReactModule = await vi.importActual('react');
    const { default: ActivityAssociator } = await vi.importActual('../../goalDetail/ActivityAssociator');

    function MockConnectedGoalDetailModal({
        rootId,
        goal,
        activityDefinitions,
        activityGroups,
    }) {
        const [associatedActivities, setAssociatedActivities] = ReactModule.useState([]);
        const [associatedActivityGroups, setAssociatedActivityGroups] = ReactModule.useState([]);
        const [groups, setGroups] = ReactModule.useState(activityGroups || []);

        return (
            <ActivityAssociator
                associatedActivities={associatedActivities}
                setAssociatedActivities={setAssociatedActivities}
                associatedActivityGroups={associatedActivityGroups}
                setAssociatedActivityGroups={setAssociatedActivityGroups}
                activityDefinitions={activityDefinitions}
                activityGroups={groups}
                setActivityGroups={setGroups}
                targets={[]}
                setTargets={vi.fn()}
                rootId={rootId}
                goalId={goal?.id || goal?.attributes?.id}
                parentGoalId={goal?.parent_id || goal?.attributes?.parent_id}
                embedded
                onSave={vi.fn(() => Promise.resolve())}
            />
        );
    }

    return { default: MockConnectedGoalDetailModal };
});

function renderSessionDetailModals({ activities, activityGroups }) {
    return render(
        <SessionDetailModals
            rootId="root-1"
            activities={activities}
            activityGroups={activityGroups}
            showDeleteConfirm={false}
            onCloseDeleteConfirm={vi.fn()}
            onConfirmDelete={vi.fn()}
            showBuilder={false}
            builderActivity={null}
            onCloseBuilder={vi.fn()}
            onActivityCreated={vi.fn()}
            selectedGoal={{ id: 'goal-1', name: 'Goal 1', attributes: { id: 'goal-1', type: 'ShortTermGoal' } }}
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
}

describe('SessionDetailModals goal activity picker integration', () => {
    it('keeps available activities grouped and alphabetically sorted within a session-detail goal modal', async () => {
        renderSessionDetailModals({
            activities: [
                { id: 'activity-z', name: 'Zeta Exercise', group_id: 'group-1' },
                { id: 'activity-a', name: 'Alpha Exercise', group_id: 'group-1' },
                { id: 'activity-b', name: 'Beta Exercise', group_id: 'group-1' },
            ],
            activityGroups: [
                { id: 'group-1', name: 'Technique', parent_id: null, sort_order: 1 },
            ],
        });

        fireEvent.click(await screen.findByRole('button', { name: '+ Associate Activities' }));
        expect(await screen.findByText('Available Activities & Groups')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Technique' }));

        const alpha = await screen.findByText('Alpha Exercise');
        const beta = await screen.findByText('Beta Exercise');
        const zeta = await screen.findByText('Zeta Exercise');

        expect(alpha.compareDocumentPosition(beta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(beta.compareDocumentPosition(zeta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
});
