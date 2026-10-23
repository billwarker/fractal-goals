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
    conditionProgressByGoalId: {},
    createGoal: vi.fn(),
    refreshSession: vi.fn(),
    sessionGoalsView: null,
};

const apiMock = vi.hoisted(() => ({
    getGoals: vi.fn(),
    getProgram: vi.fn(),
}));

vi.mock('../../../contexts/ActiveSessionContext', () => ({
    useActiveSessionData: () => activeSessionMock,
    useActiveSessionActions: () => ({
        createGoal: activeSessionMock.createGoal,
        updateSession: activeSessionMock.updateSession,
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
        ...apiMock,
        getGoalsForSelection: vi.fn(() => Promise.resolve({ data: [] })),
        getActivityGoals: vi.fn(() => Promise.resolve({ data: [] })),
        setActivityGoals: vi.fn(() => Promise.resolve({ data: [] })),
    }
}));

vi.mock('../../ConnectedGoalDetailModal', () => ({
    default: ({ parentGoal, onCreate, initialCompletion, initialActivities }) => (
        <div role="dialog" aria-label="Create goal">
            <span>{`parent:${parentGoal?.id}`}</span>
            <span>{`condition:${initialCompletion?.completionCondition || 'none'}`}</span>
            <span>{`activities:${(initialActivities || []).map((activity) => activity.id).join(',')}`}</span>
            <button type="button" onClick={() => onCreate({ name: 'New child', parent_id: parentGoal.id })}>create</button>
        </div>
    ),
}));

function withPullUpCondition() {
    const stg = activeSessionMock.sessionGoalsView.goal_tree.children[0];
    activeSessionMock = {
        ...activeSessionMock,
        conditionProgressByGoalId: { 'ig-1': { met: false, current: 4, required: 10 } },
        sessionGoalsView: {
            ...activeSessionMock.sessionGoalsView,
            goal_tree: {
                ...activeSessionMock.sessionGoalsView.goal_tree,
                children: [{
                    ...stg,
                    children: [{
                        ...stg.children[0],
                        name: 'Pull Up Volume',
                        completion_condition: 'activity_threshold',
                        condition: { activity_definition_id: 'activity-1', kind: 'consistency', required_count: 10, rules: [] },
                    }],
                }],
            },
        },
    };
}

describe('SessionGoalHierarchyPanel smoke', () => {
    beforeEach(() => {
        apiMock.getGoals.mockResolvedValue({ data: null });
        apiMock.getProgram.mockResolvedValue({ data: null });
        activeSessionMock = {
            rootId: 'root-1',
            sessionId: 'session-1',
            session: { session_goals: [{ id: 'ig-1' }] },
            localSessionData: { sections: [{ activity_ids: ['instance-1'] }] },
            activityInstances: [{ id: 'instance-1', activity_definition_id: 'activity-1' }],
            activities: [{ id: 'activity-1', name: 'Pull Up', associated_goal_ids: ['ig-1'] }],
            activityGroups: [{ id: 'group-1', name: 'Technique', parent_id: null }],
            conditionProgressByGoalId: {},
            createGoal: vi.fn(),
            updateSession: vi.fn(() => Promise.resolve()),
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

    it('defaults the adjustment modal to the session program scope and hides completed goals', async () => {
        activeSessionMock = {
            ...activeSessionMock,
            session: {
                ...activeSessionMock.session,
                program_info: { program_id: 'program-1', program_name: 'Strength' },
            },
        };
        apiMock.getGoals.mockResolvedValue({
            data: {
                id: 'root-1', name: 'Root', type: 'UltimateGoal', children: [
                    { id: 'program-goal', name: 'Program Goal', type: 'LongTermGoal', children: [] },
                    { id: 'completed-program-goal', name: 'Completed Program Goal', type: 'LongTermGoal', completed: true, children: [] },
                    { id: 'off-program-goal', name: 'Off Program Goal', type: 'LongTermGoal', children: [] },
                ],
            },
        });
        apiMock.getProgram.mockResolvedValue({
            data: { id: 'program-1', name: 'Strength', scope_goal_ids: ['program-goal', 'completed-program-goal'] },
        });

        renderWithProviders(
            <SessionGoalHierarchyPanel selectedActivity={null} onGoalClick={vi.fn()} />,
            { withTimezone: false, withAuth: false, withGoalLevels: false, withTheme: false }
        );

        fireEvent.click(await screen.findByRole('button', { name: 'Adjust scope' }));

        const scopeControl = await screen.findByLabelText('Scope to Strength');
        const completedControl = screen.getByLabelText('Hide completed goals');
        expect(scopeControl).toBeChecked();
        expect(completedControl).toBeChecked();
        expect(await screen.findByText('Program Goal')).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.queryByText('Completed Program Goal')).not.toBeInTheDocument();
            expect(screen.queryByText('Off Program Goal')).not.toBeInTheDocument();
        });

        fireEvent.click(scopeControl);
        fireEvent.click(completedControl);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        fireEvent.click(screen.getByRole('button', { name: 'Adjust scope' }));

        expect(screen.getByLabelText('Scope to Strength')).toBeChecked();
        expect(screen.getByLabelText('Hide completed goals')).toBeChecked();
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
        withPullUpCondition();
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
        // Thresholds show as progress in the Progress pane, not as cards here.
        expect(screen.queryByText(/Goal thresholds/)).not.toBeInTheDocument();
        expect(screen.queryByText('Pull Up: 10 sessions')).not.toBeInTheDocument();
        expect(screen.getByText('STG')).toBeInTheDocument();
        expect(screen.getAllByText('Pull Up Volume')).toHaveLength(1);
        expect(screen.queryByRole('button', { name: 'Activity' })).not.toBeInTheDocument();
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

    it('uses the goal icon as an accessible independent scope toggle', async () => {
        const onGoalClick = vi.fn();
        const onGoalScopeToggle = vi.fn();
        renderWithProviders(
            <SessionGoalHierarchyPanel
                selectedActivity={null}
                onGoalClick={onGoalClick}
                onGoalScopeToggle={onGoalScopeToggle}
                activityGoalScope={{ goal: { id: 'ig-1', name: 'IG' }, activityIds: [] }}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false
            }
        );

        const scopeButton = await screen.findByRole('button', { name: 'Clear activity scope for IG' });
        expect(scopeButton).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(scopeButton);
        expect(onGoalScopeToggle).toHaveBeenCalledWith(expect.objectContaining({
            id: 'ig-1',
            scopePresentation: {
                icon: 'circle',
                color: '#00aa00',
                secondaryColor: '#005500',
            },
        }));
        expect(onGoalClick).not.toHaveBeenCalled();

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
