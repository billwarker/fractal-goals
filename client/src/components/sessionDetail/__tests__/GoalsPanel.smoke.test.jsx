import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import GoalsPanel from '../GoalsPanel';

vi.mock('../../../contexts/ActiveSessionContext', () => ({
    useActiveSession: () => ({
        rootId: 'root-1',
        sessionId: 'session-1',
        session: { immediate_goals: [] },
        localSessionData: { sections: [] },
        activityInstances: [],
        activities: [],
        targetAchievements: new Map(),
        achievedTargetIds: new Set(),
        updateGoal: vi.fn(),
        createGoal: vi.fn(),
        refreshSession: vi.fn(),
        microGoals: []
    })
}));

vi.mock('../../../contexts/ThemeContext', () => ({
    useTheme: () => ({
        getGoalColor: () => '#00aa00',
        getGoalSecondaryColor: () => '#005500',
        getScopedCharacteristics: () => ({ icon: 'circle' })
    })
}));

vi.mock('../../../contexts/GoalsContext', () => ({
    useGoals: () => ({
        useFractalTreeQuery: () => ({
            data: { id: 'root-1', type: 'UltimateGoal', children: [] },
            isLoading: false
        }),
        fetchFractalTree: vi.fn()
    })
}));

vi.mock('../../../utils/api', () => ({
    fractalApi: {
        getGoalsForSelection: vi.fn(() => Promise.resolve({ data: [] })),
        getActivityGoals: vi.fn(() => Promise.resolve({ data: [] }))
    }
}));

vi.mock('../HierarchySection', () => ({ default: () => <div>Hierarchy</div> }));
vi.mock('../TargetsSection', () => ({ default: () => <div>Targets</div> }));
vi.mock('../SessionFocusSection', () => ({ default: () => <div /> }));
vi.mock('../GoalRow', () => ({ default: () => <div /> }));

describe('GoalsPanel smoke', () => {
    it('renders without runtime reference errors', async () => {
        render(
            <GoalsPanel
                selectedActivity={null}
                onGoalClick={vi.fn()}
                onGoalCreated={vi.fn()}
                onOpenGoals={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Session')).toBeInTheDocument();
        });
    });
});
