import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import LandingFeaturesSection from '../LandingFeaturesSection';

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    GoalLevelsProvider: ({ children }) => <>{children}</>,
}));

vi.mock('../LandingFeatureSession', () => ({
    default: () => <div data-testid="session-stage" />,
}));

vi.mock('../LandingFeatureActivity', () => ({
    default: ({ activeView, onViewChange }) => (
        <div>
            <div data-testid="activity-view">{activeView}</div>
            <button type="button" onClick={() => onViewChange('timeline')}>Viewport timeline</button>
        </div>
    ),
}));

vi.mock('../LandingFeaturePrograms', () => ({
    default: () => <div data-testid="programs-stage" />,
}));

vi.mock('../LandingFeatureAnalytics', () => ({
    default: () => <div data-testid="analytics-stage" />,
}));

const example = {
    showcase: { activity_ids: ['activity-1'] },
    tree: {
        id: 'goal-1',
        name: 'Root goal',
        type: 'UltimateGoal',
        children: [],
        attributes: { associated_activity_ids: ['activity-1'] },
    },
    activityDefinitions: [{
        id: 'activity-1',
        name: 'Practice activity',
        associated_goal_ids: ['goal-1'],
        metric_definitions: [{ id: 'metric-1', name: 'Reps', unit: 'reps' }],
    }],
    sessions: [],
    programs: [],
    analyticsViews: [],
};

describe('LandingFeaturesSection', () => {
    it('syncs activity sidebar cards with the activity viewport tabs', async () => {
        render(<LandingFeaturesSection example={example} />);

        fireEvent.click(screen.getByRole('tab', { name: 'Activities' }));

        expect(await screen.findByTestId('activity-view')).toHaveTextContent('catalogue');

        fireEvent.click(screen.getByRole('button', { name: /Activity builder/i }));

        expect(screen.getByTestId('activity-view')).toHaveTextContent('builder');

        fireEvent.click(screen.getByRole('button', { name: /Metrics builder/i }));

        expect(screen.getByTestId('activity-view')).toHaveTextContent('metrics');

        fireEvent.click(screen.getByRole('button', { name: 'Viewport timeline' }));

        expect(screen.getByTestId('activity-view')).toHaveTextContent('timeline');
        expect(screen.getByRole('button', { name: /Progress timeline/i })).toHaveAttribute('aria-pressed', 'true');
    });
});
