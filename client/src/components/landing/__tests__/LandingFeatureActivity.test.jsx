import React from 'react';
import { render, screen } from '@testing-library/react';

import LandingFeatureActivity from '../LandingFeatureActivity';

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#4f9cf9',
        getGoalIcon: () => 'circle',
    }),
}));

vi.mock('../../goals/GoalHierarchySelector', () => ({
    default: () => <div data-testid="goal-hierarchy-selector" />,
}));

describe('LandingFeatureActivity', () => {
    it('renders one admin-selected spotlight without visitor activity navigation', () => {
        render(
            <LandingFeatureActivity
                example={{
                    tree: {
                        id: 'goal-1',
                        name: 'Root',
                        type: 'UltimateGoal',
                        attributes: { associated_activity_ids: ['activity-1'] },
                        children: [],
                    },
                    activityDefinitions: [],
                    sessions: [],
                }}
                activity={{
                    id: 'activity-1',
                    name: 'Bodyweight Rows',
                    associated_goal_ids: ['goal-1'],
                    metric_definitions: [],
                }}
                activeView="builder"
                onViewChange={vi.fn()}
            />
        );

        expect(screen.getByLabelText('Activity Name')).toHaveValue('Bodyweight Rows');
        expect(screen.queryByLabelText('Example activity')).not.toBeInTheDocument();
    });
});
