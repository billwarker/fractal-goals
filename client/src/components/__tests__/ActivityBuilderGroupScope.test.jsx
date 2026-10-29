import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ActivityBuilder from '../ActivityBuilder';

const mockCreateActivity = vi.hoisted(() => vi.fn());
const mockUpdateActivity = vi.hoisted(() => vi.fn());
const groups = [
    { id: 'group-songs', name: 'Songs', parent_id: null, sort_order: 0 },
    { id: 'group-scales', name: 'Scales', parent_id: null, sort_order: 1 },
];

vi.mock('../../contexts/ActivitiesContext', () => ({
    useActivities: () => ({ createActivity: mockCreateActivity, updateActivity: mockUpdateActivity }),
}));
vi.mock('../../hooks/useActivityQueries', () => ({
    useActivityGroups: () => ({ activityGroups: groups }),
    useFractalMetrics: () => ({ fractalMetrics: [], isLoading: false, error: null }),
    useCreateFractalMetric: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('../../hooks/useGoalQueries', () => ({
    useFractalTree: () => ({
        data: { id: 'root-1', name: 'Root', type: 'UltimateGoal', children: [
            { id: 'goal-1', name: 'Head Over Heels', type: 'ImmediateGoal', children: [] },
        ] },
    }),
}));
vi.mock('../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({ getGoalColor: () => '#22d3ee', getGoalIcon: () => 'circle' }),
}));

const scopedGroup = { id: 'group-songs', goalName: 'Head Over Heels' };
const renderBuilder = (props) => render(
    <ActivityBuilder isOpen onClose={vi.fn()} rootId="root-1" onSave={vi.fn()} initialSelectedGoalIds={['goal-1']} {...props} />,
);
const groupSelect = () => screen.getByLabelText('Activity Group');
const submitCreate = (name = 'Intro melody') => {
    fireEvent.change(screen.getByLabelText('Activity Name'), { target: { value: name } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Activity' }));
};

describe('ActivityBuilder scoped activity group', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCreateActivity.mockResolvedValue({ id: 'activity-1', name: 'Intro melody' });
    });

    it("prefills a blank create with the scoped goal's group and says where it came from", async () => {
        renderBuilder({ editingActivity: null, initialGroup: scopedGroup });
        expect(groupSelect()).toHaveValue('group-songs');
        expect(screen.getByText("From Head Over Heels's activity group")).toBeInTheDocument();
        submitCreate();
        await waitFor(() => expect(mockCreateActivity).toHaveBeenCalledWith('root-1', expect.objectContaining({
            group_id: 'group-songs', goal_ids: ['goal-1'],
        })));
    });

    it('drops the hint once the user picks another group, and keeps their choice', async () => {
        renderBuilder({ editingActivity: null, initialGroup: scopedGroup });
        fireEvent.change(groupSelect(), { target: { value: 'group-scales' } });
        expect(screen.queryByText("From Head Over Heels's activity group")).not.toBeInTheDocument();
        submitCreate();
        await waitFor(() => expect(mockCreateActivity).toHaveBeenCalledWith('root-1', expect.objectContaining({
            group_id: 'group-scales',
        })));
    });

    it('falls back to no group when the scoped group no longer exists', async () => {
        renderBuilder({ editingActivity: null, initialGroup: { id: 'group-gone', goalName: 'Head Over Heels' } });
        expect(groupSelect()).toHaveValue('');
        expect(screen.queryByText(/activity group$/)).not.toBeInTheDocument();
        submitCreate();
        await waitFor(() => expect(mockCreateActivity).toHaveBeenCalledWith('root-1', expect.objectContaining({
            group_id: null,
        })));
    });

    it('keeps a copied definition in its own group', () => {
        renderBuilder({
            editingActivity: { _builderKey: 'copy', name: 'Copy of Scales', group_id: 'group-scales' },
            initialGroup: scopedGroup,
        });
        expect(groupSelect()).toHaveValue('group-scales');
        expect(screen.queryByText("From Head Over Heels's activity group")).not.toBeInTheDocument();
    });

    it('uses the scoped group for an id-less draft without a group', () => {
        renderBuilder({ editingActivity: { _builderKey: 'draft', name: 'Riff', group_id: null }, initialGroup: scopedGroup });
        expect(groupSelect()).toHaveValue('group-songs');
    });

    it('never applies the scoped group when editing an existing definition', () => {
        renderBuilder({
            editingActivity: { id: 'existing', name: 'Practice', group_id: null, metric_definitions: [] },
            initialGroup: scopedGroup,
        });
        expect(groupSelect()).toHaveValue('');
    });
});
