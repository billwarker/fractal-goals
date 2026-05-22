import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import SessionGoalHierarchyPanel from '../SessionGoalHierarchyPanel';

let activeSessionMock = {
    rootId: 'root-1',
    sessionId: 'session-1',
    session: { immediate_goals: [] },
    activities: [],
    activityGroups: [],
    targetAchievements: new Map(),
    achievedTargetIds: new Set(),
    createGoal: vi.fn(),
    refreshSession: vi.fn(),
    sessionGoalsView: null,
};

vi.mock('../../../contexts/ActiveSessionContext', () => ({
    useActiveSessionData: () => activeSessionMock,
    useActiveSessionActions: () => ({
        createGoal: activeSessionMock.createGoal,
    }),
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

vi.mock('../TargetsSection', () => ({
    default: ({ scopedActivityName }) => (
        <div>{scopedActivityName ? `Targets: ${scopedActivityName}` : 'Targets'}</div>
    ),
}));
vi.mock('../GoalRow', () => ({ default: () => <div /> }));

describe('SessionGoalHierarchyPanel smoke', () => {
    beforeEach(() => {
        activeSessionMock = {
            rootId: 'root-1',
            sessionId: 'session-1',
            session: { immediate_goals: [{ id: 'ig-1' }] },
            localSessionData: { sections: [{ activity_ids: ['instance-1'] }] },
            activityInstances: [{ id: 'instance-1', activity_definition_id: 'activity-1' }],
            activities: [{ id: 'activity-1', name: 'Pull Up', associated_goal_ids: ['ig-1'] }],
            activityGroups: [{ id: 'group-1', name: 'Technique', parent_id: null }],
            targetAchievements: new Map(),
            achievedTargetIds: new Set(),
            createGoal: vi.fn(),
            refreshSession: vi.fn(),
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
            }
        };
    });

    it('renders without runtime reference errors', async () => {
        renderWithProviders(
            <SessionGoalHierarchyPanel
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
            expect(screen.getByText('Session Goals')).toBeInTheDocument();
        });
        expect(screen.queryByText('Session Focus')).not.toBeInTheDocument();
    });

    it('shows the focused activity hierarchy when an activity is selected', async () => {
        renderWithProviders(
            <SessionGoalHierarchyPanel
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
            expect(screen.getByText('Goals: Pull Up')).toBeInTheDocument();
        });
        expect(screen.queryByText('Session Goals')).not.toBeInTheDocument();
        expect(screen.getByText('Targets: Pull Up')).toBeInTheDocument();
        expect(screen.getByText('STG')).toBeInTheDocument();
        expect(screen.getByText('IG')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Activity' })).not.toBeInTheDocument();
    });

    it('does not fall back to session hierarchy when focused activity has no eligible goals', async () => {
        activeSessionMock = {
            ...activeSessionMock,
            activityInstances: [
                { id: 'instance-1', activity_definition_id: 'activity-1' },
                { id: 'instance-2', activity_definition_id: 'activity-2' },
            ],
            activities: [
                { id: 'activity-1', name: 'Learning the Intro', associated_goal_ids: ['ig-1'] },
                { id: 'activity-2', name: 'Jamming', associated_goal_ids: [] },
            ],
            sessionGoalsView: {
                ...activeSessionMock.sessionGoalsView,
                activity_goal_ids_by_activity: {
                    'activity-1': ['ig-1'],
                    'activity-2': [],
                },
                session_activity_ids: ['activity-1', 'activity-2'],
            },
        };

        renderWithProviders(
            <SessionGoalHierarchyPanel
                selectedActivity={{
                    id: 'instance-2',
                    activity_definition_id: 'activity-2',
                    name: 'Jamming'
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
            expect(screen.getByText('Goals: Jamming')).toBeInTheDocument();
        });
        expect(screen.getByText('No outstanding goals associated with this activity.')).toBeInTheDocument();
        expect(screen.queryByText('STG')).not.toBeInTheDocument();
        expect(screen.queryByText('IG')).not.toBeInTheDocument();
    });
});
