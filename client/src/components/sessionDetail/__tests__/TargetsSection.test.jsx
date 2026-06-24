import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import TargetsSection from '../TargetsSection';

vi.mock('../../../contexts/GoalsContext', () => ({
    useGoals: () => ({})
}));

vi.mock('../../../hooks/useGoalQueries', () => ({
    useFractalTree: () => ({ data: null })
}));

vi.mock('../../TargetCard', () => ({
    default: ({ isCompleted, onClick, target }) => (
        <button type="button" onClick={onClick}>
            {isCompleted ? 'card-complete' : 'card-incomplete'} {target?.id}
        </button>
    )
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
                        name: 'Immediate 1',
                        type: 'ImmediateGoal',
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

        expect(screen.getByText(/card-incomplete/)).toBeInTheDocument();
    });

    it('opens a target when its target card is clicked', () => {
        const onTargetClick = vi.fn();
        render(
            <TargetsSection
                rootId="root-1"
                hierarchy={[
                    {
                        id: 'goal-1',
                        name: 'Immediate 1',
                        type: 'ImmediateGoal',
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
                onTargetClick={onTargetClick}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /card-incomplete target-1/ }));
        expect(onTargetClick).toHaveBeenCalledWith(expect.objectContaining({
            id: 'target-1',
            _goalId: 'goal-1',
        }));
    });
});
