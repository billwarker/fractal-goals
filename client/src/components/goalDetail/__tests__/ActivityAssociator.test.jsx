import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ActivityAssociator from '../ActivityAssociator';

const createActivityGroup = vi.fn();
const setActivityGroupGoals = vi.fn();
const useGoalAssociations = vi.fn(() => ({ activities: [] }));

vi.mock('../../../contexts/ActivitiesContext', () => ({
    useActivities: () => ({
        createActivityGroup: (...args) => createActivityGroup(...args),
        setActivityGroupGoals: (...args) => setActivityGroupGoals(...args),
    }),
}));

vi.mock('../../../hooks/useGoalQueries', () => ({
    useGoalAssociations: (...args) => useGoalAssociations(...args),
}));

vi.mock('../../common/ActivitySearchWidget', () => ({
    default: () => <div data-testid="activity-search-widget" />,
}));

function ActivityAssociatorHarness({
    initialActivities,
    onSave = vi.fn(() => Promise.resolve()),
    parentGoalId = null,
    goalType = 'ShortTermGoal',
}) {
    const [activities, setActivities] = useState(initialActivities);
    const [groups, setGroups] = useState([]);

    return (
        <ActivityAssociator
            associatedActivities={activities}
            setAssociatedActivities={setActivities}
            associatedActivityGroups={groups}
            setAssociatedActivityGroups={setGroups}
            activityDefinitions={[]}
            activityGroups={[]}
            setActivityGroups={() => {}}
            targets={[]}
            setTargets={() => {}}
            rootId="root-1"
            goalId="goal-1"
            parentGoalId={parentGoalId}
            onCloseSelector={() => {}}
            onCreateActivity={() => {}}
            goalType={goalType}
            onSave={onSave}
        />
    );
}

describe('ActivityAssociator', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useGoalAssociations.mockReturnValue({ activities: [] });
    });

    it('converts a hybrid direct-plus-child-inherited card into inherited-only after removing the direct association', async () => {
        const onSave = vi.fn(() => Promise.resolve());

        render(
            <ActivityAssociatorHarness
                initialActivities={[
                    {
                        id: 'activity-1',
                        name: 'Day 2 Exercises',
                        has_direct_association: true,
                        inherited_from_children: true,
                        inherited_source_goal_names: ['Nail Day 2 Rhythm'],
                        inherited_source_goal_ids: ['child-goal-1'],
                    },
                ]}
                onSave={onSave}
            />
        );

        expect(screen.getByText('↑ Also inherited from Nail Day 2 Rhythm')).toBeInTheDocument();

        fireEvent.click(screen.getByTitle('Remove direct association'));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalled();
        });

        expect(screen.getByText('Day 2 Exercises')).toBeInTheDocument();
        expect(screen.getByText('↑ inherited from child')).toBeInTheDocument();
        expect(screen.queryByTitle('Remove direct association')).not.toBeInTheDocument();

        const savedActivities = onSave.mock.calls.at(-1)[0];
        expect(savedActivities).toEqual([
            expect.objectContaining({
                id: 'activity-1',
                has_direct_association: false,
                inherited_from_children: true,
                is_inherited: true,
            }),
        ]);
    });

    it('renders distinct arrow badges for child- and parent-inherited activities', () => {
        render(
            <ActivityAssociatorHarness
                initialActivities={[
                    {
                        id: 'child-activity',
                        name: 'Child Inherited Activity',
                        has_direct_association: false,
                        inherited_from_children: true,
                        is_inherited: true,
                        source_goal_name: 'Child Goal',
                    },
                    {
                        id: 'parent-activity',
                        name: 'Parent Inherited Activity',
                        has_direct_association: false,
                        inherited_from_parent: true,
                        is_inherited: true,
                        source_goal_name: 'Parent Goal',
                    },
                ]}
                parentGoalId="parent-goal-1"
            />
        );

        expect(screen.getByText('↑ inherited from child')).toBeInTheDocument();
        expect(screen.getByText('↓ inherited from parent')).toBeInTheDocument();
    });
});
