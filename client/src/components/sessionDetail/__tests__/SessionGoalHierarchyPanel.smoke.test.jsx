import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import SessionGoalHierarchyPanel from '../SessionGoalHierarchyPanel';

let activeSessionMock = {
    rootId: 'root-1',
    sessionId: 'session-1',
    session: { session_goals: [] },
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
    default: ({ scopedActivityName, onTargetClick }) => (
        <button
            type="button"
            onClick={() => onTargetClick?.({
                id: 'target-1',
                name: 'Target 1',
                activity_id: 'activity-1',
                _goalId: 'ig-1',
                _goalType: 'ImmediateGoal',
                metrics: [],
            })}
        >
            {scopedActivityName ? `Targets: ${scopedActivityName}` : 'Targets'}
        </button>
    ),
}));
vi.mock('../GoalRow', () => ({ default: () => <div /> }));
vi.mock('../../goalDetail/TargetAnalyticsModal', () => ({
    default: ({ target, analyticsData, readOnly, portalTarget, overlayClassName }) => (
        <div
            data-testid="target-analytics-modal"
            data-instance-count={analyticsData?.instances?.length || 0}
            data-read-only={String(Boolean(readOnly))}
            data-portal-target={portalTarget?.id || ''}
            data-overlay-class={overlayClassName || ''}
        >
            {target.name}
        </div>
    ),
}));

describe('SessionGoalHierarchyPanel smoke', () => {
    beforeEach(() => {
        activeSessionMock = {
            rootId: 'root-1',
            sessionId: 'session-1',
            session: { session_goals: [{ id: 'ig-1' }] },
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

    it('shows the full session hierarchy when an activity is selected', async () => {
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

    it('opens the target manager modal from a session target card', async () => {
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

        fireEvent.click(await screen.findByRole('button', { name: 'Targets: Pull Up' }));
        expect(await screen.findByTestId('target-analytics-modal')).toHaveTextContent('Target 1');
    });

    it('uses a scoped read-only modal host and supplied landing analytics', async () => {
        const portalTarget = document.createElement('div');
        portalTarget.id = 'landing-session-example';
        const analyticsData = { instances: [{ id: 'history-1' }, { id: 'history-2' }] };
        const resolveAnalyticsData = vi.fn(() => analyticsData);

        renderWithProviders(
            <SessionGoalHierarchyPanel
                selectedActivity={{
                    id: 'instance-1',
                    activity_definition_id: 'activity-1',
                    name: 'Pull Up'
                }}
                targetModal={{
                    readOnly: true,
                    portalTarget,
                    overlayClassName: 'scoped-overlay',
                    resolveAnalyticsData,
                }}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false
            }
        );

        fireEvent.click(await screen.findByRole('button', { name: 'Targets: Pull Up' }));

        const modal = await screen.findByTestId('target-analytics-modal');
        expect(resolveAnalyticsData).toHaveBeenCalledWith(expect.objectContaining({ id: 'target-1' }));
        expect(modal).toHaveAttribute('data-instance-count', '2');
        expect(modal).toHaveAttribute('data-read-only', 'true');
        expect(modal).toHaveAttribute('data-portal-target', 'landing-session-example');
        expect(modal).toHaveAttribute('data-overlay-class', 'scoped-overlay');
    });

    it('opens read-only hierarchy goals without offering sub-goal creation', async () => {
        const onGoalClick = vi.fn();
        renderWithProviders(
            <SessionGoalHierarchyPanel
                selectedActivity={null}
                onGoalClick={onGoalClick}
                readOnly
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false
            }
        );

        expect(await screen.findByText('IG')).toBeInTheDocument();
        expect(screen.queryByTitle('Add Sub-goal')).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('IG'));
        expect(onGoalClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'ig-1' }));
    });

    it('keeps the session hierarchy visible when focused activity has no eligible goals', async () => {
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
        expect(screen.queryByText('No goals associated with this session.')).not.toBeInTheDocument();
        expect(screen.getByText('STG')).toBeInTheDocument();
        expect(screen.getByText('IG')).toBeInTheDocument();
    });
});
