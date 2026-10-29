import React, { useCallback, useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import ActivityAssociator from '../ActivityAssociator';

const createActivityGroup = vi.fn();
const setActivityGroupGoals = vi.fn();
const useGoalAssociations = vi.fn(() => ({ activities: [] }));
const updateGoal = vi.fn(() => Promise.resolve());

vi.mock('../../../contexts/ActivitiesContext', () => ({
    useActivities: () => ({
        createActivityGroup: (...args) => createActivityGroup(...args),
        setActivityGroupGoals: (...args) => setActivityGroupGoals(...args),
    }),
    useOptionalActivities: () => ({
        createActivityGroup: (...args) => createActivityGroup(...args),
        setActivityGroupGoals: (...args) => setActivityGroupGoals(...args),
    }),
}));

vi.mock('../../../hooks/useGoalQueries', () => ({
    useGoalAssociations: (...args) => useGoalAssociations(...args),
}));

vi.mock('../../../utils/api', () => ({
    fractalApi: {
        updateGoal: (...args) => updateGoal(...args),
    },
}));

vi.mock('../../common/ActivitySearchWidget', () => ({
    default: () => <div data-testid="activity-search-widget" />,
}));

function ActivityAssociatorHarness({
    initialActivities,
    initialGroups = [],
    activityDefinitions = [],
    activityGroups = [],
    onSave = vi.fn(() => Promise.resolve()),
    parentGoalId = null,
    goalId = 'goal-1',
    inheritParentActivities = false,
    useFooterAssociateAction = false,
}) {
    const [activities, setActivities] = useState(initialActivities);
    const [groups, setGroups] = useState(initialGroups);
    const [inheritParent, setInheritParent] = useState(inheritParentActivities);
    const [associateAction, setAssociateAction] = useState(null);
    const registerAssociateAction = useCallback((handler) => {
        setAssociateAction(() => handler);
    }, []);

    return (
        <>
            {useFooterAssociateAction && (
                <button type="button" onClick={associateAction || undefined}>
                    Footer Associate Activities
                </button>
            )}
            <ActivityAssociator
                associatedActivities={activities}
                setAssociatedActivities={setActivities}
                associatedActivityGroups={groups}
                setAssociatedActivityGroups={setGroups}
                activityDefinitions={activityDefinitions}
                activityGroups={activityGroups}
                setActivityGroups={() => {}}
                targets={[]}
                setTargets={() => {}}
                rootId="root-1"
                goalId={goalId}
                parentGoalId={parentGoalId}
                onCloseSelector={() => {}}
                onCreateActivity={() => {}}
                onSave={onSave}
                inheritParentActivities={inheritParent}
                setInheritParentActivities={setInheritParent}
                useFooterAssociateAction={useFooterAssociateAction}
                registerAssociateAction={registerAssociateAction}
            />
        </>
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

    it('provides concise mobile labels for every activity-count category', () => {
        render(
            <ActivityAssociatorHarness
                initialActivities={[
                    { id: 'direct', name: 'Direct', has_direct_association: true },
                    {
                        id: 'child',
                        name: 'Child',
                        has_direct_association: false,
                        inherited_from_children: true,
                    },
                    {
                        id: 'parent',
                        name: 'Parent',
                        has_direct_association: false,
                        inherited_from_parent: true,
                    },
                ]}
                parentGoalId="parent-goal-1"
            />
        );

        expect(screen.getByText('Total')).toBeInTheDocument();
        expect(screen.getByText('Directly Associated')).toBeInTheDocument();
        expect(screen.getByText('Inherited From Children')).toBeInTheDocument();
        expect(screen.getByText('Inherited From Parent')).toBeInTheDocument();
        expect(screen.getByText('Direct', { selector: '[class*="metricLabelCompact"]' })).toBeInTheDocument();
        expect(screen.getByText('Children', { selector: '[class*="metricLabelCompact"]' })).toBeInTheDocument();
        expect(screen.getByText('Parent', { selector: '[class*="metricLabelCompact"]' })).toBeInTheDocument();
    });

    it('persists the inherit-from-parent flag for an existing goal', async () => {
        render(
            <ActivityAssociatorHarness
                initialActivities={[]}
                parentGoalId="parent-goal-1"
                inheritParentActivities={false}
            />
        );

        fireEvent.click(screen.getByRole('checkbox'));

        await waitFor(() => {
            expect(updateGoal).toHaveBeenCalledWith('root-1', 'goal-1', {
                inherit_parent_activities: true,
            });
        });
    });

    it('shows a parent-inheritance preview for create mode without persisting direct associations', () => {
        useGoalAssociations.mockReturnValue({
            activities: [
                {
                    id: 'parent-activity-1',
                    name: 'Parent Activity',
                    has_direct_association: true,
                },
            ],
        });

        render(
            <ActivityAssociatorHarness
                initialActivities={[]}
                goalId={null}
                parentGoalId="parent-goal-1"
                inheritParentActivities={true}
            />
        );

        expect(screen.getByText('Parent Activity')).toBeInTheDocument();
        expect(screen.getByText('↓ inherited from parent')).toBeInTheDocument();
        expect(screen.queryByTitle('Remove association')).not.toBeInTheDocument();
        expect(updateGoal).not.toHaveBeenCalled();
    });

    it('puts the picker above collapsed associated activity groups while associating activities', async () => {
        render(
            <ActivityAssociatorHarness
                initialActivities={[
                    {
                        id: 'associated-activity',
                        name: 'Already Linked Exercise',
                        group_id: 'group-1',
                        has_direct_association: true,
                    },
                ]}
                activityDefinitions={[
                    {
                        id: 'new-activity',
                        name: 'New Candidate Exercise',
                        group_id: null,
                    },
                ]}
                activityGroups={[
                    {
                        id: 'group-1',
                        name: 'Already Associated Group',
                        parent_id: null,
                        sort_order: 1,
                    },
                ]}
                useFooterAssociateAction
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Footer Associate Activities' }));

        const pickerTitle = await screen.findByText('Available Activities & Groups');
        const associatedGroup = screen.getByText('Already Associated Group');

        expect(screen.queryByRole('button', { name: '← Back' })).not.toBeInTheDocument();
        expect(
            pickerTitle.compareDocumentPosition(associatedGroup) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
        expect(screen.queryByText('Already Linked Exercise')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: '+' })).toBeInTheDocument();
    });

    describe('one activity group per goal', () => {
        const groups = [
            { id: 'group-a', name: 'Songs', parent_id: null, sort_order: 1 },
            { id: 'group-b', name: 'Scales', parent_id: null, sort_order: 2 },
        ];
        const definitions = [
            { id: 'song-1', name: 'Head Over Heels', group_id: 'group-a' },
            { id: 'scale-1', name: 'Major Scale', group_id: 'group-b' },
        ];
        const linkedSong = { id: 'song-1', name: 'Head Over Heels', group_id: 'group-a', from_linked_group: true };

        const chooseGroup = async (name) => {
            fireEvent.click(screen.getByRole('button', { name: '+ Associate Activities' }));
            await screen.findByText('Available Activities & Groups');
            const row = screen.getAllByText(name)
                .map((node) => node.closest('button')?.parentElement)
                .find((element) => element && within(element).queryByRole('button', { name: 'Link Group' }));
            fireEvent.click(within(row).getByRole('button', { name: 'Link Group' }));
            fireEvent.click(screen.getByRole('button', { name: /Add Selected/ }));
        };

        it('asks before replacing the current group and unlinks its activities on confirm', async () => {
            const onSave = vi.fn(() => Promise.resolve());
            render(
                <ActivityAssociatorHarness
                    initialActivities={[linkedSong]}
                    initialGroups={[groups[0]]}
                    activityDefinitions={definitions}
                    activityGroups={groups}
                    onSave={onSave}
                />
            );
            await chooseGroup('Scales');

            expect(await screen.findByRole('heading', { name: 'Replace Activity Group?' })).toBeInTheDocument();
            // Picked activities persist at once; the group is still the old one.
            expect(onSave).toHaveBeenLastCalledWith(expect.any(Array), [groups[0]]);

            expect(onSave.mock.calls.at(-1)[0].map((activity) => activity.id)).toEqual(['song-1']);

            fireEvent.click(screen.getByRole('button', { name: 'Replace Group' }));
            await waitFor(() => expect(onSave).toHaveBeenLastCalledWith(expect.any(Array), [groups[1]]));
            const [savedActivities] = onSave.mock.calls.at(-1);
            expect(savedActivities.map((activity) => activity.id)).toEqual(['scale-1']);
        });

        it('keeps the current group when the replacement is declined', async () => {
            const onSave = vi.fn(() => Promise.resolve());
            render(
                <ActivityAssociatorHarness
                    initialActivities={[linkedSong]}
                    initialGroups={[groups[0]]}
                    activityDefinitions={definitions}
                    activityGroups={groups}
                    onSave={onSave}
                />
            );
            await chooseGroup('Scales');
            fireEvent.click(await screen.findByRole('button', { name: 'Keep Current Group' }));
            await waitFor(() => expect(screen.queryByRole('heading', { name: 'Replace Activity Group?' })).not.toBeInTheDocument());
            expect(onSave.mock.calls.every(([, savedGroups]) => savedGroups.length === 1 && savedGroups[0].id === 'group-a')).toBe(true);
            // The declined group's activities were never linked on their own.
            expect(onSave.mock.calls.every(([savedActivities]) => !savedActivities.some((activity) => activity.id === 'scale-1'))).toBe(true);
        });

        it('lets the picker hold one group at a time', async () => {
            const onSave = vi.fn(() => Promise.resolve());
            render(
                <ActivityAssociatorHarness
                    initialActivities={[]}
                    activityDefinitions={definitions}
                    activityGroups={groups}
                    onSave={onSave}
                />
            );
            fireEvent.click(screen.getByRole('button', { name: '+ Associate Activities' }));
            await screen.findByText('Available Activities & Groups');
            const [songs, scales] = screen.getAllByRole('button', { name: 'Link Group' });
            fireEvent.click(songs);
            fireEvent.click(scales);
            expect(screen.getAllByRole('button', { name: /Linked/ })).toHaveLength(1);
            fireEvent.click(screen.getByRole('button', { name: /Add Selected/ }));
            await waitFor(() => expect(onSave).toHaveBeenLastCalledWith(expect.any(Array), [groups[1]]));
            const [savedActivities] = onSave.mock.calls.at(-1);
            expect(savedActivities.map((activity) => activity.id)).toEqual(['scale-1']);
        });

        it('links a first group without asking', async () => {
            const onSave = vi.fn(() => Promise.resolve());
            render(
                <ActivityAssociatorHarness
                    initialActivities={[]}
                    activityDefinitions={definitions}
                    activityGroups={groups}
                    onSave={onSave}
                />
            );
            await chooseGroup('Scales');
            await waitFor(() => expect(onSave).toHaveBeenLastCalledWith(expect.any(Array), [groups[1]]));
            expect(screen.queryByRole('heading', { name: 'Replace Activity Group?' })).not.toBeInTheDocument();
        });
    });
});
