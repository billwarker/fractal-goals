import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import GoalDetailModal from '../GoalDetailModal';
import { GOAL_DETAIL_NAVIGATION_EVENT } from '../../utils/navigationEvents';

const { mockUseGoalForm, mockResetForm, mockNotify, mockGoalAssociations, mockGoalMetrics, mockGoalDurations } = vi.hoisted(() => ({
    mockUseGoalForm: vi.fn(),
    mockResetForm: vi.fn(),
    mockNotify: {
        success: vi.fn(),
        error: vi.fn(),
    },
    mockGoalAssociations: {
        activities: [],
        groups: [],
    },
    mockGoalMetrics: {
        metrics: null,
    },
    mockGoalDurations: {
        data: null,
        isSuccess: false,
    },
}));

vi.mock('@tanstack/react-query', () => ({
    useQuery: () => ({
        data: [],
        isLoading: false,
        error: null,
    }),
    useMutation: () => ({
        mutateAsync: vi.fn(() => Promise.resolve()),
    }),
    useQueryClient: () => ({
        invalidateQueries: vi.fn(),
    }),
}));

vi.mock('../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#22d3ee',
        getGoalSecondaryColor: () => '#0f172a',
        getGoalTextColor: () => '#0f172a',
        getGoalIcon: () => 'circle',
        getLevelByName: () => ({ icon: 'circle' }),
    }),
}));

vi.mock('../../hooks/useGoalForm', () => ({
    useGoalForm: (...args) => mockUseGoalForm(...args),
}));

vi.mock('../../hooks/useGoalQueries', () => ({
    useGoalAssociations: () => mockGoalAssociations,
    useGoalMetrics: () => mockGoalMetrics,
    useGoalDailyDurations: () => mockGoalDurations,
}));

vi.mock('../../hooks/useGoalNotes', () => ({
    useGoalNotes: () => ({
        notes: [],
        isLoading: false,
        error: null,
        createNote: vi.fn(() => Promise.resolve()),
        updateNote: vi.fn(() => Promise.resolve()),
        deleteNote: vi.fn(() => Promise.resolve()),
        pinNote: vi.fn(() => Promise.resolve()),
        unpinNote: vi.fn(() => Promise.resolve()),
    }),
}));

vi.mock('../../utils/api', () => ({
    fractalApi: {
        setGoalAssociationsBatch: vi.fn(() => Promise.resolve()),
        setActivityGoals: vi.fn(() => Promise.resolve()),
    },
}));

vi.mock('../../utils/notify', () => ({
    default: mockNotify,
}));

vi.mock('../goals/goalDetailUtils', () => ({
    getParentGoalInfo: () => null,
}));

vi.mock('../goals/goalDetailQueryUtils', () => ({
    invalidateGoalAssociationQueries: vi.fn(() => Promise.resolve()),
}));

vi.mock('../goals/GoalCompletionModal', () => ({
    default: () => <div>completion modal</div>,
}));

vi.mock('../goals/GoalUncompletionModal', () => ({
    default: () => <div>uncompletion modal</div>,
}));

vi.mock('../goals/GoalHeader', () => ({
    default: ({ name, onClose, goalStatus, headerTabs }) => (
        <div>
            <div>header:{name}:{goalStatus}</div>
            {headerTabs}
            <button onClick={onClose}>close modal</button>
        </div>
    ),
}));

vi.mock('../goals/GoalOptionsView', () => ({
    default: () => <div>goal options view</div>,
}));

vi.mock('../goals/GoalViewMode', () => ({
    default: ({ name, setIsEditing, setViewState }) => (
        <div>
            <div>view:{name}</div>
            <button onClick={() => setIsEditing(true)}>edit goal</button>
            <button onClick={() => setViewState('goal-options')}>open options</button>
            <button onClick={() => setViewState('goal-timeline')}>open timeline</button>
        </div>
    ),
}));

vi.mock('../goalDetail/GoalTimelineView', () => ({
    default: () => <div>goal timeline view</div>,
}));

vi.mock('../goalDetail/ActivityAssociator', async () => {
    const ReactModule = await vi.importActual('react');

    function MockActivityAssociator({
        registerAssociateAction,
        isTargetSelectionMode,
        onSelectTargetActivity,
    }) {
        ReactModule.useEffect(() => {
            if (!registerAssociateAction) return undefined;
            registerAssociateAction(() => {});
            return () => registerAssociateAction(null);
        }, [registerAssociateAction]);

        return ReactModule.createElement(
            'div',
            null,
            ReactModule.createElement('div', null, 'goal activities view'),
            isTargetSelectionMode
                ? ReactModule.createElement(
                    'button',
                    {
                        onClick: () => onSelectTargetActivity({
                            id: 'activity-1',
                            name: 'Performance',
                            has_metrics: true,
                            metric_definitions: [{ id: 'metric-1', name: 'Quality', unit: 'rating' }],
                        }),
                    },
                    'select target activity'
                )
                : null
        );
    }

    return {
        default: MockActivityAssociator,
    };
});

vi.mock('../goalDetail/TargetManager', () => ({
    default: ({ viewMode, onCloseBuilder }) => (
        viewMode === 'builder' ? (
            <div>
                <div>embedded target builder</div>
                <button onClick={onCloseBuilder}>back to activities</button>
            </div>
        ) : (
            <div>target list view</div>
        )
    ),
}));

vi.mock('../analytics/GenericGraphModal', () => ({
    default: () => null,
}));

vi.mock('../goals/GoalEditForm', () => ({
    default: ({ name, handleSave, handleCancel }) => (
        <div>
            <div>edit:{name}</div>
            <button onClick={handleSave}>save goal</button>
            <button onClick={handleCancel}>cancel edit</button>
        </div>
    ),
}));

describe('GoalDetailModal smoke coverage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseGoalForm.mockReturnValue({
            name: 'Deep Work',
            setName: vi.fn(),
            description: 'Focus on leverage work',
            setDescription: vi.fn(),
            deadline: '2026-04-01',
            setDeadline: vi.fn(),
            relevanceStatement: 'Build momentum',
            setRelevanceStatement: vi.fn(),
            completedViaChildren: false,
            setCompletedViaChildren: vi.fn(),
            trackActivities: true,
            setTrackActivities: vi.fn(),
            allowManualCompletion: true,
            setAllowManualCompletion: vi.fn(),
            targets: [],
            setTargets: vi.fn(),
            resetForm: mockResetForm,
            errors: {},
            validateForm: vi.fn(() => true),
        });
    });

    it('renders view mode and forwards close requests', () => {
        const onClose = vi.fn();

        render(
            <GoalDetailModal
                isOpen={true}
                onClose={onClose}
                goal={{
                    id: 'goal-1',
                    name: 'Deep Work',
                    attributes: { id: 'goal-1', type: 'ShortTermGoal' },
                }}
                onUpdate={vi.fn()}
                onToggleCompletion={vi.fn()}
                onDelete={vi.fn()}
                rootId="root-1"
                treeData={[]}
            />
        );

        expect(screen.getByText('view:Deep Work')).toBeInTheDocument();

        fireEvent.click(screen.getByText('close modal'));
        expect(onClose).toHaveBeenCalled();
    });

    it('keeps the shared header visible when switching to options view', async () => {
        render(
            <GoalDetailModal
                isOpen={true}
                onClose={vi.fn()}
                goal={{
                    id: 'goal-1',
                    name: 'Deep Work',
                    attributes: { id: 'goal-1', type: 'ShortTermGoal', parent_id: 'parent-1' },
                }}
                onUpdate={vi.fn()}
                onToggleCompletion={vi.fn()}
                onDelete={vi.fn()}
                rootId="root-1"
                treeData={{
                    id: 'root-1',
                    name: 'Root',
                    attributes: { id: 'root-1', type: 'UltimateGoal', level_id: 'level-root' },
                    children: [
                        {
                            id: 'parent-1',
                            name: 'Parent',
                            attributes: { id: 'parent-1', type: 'MidTermGoal', level_id: 'level-mid' },
                            children: [],
                        },
                    ],
                }}
            />
        );

        expect(screen.getByText('header:Deep Work:active')).toBeInTheDocument();

        fireEvent.click(screen.getByText('open options'));

        await waitFor(() => {
            expect(screen.getByText('header:Deep Work:active')).toBeInTheDocument();
            expect(screen.getByText('goal options view')).toBeInTheDocument();
        }, { timeout: 5000 });
    });

    it('keeps the shared header visible when switching to timeline view', async () => {
        render(
            <GoalDetailModal
                isOpen={true}
                onClose={vi.fn()}
                goal={{
                    id: 'goal-1',
                    name: 'Deep Work',
                    attributes: { id: 'goal-1', type: 'ShortTermGoal', parent_id: 'parent-1' },
                }}
                onUpdate={vi.fn()}
                onToggleCompletion={vi.fn()}
                onDelete={vi.fn()}
                rootId="root-1"
                treeData={{
                    id: 'root-1',
                    name: 'Root',
                    attributes: { id: 'root-1', type: 'UltimateGoal', level_id: 'level-root' },
                    children: [],
                }}
            />
        );

        fireEvent.click(screen.getByText('open timeline'));

        await waitFor(() => {
            expect(screen.getByText('header:Deep Work:active')).toBeInTheDocument();
            expect(screen.getByText('goal timeline view')).toBeInTheDocument();
        }, { timeout: 5000 });
    });

    it('shows activities as a tab and moves associate action into the footer', async () => {
        render(
            <GoalDetailModal
                isOpen={true}
                onClose={vi.fn()}
                goal={{
                    id: 'goal-1',
                    name: 'Deep Work',
                    attributes: { id: 'goal-1', type: 'ShortTermGoal', parent_id: 'parent-1' },
                }}
                onUpdate={vi.fn()}
                onToggleCompletion={vi.fn()}
                onDelete={vi.fn()}
                rootId="root-1"
                activityDefinitions={[
                    {
                        id: 'activity-1',
                        name: 'Performance',
                        has_metrics: true,
                        metric_definitions: [{ id: 'metric-1', name: 'Quality', unit: 'rating' }],
                    },
                ]}
                treeData={{
                    id: 'root-1',
                    name: 'Root',
                    attributes: { id: 'root-1', type: 'UltimateGoal', level_id: 'level-root' },
                    children: [],
                }}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Activities' }));

        await waitFor(() => {
            expect(screen.getByText('goal activities view')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: '+ Associate Activities' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: '+ Add Target' })).toBeInTheDocument();
        }, { timeout: 5000 });
    });

    it('selects an activity from the Activities tab before opening the embedded target builder', async () => {
        render(
            <GoalDetailModal
                isOpen={true}
                onClose={vi.fn()}
                goal={{
                    id: 'goal-1',
                    name: 'Deep Work',
                    attributes: { id: 'goal-1', type: 'ShortTermGoal', parent_id: 'parent-1' },
                }}
                onUpdate={vi.fn()}
                onToggleCompletion={vi.fn()}
                onDelete={vi.fn()}
                rootId="root-1"
                treeData={{
                    id: 'root-1',
                    name: 'Root',
                    attributes: { id: 'root-1', type: 'UltimateGoal', level_id: 'level-root' },
                    children: [],
                }}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Activities' }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: '+ Add Target' })).toBeInTheDocument();
        }, { timeout: 5000 });

        fireEvent.click(screen.getByRole('button', { name: '+ Add Target' }));

        await waitFor(() => {
            expect(screen.getByText('goal activities view')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'select target activity' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: '+ Add Target' })).not.toBeInTheDocument();
        }, { timeout: 5000 });

        fireEvent.click(screen.getByRole('button', { name: 'select target activity' }));

        await waitFor(() => {
            expect(screen.getByText('embedded target builder')).toBeInTheDocument();
            expect(screen.queryByText('goal activities view')).not.toBeInTheDocument();
        }, { timeout: 5000 });
    });

    it('cancels edit state when navigating from edit details to another tab', async () => {
        render(
            <GoalDetailModal
                isOpen={true}
                onClose={vi.fn()}
                goal={{
                    id: 'goal-1',
                    name: 'Deep Work',
                    attributes: { id: 'goal-1', type: 'ShortTermGoal', parent_id: 'parent-1' },
                }}
                onUpdate={vi.fn()}
                onToggleCompletion={vi.fn()}
                onDelete={vi.fn()}
                rootId="root-1"
                mode="edit"
                treeData={{
                    id: 'root-1',
                    name: 'Root',
                    attributes: { id: 'root-1', type: 'UltimateGoal', level_id: 'level-root' },
                    children: [],
                }}
            />
        );

        expect(screen.getByText('edit:Deep Work')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Activities' }));

        await waitFor(() => {
            expect(mockResetForm).toHaveBeenCalled();
            expect(screen.getByText('goal activities view')).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
        }, { timeout: 5000 });
    });

    it('closes when app navigation begins', () => {
        const onClose = vi.fn();

        render(
            <GoalDetailModal
                isOpen={true}
                onClose={onClose}
                goal={{
                    id: 'goal-1',
                    name: 'Deep Work',
                    attributes: { id: 'goal-1', type: 'ShortTermGoal' },
                }}
                onUpdate={vi.fn()}
                onToggleCompletion={vi.fn()}
                onDelete={vi.fn()}
                rootId="root-1"
                treeData={[]}
            />
        );

        act(() => {
            window.dispatchEvent(new CustomEvent(GOAL_DETAIL_NAVIGATION_EVENT));
        });

        expect(onClose).toHaveBeenCalled();
    });

    it('renders create mode and submits through onCreate', async () => {
        const onCreate = vi.fn().mockResolvedValue({ id: 'goal-2', name: 'Deep Work' });

        render(
            <GoalDetailModal
                isOpen={true}
                onClose={vi.fn()}
                goal={null}
                onUpdate={vi.fn()}
                onToggleCompletion={vi.fn()}
                onDelete={vi.fn()}
                rootId="root-1"
                treeData={[]}
                mode="create"
                onCreate={onCreate}
                parentGoal={{
                    id: 'parent-1',
                    attributes: { id: 'parent-1', type: 'ShortTermGoal' },
                }}
            />
        );

        expect(screen.getByText('edit:Deep Work')).toBeInTheDocument();

        fireEvent.click(screen.getByText('save goal'));

        await waitFor(() => {
            expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
                name: 'Deep Work',
                description: 'Focus on leverage work',
                deadline: '2026-04-01',
                relevance_statement: 'Build momentum',
                parent_id: 'parent-1',
                allow_manual_completion: true,
            }));
        });

        expect(mockNotify.success).toHaveBeenCalled();
    });
});
