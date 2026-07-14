import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ActivityBuilder from '../ActivityBuilder';
const {
    mockCreateActivity,
    mockUpdateActivity,
    mockUseFractalTree,
    mockUseFractalMetrics,
    mockCreateFractalMetric,
} = vi.hoisted(() => ({
    mockCreateActivity: vi.fn(),
    mockUpdateActivity: vi.fn(),
    mockUseFractalTree: vi.fn(),
    mockUseFractalMetrics: vi.fn(),
    mockCreateFractalMetric: vi.fn(),
}));

vi.mock('../../contexts/ActivitiesContext', () => ({
    useActivities: () => ({
        createActivity: mockCreateActivity,
        updateActivity: mockUpdateActivity,
    }),
}));

vi.mock('../../hooks/useActivityQueries', () => ({
    useActivityGroups: () => ({
        activityGroups: [{ id: 'group-1', name: 'Technique', associated_goal_ids: ['goal-1'] }],
        isLoading: false,
        error: null,
    }),
    useFractalMetrics: (...args) => mockUseFractalMetrics(...args),
    useCreateFractalMetric: () => ({ mutateAsync: mockCreateFractalMetric, isPending: false }),
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

vi.mock('../modals/GroupBuilderModal', () => ({
    default: ({ isOpen, onSave }) => (
        isOpen ? (
            <button
                type="button"
                onClick={() => onSave({
                    id: 'group-created',
                    name: 'New Group',
                    associated_goal_ids: ['goal-1'],
                })}
            >
                finish creating group
            </button>
        ) : null
    ),
}));

describe('ActivityBuilder', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCreateActivity.mockResolvedValue({ id: 'activity-1', name: 'Scale Practice' });
        mockUpdateActivity.mockResolvedValue({ id: 'activity-1', name: 'Scale Practice' });
        mockCreateFractalMetric.mockResolvedValue({
            data: {
                id: 'metric-created',
                name: 'Errors',
                unit: 'count',
                is_multiplicative: false,
                is_additive: false,
                higher_is_better: false,
            },
        });
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

    it('updates the modal header from the activity name and renders group before goals', () => {
        render(
            <ActivityBuilder
                isOpen={true}
                onClose={vi.fn()}
                editingActivity={null}
                rootId="root-1"
                onSave={vi.fn()}
            />
        );
        expect(screen.getByRole('heading', { name: 'Create Activity' })).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Activity Name'), {
            target: { value: 'Scale Practice' },
        });
        expect(screen.getByRole('heading', { name: 'Create Activity: Scale Practice' })).toBeInTheDocument();
        const groupField = screen.getByLabelText('Activity Group');
        const goalsField = screen.getByText('Associated Goals (0)');
        expect(groupField.compareDocumentPosition(goalsField) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('merges linked goals when a group is selected', async () => {
        render(
            <ActivityBuilder
                isOpen={true}
                onClose={vi.fn()}
                editingActivity={null}
                rootId="root-1"
                onSave={vi.fn()}
            />
        );
        fireEvent.change(screen.getByLabelText('Activity Name'), { target: { value: 'Practice' } });
        fireEvent.change(screen.getByLabelText('Activity Group'), { target: { value: 'group-1' } });
        expect(screen.getByText('Associated Goals (1)')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Create Activity' }));
        await waitFor(() => {
            expect(mockCreateActivity).toHaveBeenCalledWith('root-1', expect.objectContaining({
                group_id: 'group-1',
                goal_ids: ['goal-1'],
            }));
        });
    });

    it('opens the canonical group creator, selects its result, and preserves the activity draft', async () => {
        render(
            <ActivityBuilder
                isOpen={true}
                onClose={vi.fn()}
                editingActivity={null}
                rootId="root-1"
                onSave={vi.fn()}
            />
        );

        fireEvent.change(screen.getByLabelText('Activity Name'), { target: { value: 'Practice' } });
        fireEvent.change(screen.getByLabelText('Activity Group'), { target: { value: '__create__' } });
        fireEvent.click(screen.getByRole('button', { name: 'finish creating group' }));
        expect(screen.getByLabelText('Activity Name')).toHaveValue('Practice');
        expect(screen.getByText('Associated Goals (1)')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Create Activity' }));
        await waitFor(() => {
            expect(mockCreateActivity).toHaveBeenCalledWith('root-1', expect.objectContaining({
                group_id: 'group-created',
                goal_ids: ['goal-1'],
            }));
        });
    });

    it('creates a reusable metric with additive, multiplicative, and direction settings', async () => {
        render(
            <ActivityBuilder
                isOpen={true}
                onClose={vi.fn()}
                editingActivity={null}
                rootId="root-1"
                onSave={vi.fn()}
            />
        );

        fireEvent.change(screen.getByLabelText('Metric 1'), { target: { value: '__create__' } });
        fireEvent.change(screen.getByLabelText('Metric name'), { target: { value: 'Errors' } });
        fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'count' } });
        fireEvent.click(screen.getByLabelText('Multiplicative'));
        fireEvent.click(screen.getByLabelText('Additive'));
        fireEvent.click(screen.getByLabelText('Higher is better'));
        fireEvent.click(screen.getByRole('button', { name: 'Create Metric' }));

        await waitFor(() => {
            expect(mockCreateFractalMetric).toHaveBeenCalledWith({
                name: 'Errors',
                unit: 'count',
                input_type: 'number',
                is_multiplicative: false,
                is_additive: false,
                higher_is_better: false,
            });
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
        fireEvent.click(screen.getByLabelText('Track Sets'));
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

    it('includes progress tracking settings in the saved metric payload', async () => {
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
        fireEvent.click(screen.getByLabelText('Track Sets'));
        fireEvent.change(screen.getByLabelText('Metric 1'), {
            target: { value: 'metric-fractal-1' },
        });
        // Uncheck Track Progress for the metric
        fireEvent.click(screen.getAllByLabelText('Track Progress')[1]);

        fireEvent.click(screen.getByRole('button', { name: 'Create Activity' }));

        await waitFor(() => {
            expect(mockCreateActivity).toHaveBeenCalledWith('root-1', expect.objectContaining({
                track_progress: true,
                metrics: [
                    expect.objectContaining({
                        track_progress: false,
                    }),
                ],
            }));
        });
    });

    it('preserves existing per-metric progress settings when editing an activity', async () => {
        render(
            <ActivityBuilder
                isOpen={true}
                onClose={vi.fn()}
                editingActivity={{
                    id: 'activity-1',
                    name: 'Scale Practice',
                    description: '',
                    has_sets: true,
                    has_metrics: true,
                    metrics_multiplicative: false,
                    has_splits: false,
                    group_id: null,
                    associated_goal_ids: [],
                    track_progress: true,
                    metric_definitions: [
                        {
                            id: 'metric-1',
                            fractal_metric_id: 'metric-fractal-1',
                            name: 'Speed',
                            unit: 'bpm',
                            is_best_set_metric: true,
                            track_progress: false,
                        },
                    ],
                    split_definitions: [],
                }}
                rootId="root-1"
                onSave={vi.fn()}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Save Activity' }));

        await waitFor(() => {
            expect(mockUpdateActivity).toHaveBeenCalledWith('root-1', 'activity-1', expect.objectContaining({
                track_progress: true,
                metrics: [
                    expect.objectContaining({
                        id: 'metric-1',
                        track_progress: false,
                        is_best_set_metric: true,
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
                    track_progress: false,
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
                track_progress: false,
            }));
        });

        expect(screen.queryByText('Removing Metrics')).not.toBeInTheDocument();
    });
});
