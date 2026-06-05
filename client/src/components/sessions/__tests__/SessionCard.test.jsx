import React from 'react';
import { renderWithProviders, screen } from '../../../test/test-utils';
import SessionCard from '../SessionCard';

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#123456',
        getGoalTextColor: () => '#ffffff',
    }),
}));

describe('SessionCard', () => {
    it('renders attached goal chips from canonical session_goals', () => {
        renderWithProviders(
            <SessionCard
                rootId="root-1"
                session={{
                    id: 'session-1',
                    name: 'Practice',
                    session_start: '2026-03-12T15:04:00Z',
                    total_duration_seconds: 120,
                    session_goals: [
                        { id: 'goal-1', name: 'All Level Goal', type: 'MidTermGoal' },
                    ],
                    attributes: { completed: false },
                }}
            />,
            {
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
                withTimezone: false,
            }
        );

        expect(screen.getByText('All Level Goal')).toBeInTheDocument();
    });
});
