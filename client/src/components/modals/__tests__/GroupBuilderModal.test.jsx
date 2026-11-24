import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import GroupBuilderModal from '../GroupBuilderModal';

const {
    mockCreateActivityGroup,
    mockSetActivityGroupGoals,
    mockUpdateActivityGroup,
    mockUseFractalTree,
} = vi.hoisted(() => ({
    mockCreateActivityGroup: vi.fn(),
    mockSetActivityGroupGoals: vi.fn(),
    mockUpdateActivityGroup: vi.fn(),
    mockUseFractalTree: vi.fn(),
}));

vi.mock('../../../contexts/ActivitiesContext', () => ({
    useActivities: () => ({
        createActivityGroup: mockCreateActivityGroup,
        updateActivityGroup: mockUpdateActivityGroup,
        setActivityGroupGoals: mockSetActivityGroupGoals,
    }),
}));

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#4f9cff',
        getGoalSecondaryColor: () => '#1f3d66',
        getGoalIcon: () => 'circle',
        getScopedCharacteristics: () => null,
    }),
}));

vi.mock('../../../hooks/useGoalQueries', () => ({
    useFractalTree: (...args) => mockUseFractalTree(...args),
}));

vi.mock('../../../hooks/useIsMobile', () => ({
    default: () => false,
}));

describe('GroupBuilderModal', () => {
    beforeEach(() => {
        mockCreateActivityGroup.mockResolvedValue({ id: 'group-1', name: 'Pull' });
        mockUpdateActivityGroup.mockResolvedValue({ id: 'group-1', name: 'Pull' });
        mockSetActivityGroupGoals.mockResolvedValue({});
        mockUseFractalTree.mockReturnValue({
            data: {
                id: 'goal-root',
                name: 'Become Elite',
                type: 'UltimateGoal',
                children: [
                    {
                        id: 'goal-child',
                        name: 'Strict Handstand Push Up',
                        type: 'ShortTermGoal',
                        children: [],
                    },
                ],
            },
        });
    });

    it('uses the hierarchy selector when associating goals to an activity group', async () => {
        const onClose = vi.fn();
        const onSave = vi.fn();

        render(
            <GroupBuilderModal
                isOpen
                onClose={onClose}
                editingGroup={null}
                rootId="root-1"
                activityGroups={[]}
                onSave={onSave}
            />
        );

        fireEvent.change(screen.getByLabelText('Name'), {
            target: { value: 'Pull' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Link Goals' }));

        expect(screen.getByRole('heading', { name: 'Link Goals: Pull' })).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Search goals...')).toBeInTheDocument();
        expect(screen.getByText('Become Elite')).toBeInTheDocument();
        expect(screen.getByText('Strict Handstand Push Up')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save 0 Linked Goals' })).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Select Strict Handstand Push Up'));
        fireEvent.click(screen.getByRole('button', { name: 'Save 1 Linked Goal' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => {
            expect(mockCreateActivityGroup).toHaveBeenCalledWith('root-1', {
                name: 'Pull',
                description: '',
                parent_id: null,
            });
            expect(mockSetActivityGroupGoals).toHaveBeenCalledWith('root-1', 'group-1', ['goal-child']);
        });
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
            id: 'group-1',
            associated_goal_ids: ['goal-child'],
        }));
        expect(onClose).toHaveBeenCalled();
    });

    it('saves goals that already have other groups without asking', async () => {
        mockSetActivityGroupGoals.mockResolvedValueOnce({ id: 'group-1' });
        const onClose = vi.fn();
        const editingGroup = { id: 'group-1', name: 'Pull', description: '', parent_id: null, associated_goal_ids: ['goal-child', 'goal-root'] };
        render(<GroupBuilderModal isOpen onClose={onClose} editingGroup={editingGroup} rootId="root-1" activityGroups={[]} onSave={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(mockSetActivityGroupGoals).toHaveBeenCalledTimes(1);
        expect(mockSetActivityGroupGoals).toHaveBeenCalledWith('root-1', 'group-1', ['goal-child', 'goal-root']);
        expect(screen.queryByRole('dialog', { name: /Move goals/ })).not.toBeInTheDocument();
    });

    it('lists linked goals by name with their level icons, in tree order', () => {
        const editingGroup = { id: 'group-1', name: 'Pull', description: '', parent_id: null, associated_goal_ids: ['goal-child', 'goal-root', 'goal-gone'] };
        render(<GroupBuilderModal isOpen onClose={vi.fn()} editingGroup={editingGroup} rootId="root-1" activityGroups={[]} onSave={vi.fn()} />);
        const items = within(screen.getByRole('list', { name: 'Linked goals' })).getAllByRole('listitem');
        expect(items.map((item) => item.textContent)).toEqual(['Become Elite', 'Strict Handstand Push Up', '+1 goal']);
        expect(items[0].querySelector('svg')).not.toBeNull();
        expect(screen.queryByText('3 linked goals')).not.toBeInTheDocument();
    });
});
