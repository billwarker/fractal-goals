import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import GoalsPanel from '../GoalsPanel';

let activeSessionMock = {
    rootId: 'root-1',
    sessionId: 'session-1',
    session: { immediate_goals: [] },
    activities: [],
    targetAchievements: new Map(),
    achievedTargetIds: new Set(),
    createGoal: vi.fn(),
    refreshSession: vi.fn(),
    microGoals: [],
    sessionGoalsView: null,
};

vi.mock('../../../contexts/ActiveSessionContext', () => ({
    useActiveSession: () => activeSessionMock
}));

vi.mock('../../../contexts/ThemeContext', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useTheme: () => ({
            getGoalColor: () => '#00aa00',
            getGoalSecondaryColor: () => '#005500',
            getScopedCharacteristics: () => ({ icon: 'circle' })
        })
    };
});

vi.mock('../../../contexts/GoalLevelsContext', async (importOriginal) => {
    const actual = await importOriginal();
    const level = {
        id: 'level-1',
        name: 'Fallback Goal',
        icon: 'circle',
        color: '#00aa00',
        secondary_color: '#005500'
    };
    return {
        ...actual,
        useGoalLevels: () => ({
            goalLevels: [],
            getGoalColor: () => '#00aa00',
            getGoalSecondaryColor: () => '#005500',
            getGoalIcon: () => 'circle',
            getLevelByName: () => level
        })
    };
});

vi.mock('../../../utils/api', () => ({
    fractalApi: {
        getGoalsForSelection: vi.fn(() => Promise.resolve({ data: [] })),
        getActivityGoals: vi.fn(() => Promise.resolve({ data: [] })),
        setActivityGoals: vi.fn(() => Promise.resolve({ data: [] })),
    }
}));

vi.mock('../TargetsSection', () => ({ default: () => <div>Targets</div> }));
vi.mock('../GoalRow', () => ({ default: () => <div /> }));

describe('GoalsPanel smoke', () => {
    beforeEach(() => {
        activeSessionMock = {
            rootId: 'root-1',
            sessionId: 'session-1',
            session: { immediate_goals: [{ id: 'ig-1' }] },
            localSessionData: { sections: [{ activity_ids: ['instance-1'] }] },
            activityInstances: [{ id: 'instance-1', activity_definition_id: 'activity-1' }],
            activities: [{ id: 'activity-1', name: 'Pull Up', associated_goal_ids: ['ig-1'] }],
            targetAchievements: new Map(),
            achievedTargetIds: new Set(),
            createGoal: vi.fn(),
            refreshSession: vi.fn(),
            microGoals: [
                {
                    id: 'micro-1',
                    name: 'Micro 1',
                    parent_id: 'ig-1',
                    activity_definition_id: 'activity-1',
                    completed: false,
                    children: [{ id: 'nano-1', name: 'Nano 1', completed: false }]
                }
            ],
            sessionGoalsView: {
                goal_tree: {
                    id: 'root-1',
                    type: 'UltimateGoal',
                    name: 'Root',
                    children: [
                        { id: 'stg-1', type: 'ShortTermGoal', name: 'STG', children: [{ id: 'ig-1', type: 'ImmediateGoal', name: 'IG', children: [] }] }
                    ]
                },
                session_goal_ids: ['ig-1'],
                activity_goal_ids_by_activity: { 'activity-1': ['ig-1'] },
                session_activity_ids: ['activity-1'],
                micro_goals: [
                    {
                        id: 'micro-1',
                        name: 'Micro 1',
                        parent_id: 'ig-1',
                        activity_definition_id: 'activity-1',
                        completed: false,
                        children: [{ id: 'nano-1', name: 'Nano 1', completed: false }]
                    }
                ]
            }
        };
    });

    it('renders without runtime reference errors', async () => {
        renderWithProviders(
            <GoalsPanel
                selectedActivity={null}
                onGoalClick={vi.fn()}
                onGoalCreated={vi.fn()}
                onOpenGoals={vi.fn()}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false
            }
        );

        await waitFor(() => {
            expect(screen.getByText('Session')).toBeInTheDocument();
        });
        expect(screen.queryByText('Session Focus')).not.toBeInTheDocument();
    });

    it('renders micro and nano goals in session hierarchy', async () => {
        renderWithProviders(
            <GoalsPanel
                selectedActivity={null}
                onGoalClick={vi.fn()}
                onGoalCreated={vi.fn()}
                onOpenGoals={vi.fn()}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false
            }
        );

        await waitFor(() => {
            expect(screen.getByText('Micro 1')).toBeInTheDocument();
            expect(screen.getByText('Nano 1')).toBeInTheDocument();
        });
    });

    it('renders nano children in activity mode even when micro has no activity_definition_id', async () => {
        activeSessionMock = {
            ...activeSessionMock,
            microGoals: [
                {
                    id: 'micro-legacy',
                    name: 'Legacy Micro',
                    parent_id: 'ig-1',
                    completed: false,
                    children: [{ id: 'nano-new', name: 'Nano New', completed: false }]
                }
            ],
            sessionGoalsView: {
                ...(activeSessionMock.sessionGoalsView || {}),
                micro_goals: [
                    {
                        id: 'micro-legacy',
                        name: 'Legacy Micro',
                        parent_id: 'ig-1',
                        completed: false,
                        children: [{ id: 'nano-new', name: 'Nano New', completed: false }]
                    }
                ]
            }
        };

        renderWithProviders(
            <GoalsPanel
                selectedActivity={{
                    id: 'instance-1',
                    activity_definition_id: 'activity-1',
                    name: 'Pull Up'
                }}
                onGoalClick={vi.fn()}
                onGoalCreated={vi.fn()}
                onOpenGoals={vi.fn()}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false
            }
        );

        await waitFor(() => {
            expect(screen.getByText('Legacy Micro')).toBeInTheDocument();
            expect(screen.getByText('Nano New')).toBeInTheDocument();
        });
    });

    it('defaults new activity contexts to activity mode without a sync effect', async () => {
        const view = renderWithProviders(
            <GoalsPanel
                selectedActivity={{
                    id: 'instance-1',
                    activity_definition_id: 'activity-1',
                    name: 'Pull Up'
                }}
                onGoalClick={vi.fn()}
                onGoalCreated={vi.fn()}
                onOpenGoals={vi.fn()}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false
            }
        );

        await waitFor(() => {
            expect(screen.getByText('Activity')).toBeInTheDocument();
        });
        expect(screen.getByText('Activity').className).toContain('activeToggleButton');

        fireEvent.click(screen.getByText('Session'));
        expect(screen.getByText('Session').className).toContain('activeToggleButton');

        view.unmount();

        renderWithProviders(
            <GoalsPanel
                selectedActivity={{
                    id: 'instance-2',
                    activity_definition_id: 'activity-1',
                    name: 'Pull Up Variation'
                }}
                onGoalClick={vi.fn()}
                onGoalCreated={vi.fn()}
                onOpenGoals={vi.fn()}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false
            }
        );

        expect(screen.getByText('Activity').className).toContain('activeToggleButton');
    });
});
