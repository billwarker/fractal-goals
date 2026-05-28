import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

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

        render(
            <GroupBuilderModal
                isOpen
                onClose={onClose}
                editingGroup={null}
                rootId="root-1"
                activityGroups={[]}
                onSave={vi.fn()}
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
        expect(onClose).toHaveBeenCalled();
    });
});
