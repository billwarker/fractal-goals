import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ActivityBuilder from '../ActivityBuilder';

const {
    mockCreateActivity,
    mockUpdateActivity,
    mockUseFractalTree,
    mockUseFractalMetrics,
} = vi.hoisted(() => ({
    mockCreateActivity: vi.fn(),
    mockUpdateActivity: vi.fn(),
    mockUseFractalTree: vi.fn(),
    mockUseFractalMetrics: vi.fn(),
}));

vi.mock('../../contexts/ActivitiesContext', () => ({
    useActivities: () => ({
        createActivity: mockCreateActivity,
        updateActivity: mockUpdateActivity,
    }),
}));

vi.mock('../../hooks/useActivityQueries', () => ({
    useActivityGroups: () => ({
        activityGroups: [{ id: 'group-1', name: 'Technique' }],
        isLoading: false,
        error: null,
    }),
    useFractalMetrics: (...args) => mockUseFractalMetrics(...args),
    useCreateFractalMetric: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../../hooks/useGoalQueries', () => ({
    useFractalTree: (...args) => mockUseFractalTree(...args),
}));

vi.mock('../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#22d3ee',
    }),
}));

vi.mock('../modals/DeleteConfirmModal', () => ({
    default: ({ isOpen, title, message, confirmText, onConfirm }) => (
        isOpen ? (
            <div>
                <div>{title}</div>
                <div>{message}</div>
                <button onClick={onConfirm}>{confirmText}</button>
            </div>
        ) : null
    ),
}));

vi.mock('../sessionDetail/ActivityAssociationModal', () => ({
    default: ({ isOpen, onAssociate }) => (
        isOpen ? <button onClick={() => onAssociate(['goal-1'])}>associate goal</button> : null
    ),
}));

describe('ActivityBuilder', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCreateActivity.mockResolvedValue({ id: 'activity-1', name: 'Scale Practice' });
        mockUpdateActivity.mockResolvedValue({ id: 'activity-1', name: 'Scale Practice' });
        mockUseFractalTree.mockReturnValue({
            data: {
                id: 'goal-root',
                name: 'Root Goal',
                type: 'LongTermGoal',
                children: [
                    { id: 'goal-1', name: 'Child Goal', type: 'ShortTermGoal', children: [] },
                ],
            },
        });
        mockUseFractalMetrics.mockReturnValue({
            fractalMetrics: [
                {
                    id: 'metric-fractal-1',
                    name: 'Speed',
                    unit: 'bpm',
                    is_multiplicative: true,
                    is_additive: false,
                    input_type: 'number',
                },
            ],
            isLoading: false,
            error: null,
        });
    });

    it('creates an activity through the extracted form flow', async () => {
        const onClose = vi.fn();
        const onSave = vi.fn();

        render(
            <ActivityBuilder
                isOpen={true}
                onClose={onClose}
                editingActivity={null}
                rootId="root-1"
                onSave={onSave}
            />
        );

        fireEvent.change(screen.getByLabelText('Activity Name'), {
            target: { value: 'Scale Practice' },
        });

        fireEvent.click(screen.getByRole('button', { name: 'Create Activity' }));

        await waitFor(() => {
            expect(mockCreateActivity).toHaveBeenCalledWith('root-1', expect.objectContaining({
                name: 'Scale Practice',
                has_metrics: true,
            }));
        });

        expect(onSave).toHaveBeenCalledWith({ id: 'activity-1', name: 'Scale Practice' });
        expect(onClose).toHaveBeenCalled();
    });

    it('persists metric selections chosen from the dropdown', async () => {
        render(
            <ActivityBuilder
                isOpen={true}
                onClose={vi.fn()}
                editingActivity={null}
                rootId="root-1"
                onSave={vi.fn()}
            />
        );

        fireEvent.change(screen.getByLabelText('Activity Name'), {
            target: { value: 'Scale Practice' },
        });
        fireEvent.change(screen.getByLabelText('Metric 1'), {
            target: { value: 'metric-fractal-1' },
        });

        fireEvent.click(screen.getByRole('button', { name: 'Create Activity' }));

        await waitFor(() => {
            expect(mockCreateActivity).toHaveBeenCalledWith('root-1', expect.objectContaining({
                metrics: [
                    expect.objectContaining({
                        fractal_metric_id: 'metric-fractal-1',
                        name: 'Speed',
                        unit: 'bpm',
                    }),
                ],
            }));
        });
    });

    it('warns before removing existing metrics and updates after confirmation', async () => {
        render(
            <ActivityBuilder
                isOpen={true}
                onClose={vi.fn()}
                editingActivity={{
                    id: 'activity-1',
                    name: 'Scale Practice',
                    description: '',
                    has_sets: false,
                    has_metrics: true,
                    metrics_multiplicative: false,
                    has_splits: false,
                    group_id: null,
                    associated_goal_ids: [],
                    metric_definitions: [
                        { id: 'metric-1', name: 'Speed', unit: 'bpm' },
                    ],
                    split_definitions: [],
                }}
                rootId="root-1"
                onSave={vi.fn()}
            />
        );

        // Uncheck "Enable Metrics" to remove all metrics
        fireEvent.click(screen.getByLabelText('Enable Metrics'));

        fireEvent.click(screen.getByRole('button', { name: 'Save Activity' }));

        expect(screen.getByText('Removing Metrics')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Save Anyway'));

        await waitFor(() => {
            expect(mockUpdateActivity).toHaveBeenCalledWith('root-1', 'activity-1', expect.objectContaining({
                has_metrics: false,
            }));
        });
    });

    it('does not warn when removing metrics from a copied activity definition', async () => {
        render(
            <ActivityBuilder
                isOpen={true}
                onClose={vi.fn()}
                editingActivity={{
                    name: 'Scale Practice (Copy)',
                    description: '',
                    has_sets: false,
                    has_metrics: true,
                    metrics_multiplicative: false,
                    has_splits: false,
                    group_id: null,
                    associated_goal_ids: [],
                    metric_definitions: [
                        { id: undefined, name: 'Speed', unit: 'bpm' },
                    ],
                    split_definitions: [],
                }}
                rootId="root-1"
                onSave={vi.fn()}
            />
        );

        // Uncheck "Enable Metrics" to remove all metrics
        fireEvent.click(screen.getByLabelText('Enable Metrics'));

        fireEvent.click(screen.getByRole('button', { name: 'Create Activity' }));

        await waitFor(() => {
            expect(mockCreateActivity).toHaveBeenCalledWith('root-1', expect.objectContaining({
                has_metrics: false,
            }));
        });

        expect(screen.queryByText('Removing Metrics')).not.toBeInTheDocument();
    });
});
