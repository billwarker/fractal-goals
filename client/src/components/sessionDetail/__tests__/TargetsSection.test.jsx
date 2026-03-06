import React from 'react';
import { render, screen } from '@testing-library/react';
import TargetsSection from '../TargetsSection';

vi.mock('../../../contexts/GoalsContext', () => ({
    useGoals: () => ({
        useFractalTreeQuery: () => ({ data: null })
    })
}));

vi.mock('../../TargetCard', () => ({
    default: ({ isCompleted }) => <div>{isCompleted ? 'card-complete' : 'card-incomplete'}</div>
}));

describe('TargetsSection', () => {
    it('does not mark target complete from owning goal completion alone', () => {
        render(
            <TargetsSection
                rootId="root-1"
                sessionId="session-1"
                hierarchy={[
                    {
                        id: 'goal-1',
                        name: 'Micro 1',
                        type: 'MicroGoal',
                        completed: true,
                        attributes: {
                            targets: [
                                {
                                    id: 'target-1',
                                    activity_id: 'activity-1',
                                    type: 'threshold',
                                    metrics: [{ metric_id: 'm1', value: 10 }]
                                }
                            ]
                        }
                    }
                ]}
                activityDefinitions={[{ id: 'activity-1', name: 'Performance', metric_definitions: [{ id: 'm1', name: 'Quality', unit: '%' }] }]}
                targetAchievements={new Map()}
                achievedTargetIds={new Set()}
            />
        );

        expect(screen.getByText('card-incomplete')).toBeInTheDocument();
    });
});
