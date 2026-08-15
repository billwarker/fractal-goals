import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ActivityBuilder from '../ActivityBuilder';

const mockCreateActivity = vi.hoisted(() => vi.fn());

vi.mock('../../contexts/ActivitiesContext', () => ({
    useActivities: () => ({
        createActivity: mockCreateActivity,
        updateActivity: vi.fn(),
    }),
}));

vi.mock('../../hooks/useActivityQueries', () => ({
    useActivityGroups: () => ({ activityGroups: [] }),
    useFractalMetrics: () => ({ fractalMetrics: [], isLoading: false, error: null }),
    useCreateFractalMetric: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../../hooks/useGoalQueries', () => ({
    useFractalTree: () => ({
        data: {
            id: 'root-1',
            name: 'Root Goal',
            type: 'UltimateGoal',
            children: [{ id: 'goal-1', name: 'Current Goal', type: 'ImmediateGoal', children: [] }],
        },
    }),
}));

vi.mock('../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#22d3ee',
        getGoalIcon: () => 'circle',
    }),
}));

describe('ActivityBuilder goal-scoped creation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCreateActivity.mockResolvedValue({
            id: 'activity-1',
            name: 'Practice',
            associated_goal_ids: ['goal-1'],
        });
    });

    it('includes a deduplicated entry-point goal in the create request', async () => {
        render(
            <ActivityBuilder
                isOpen
                onClose={vi.fn()}
                editingActivity={null}
                rootId="root-1"
                onSave={vi.fn()}
                initialSelectedGoalIds={['goal-1', 'goal-1']}
            />
        );

        expect(screen.getByText('Associated Goals (1)')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Activity Name'), { target: { value: 'Practice' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create Activity' }));

        await waitFor(() => expect(mockCreateActivity).toHaveBeenCalledWith(
            'root-1',
            expect.objectContaining({ goal_ids: ['goal-1'] })
        ));
    });

    it('awaits post-create synchronization before closing once', async () => {
        let finishPostCreate;
        const onSave = vi.fn(() => new Promise((resolve) => {
            finishPostCreate = resolve;
        }));
        const onClose = vi.fn();

        render(
            <ActivityBuilder
                isOpen
                onClose={onClose}
                editingActivity={null}
                rootId="root-1"
                onSave={onSave}
            />
        );

        fireEvent.change(screen.getByLabelText('Activity Name'), { target: { value: 'Practice' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create Activity' }));
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(onClose).not.toHaveBeenCalled();

        finishPostCreate();
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });
});
