import React from 'react';
import { render, screen } from '@testing-library/react';
import TargetCard from '../TargetCard';

vi.mock('../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getLevelByName: () => ({ icon: 'circle' }),
        getGoalColor: () => '#22d3ee',
        getGoalSecondaryColor: () => '#0f766e',
        getGoalIcon: () => 'circle',
        getCompletionColor: () => '#4caf50',
    })
}));

vi.mock('../atoms/GoalIcon', () => ({
    default: () => <span>icon</span>
}));

describe('TargetCard', () => {
    it('shows completed state when target is completed', () => {
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
                goalType="MicroGoal"
            />
        );

        expect(screen.getByText('Complete')).toBeInTheDocument();
        expect(screen.getByText('10 %')).toBeInTheDocument();
    });
});
