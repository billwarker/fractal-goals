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

describe('SessionGoalHierarchyPanel goal creation', () => {
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

    it('offers "+" on the scoped goal only, and a goal created there joins the session goals', async () => {
        activeSessionMock.createGoal.mockResolvedValue({ id: 'new-goal', name: 'New child' });
        const renderPanel = (scopedId) => renderWithProviders(
            <SessionGoalHierarchyPanel
                selectedActivity={null}
                onGoalClick={vi.fn()}
                onGoalScopeToggle={vi.fn()}
                activityGoalScope={scopedId ? { goal: { id: scopedId }, activityIds: [] } : null}
            />,
            { withTimezone: false, withAuth: false, withGoalLevels: false, withTheme: false }
        );
        const { unmount } = renderPanel(null);
        expect(await screen.findByText('STG')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Add a child goal/ })).not.toBeInTheDocument();
        unmount();

        renderPanel('stg-1');
        fireEvent.click(await screen.findByRole('button', { name: 'Add a child goal under STG' }));
        expect(await screen.findByText('parent:stg-1')).toBeInTheDocument();
        expect(screen.getByText('condition:none')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'create' }));

        await waitFor(() => expect(activeSessionMock.updateSession).toHaveBeenCalledWith({
            goal_ids: expect.arrayContaining(['new-goal']),
        }));
        expect(activeSessionMock.createGoal).toHaveBeenCalledWith({ name: 'New child', parent_id: 'stg-1' });
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create goal' })).not.toBeInTheDocument());
    });

    it('creates a goal toward the selected activity without changing the session goals', async () => {
        activeSessionMock = {
            ...activeSessionMock,
            activities: [{
                id: 'activity-1',
                name: 'Pull Up',
                associated_goal_ids: ['ig-1'],
                metric_definitions: [{ id: 'reps', name: 'Reps' }],
            }],
        };
        activeSessionMock.createGoal.mockResolvedValue({ id: 'new-goal', name: 'New child' });
        renderWithProviders(
            <SessionGoalHierarchyPanel
                selectedActivity={{ id: 'instance-1', activity_definition_id: 'activity-1', name: 'Pull Up' }}
                onGoalClick={vi.fn()}
                onGoalScopeToggle={vi.fn()}
                activityGoalScope={{ goal: { id: 'stg-1' }, activityIds: [] }}
            />,
            { withTimezone: false, withAuth: false, withGoalLevels: false, withTheme: false }
        );

        fireEvent.click(await screen.findByRole('button', { name: 'Add a child goal under STG' }));
        expect(await screen.findByText('condition:activity_threshold')).toBeInTheDocument();
        expect(screen.getByText('activities:activity-1')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'create' }));

        await waitFor(() => expect(activeSessionMock.createGoal).toHaveBeenCalledWith({
            name: 'New child', parent_id: 'stg-1', activity_definition_id: 'activity-1',
        }));
        expect(activeSessionMock.updateSession).not.toHaveBeenCalled();
    });

    it('never offers "+" on a scoped goal at the lowest level', async () => {
        renderWithProviders(
            <SessionGoalHierarchyPanel
                selectedActivity={null}
                onGoalClick={vi.fn()}
                onGoalScopeToggle={vi.fn()}
                activityGoalScope={{ goal: { id: 'ig-1' }, activityIds: [] }}
            />,
            { withTimezone: false, withAuth: false, withGoalLevels: false, withTheme: false }
        );
        expect(await screen.findByRole('button', { name: 'Clear activity scope for IG' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Add a child goal/ })).not.toBeInTheDocument();
    });
});
