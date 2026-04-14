import React from 'react';
import { render, screen } from '@testing-library/react';
import TargetCard from '../TargetCard';

vi.mock('../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getLevelByName: () => ({ icon: 'circle' }),
        getGoalColor: (type) => (type === 'Completed' ? '#4caf50' : '#22d3ee'),
        getGoalSecondaryColor: (type) => (type === 'Completed' ? '#2e7d32' : '#0f766e'),
        getGoalIcon: () => 'circle',
    })
}));

vi.mock('../atoms/GoalIcon', () => ({
    default: () => <span>icon</span>
}));

describe('TargetCard', () => {
    it('shows completed styling without a completion pill when target is completed', () => {
        render(
            <TargetCard
                target={{
                    id: 'target-1',
                    activity_id: 'activity-1',
                    type: 'threshold',
                    metrics: [{ metric_id: 'm1', value: 10 }]
                }}
                activityDefinitions={[{
                    id: 'activity-1',
                    name: 'Performance',
                    metric_definitions: [{ id: 'm1', name: 'Quality', unit: '%' }]
                }]}
                isCompleted={true}
                goalType="ImmediateGoal"
            />
        );

        expect(screen.getByText('10 %')).toBeInTheDocument();
        expect(screen.queryByText('Complete')).not.toBeInTheDocument();
    });

    it('hides missing-activity targets in view mode', () => {
        const { container } = render(
            <TargetCard
                target={{
                    id: 'target-missing',
                    activity_id: 'missing-activity',
                    type: 'threshold',
                    metrics: []
                }}
                activityDefinitions={[]}
                isCompleted={false}
                goalType="ImmediateGoal"
            />
        );

        expect(container.firstChild).toBeNull();
    });

    it('shows a deleted-activity fallback in edit mode', () => {
        render(
            <TargetCard
                target={{
                    id: 'target-missing',
                    activity_id: 'missing-activity',
                    type: 'threshold',
                    metrics: []
                }}
                activityDefinitions={[]}
                isCompleted={false}
                isEditMode={true}
                goalType="ImmediateGoal"
            />
        );

        expect(screen.getByText(/activity not found \(may have been deleted\)/i)).toBeInTheDocument();
    });
});
