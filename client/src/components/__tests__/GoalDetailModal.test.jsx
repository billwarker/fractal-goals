import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import GoalDetailModal from '../GoalDetailModal';
import { GOAL_DETAIL_NAVIGATION_EVENT } from '../../utils/navigationEvents';

const {
    mockUseGoalForm,
    mockResetForm,
    mockNotify,
    mockGoalAssociations,
    mockGoalMetrics,
    mockGoalDurations,
    mockCreateGoalNote,
    mockDeleteGoalCompletionNotes,
} = vi.hoisted(() => ({
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
        isLoading: false,
        isFetching: false,
    },
    mockCreateGoalNote: vi.fn(() => Promise.resolve()),
    mockDeleteGoalCompletionNotes: vi.fn(() => Promise.resolve()),
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
        getGoalColor: (type) => (type === 'Completed' ? '#10b981' : '#22d3ee'),
        getGoalSecondaryColor: () => '#0f172a',
        getGoalTextColor: (type) => (type === 'Completed' ? '#ffffff' : '#0f172a'),
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
        createNote: mockCreateGoalNote,
        updateNote: vi.fn(() => Promise.resolve()),
        deleteNote: vi.fn(() => Promise.resolve()),
        deleteGoalCompletionNotes: mockDeleteGoalCompletionNotes,
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
    default: ({ accentColor, completionNote, onCompletionNoteChange }) => (
        <div>
            <div>completion modal:{accentColor}</div>
            <textarea
                aria-label="Goal Completion Note"
                value={completionNote}
                onChange={(event) => onCompletionNoteChange(event.target.value)}
            />
        </div>
    ),
}));

vi.mock('../goals/GoalUncompletionModal', () => ({
    default: ({ accentColor }) => <div>uncompletion modal:{accentColor}</div>,
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
    default: ({ onTimeSpentClick }) => (
        <div>
            <div>goal timeline view</div>
            <button onClick={onTimeSpentClick}>time spent</button>
        </div>
    ),
}));

vi.mock('../goalDetail/ActivityAssociator', async () => {
    const ReactModule = await vi.importActual('react');

    function MockActivityAssociator({
        registerAssociateAction,
        registerAssociateCancelAction,
        onAssociationFlowChange,
        registerPickerFooterActions,
        isTargetSelectionMode,
        onSelectTargetActivity,
        activityGroups,
        associatedActivities,
        readOnly,
    }) {
        const [isDiscoveryActive, setIsDiscoveryActive] = ReactModule.useState(false);

        ReactModule.useEffect(() => {
            if (!registerAssociateAction) return undefined;
            registerAssociateAction(() => setIsDiscoveryActive(true));
            return () => registerAssociateAction(null);
        }, [registerAssociateAction]);

        ReactModule.useEffect(() => {
            if (!registerAssociateCancelAction) return undefined;
            registerAssociateCancelAction(() => setIsDiscoveryActive(false));
            return () => registerAssociateCancelAction(null);
        }, [registerAssociateCancelAction]);

        ReactModule.useEffect(() => {
            onAssociationFlowChange?.(isDiscoveryActive);
        }, [isDiscoveryActive, onAssociationFlowChange]);

        ReactModule.useEffect(() => {
            if (!registerPickerFooterActions) return undefined;
            if (!isDiscoveryActive) {
                registerPickerFooterActions(null);
                return undefined;
            }
            registerPickerFooterActions({
                selectedSummary: '2 activities',
                clearLabel: 'Clear',
                cancelLabel: 'Cancel',
                confirmLabel: 'Add Selected (2 activities)',
                canClear: true,
                canConfirm: true,
                onClear: vi.fn(),
                onCancel: () => setIsDiscoveryActive(false),
                onConfirm: vi.fn(),
            });
            return () => registerPickerFooterActions(null);
        }, [isDiscoveryActive, registerPickerFooterActions]);

        return ReactModule.createElement(
            'div',
            null,
            ReactModule.createElement('div', null, 'goal activities view'),
            ReactModule.createElement('div', null, readOnly ? 'read-only associator' : 'editable associator'),
            ...(associatedActivities || []).map((activity) => (
                ReactModule.createElement('div', { key: activity.id }, activity.name)
            )),
            ReactModule.createElement('div', null, `activity groups:${activityGroups.length}`),
            isDiscoveryActive
                ? ReactModule.createElement(
                    'div',
                    null,
                    ReactModule.createElement('div', null, 'activity association picker'),
                    ReactModule.createElement('button', { type: 'button' }, '+ Create New Activity Definition'),
                    ReactModule.createElement('button', { type: 'button' }, '+ Copy Existing Activity Definition'),
                    ReactModule.createElement('button', { type: 'button' }, '+ Create New Group')
                )
                : null,
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
    default: ({ viewMode, onCloseBuilder, onSaved }) => (
        viewMode === 'builder' ? (
            <div>
                <div>embedded target builder</div>
                <button onClick={onCloseBuilder}>back to activities</button>
                <button
                    onClick={() => {
                        onSaved?.({ action: 'create' });
                        onCloseBuilder?.();
                    }}
                >
                    save target
                </button>
            </div>
        ) : (
            <div>target list view</div>
        )
    ),
}));

vi.mock('../analytics/graphs/GraphProfileModal', () => ({
    default: ({ profileId, data }) => (
        <div>
            <div>graph profile modal</div>
            <div>graph-profile:{profileId}</div>
            <div>graph-goal:{data.goal?.name}</div>
            <div>graph-duration:{data.points?.[0]?.activity_duration}</div>
        </div>
    ),
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
        mockGoalDurations.data = null;
        mockGoalDurations.isSuccess = false;
        mockGoalDurations.isLoading = false;
        mockGoalDurations.isFetching = false;
        mockGoalMetrics.metrics = null;
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
            expect(screen.getByRole('button', { name: 'Cancel' })).toHaveStyle({
                '--completion-accent': '#22d3ee',
            });
        }, { timeout: 5000 });

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        await waitFor(() => {
            expect(screen.getByText('view:Deep Work')).toBeInTheDocument();
            expect(screen.queryByText('goal options view')).not.toBeInTheDocument();
        }, { timeout: 5000 });
    });

    it('keeps the shared header visible and actions in the footer when confirming completion', async () => {
        render(
            <GoalDetailModal
                isOpen={true}
                onClose={vi.fn()}
                goal={{
                    id: 'goal-1',
                    name: 'Deep Work',
                    completed: false,
                    attributes: {
                        id: 'goal-1',
                        type: 'ShortTermGoal',
                        completed: false,
                        allow_manual_completion: true,
                    },
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

        fireEvent.click(screen.getByRole('button', { name: 'Mark Complete' }));

        await waitFor(() => {
            expect(screen.getByText('header:Deep Work:active')).toBeInTheDocument();
            expect(screen.getByText('completion modal:#22d3ee')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Complete Goal' })).toHaveStyle({
                '--completion-accent': '#22d3ee',
            });
        }, { timeout: 5000 });
    });

    it('creates a special goal completion note before completing the goal', async () => {
        const onToggleCompletion = vi.fn(() => Promise.resolve());
        render(
            <GoalDetailModal
                isOpen={true}
                onClose={vi.fn()}
                goal={{
                    id: 'goal-1',
                    name: 'Deep Work',
                    completed: false,
                    attributes: {
                        id: 'goal-1',
                        type: 'ShortTermGoal',
                        completed: false,
                        allow_manual_completion: true,
                    },
                }}
                onUpdate={vi.fn()}
                onToggleCompletion={onToggleCompletion}
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

        fireEvent.click(screen.getByRole('button', { name: 'Mark Complete' }));
        fireEvent.change(await screen.findByLabelText('Goal Completion Note'), {
            target: { value: 'This milestone finally clicked.' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Complete Goal' }));

        await waitFor(() => {
            expect(mockCreateGoalNote).toHaveBeenCalledWith({
                content: 'This milestone finally clicked.',
                context_type: 'goal',
                context_id: 'goal-1',
                goal_id: 'goal-1',
                note_kind: 'goal_completion',
            });
            expect(onToggleCompletion).toHaveBeenCalledWith('goal-1', false);
        });
    });

    it('keeps the shared header visible and actions in the footer when confirming uncompletion', async () => {
        render(
            <GoalDetailModal
                isOpen={true}
                onClose={vi.fn()}
                goal={{
                    id: 'goal-1',
                    name: 'Deep Work',
                    completed: true,
                    completed_at: '2026-05-03T18:03:00Z',
                    attributes: {
                        id: 'goal-1',
                        type: 'ShortTermGoal',
                        completed: true,
                        completed_at: '2026-05-03T18:03:00Z',
                        allow_manual_completion: true,
                    },
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

        fireEvent.click(screen.getByRole('button', { name: /Completed/ }));

        await waitFor(() => {
            expect(screen.getByText('header:Deep Work:active')).toBeInTheDocument();
            expect(screen.getByText('uncompletion modal:#22d3ee')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Mark Incomplete' })).toHaveStyle({
                '--completion-accent': '#22d3ee',
            });
        }, { timeout: 5000 });
    });

    it('removes goal completion notes before marking the goal incomplete', async () => {
        const onToggleCompletion = vi.fn(() => Promise.resolve());
        render(
            <GoalDetailModal
                isOpen={true}
                onClose={vi.fn()}
                goal={{
                    id: 'goal-1',
                    name: 'Deep Work',
                    completed: true,
                    completed_at: '2026-05-03T18:03:00Z',
                    attributes: {
                        id: 'goal-1',
                        type: 'ShortTermGoal',
                        completed: true,
                        completed_at: '2026-05-03T18:03:00Z',
                        allow_manual_completion: true,
                    },
                }}
                onUpdate={vi.fn()}
                onToggleCompletion={onToggleCompletion}
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

        fireEvent.click(screen.getByRole('button', { name: /Completed/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Mark Incomplete' }));

        await waitFor(() => {
            expect(mockDeleteGoalCompletionNotes).toHaveBeenCalled();
            expect(onToggleCompletion).toHaveBeenCalledWith('goal-1', true);
        });
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

    it('opens the time spent graph as a registered graph profile for the current goal', async () => {
        mockGoalDurations.data = {
            points: [
                { date: '2026-06-25', activity_duration: 7320, session_duration: 9000 },
            ],
        };
        mockGoalDurations.isSuccess = true;
        mockGoalMetrics.metrics = {
            recursive: {
                sessions_count: 4,
                activities_duration_seconds: 7320,
            },
        };

        render(
            <GoalDetailModal
                isOpen={true}
                onClose={vi.fn()}
                goal={{
                    id: 'goal-1',
                    name: 'Deep Work',
                    attributes: {
                        id: 'goal-1',
                        name: 'Deep Work',
                        type: 'ShortTermGoal',
                        created_at: '2026-06-17T10:00:00Z',
                    },
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
            expect(screen.getByText('goal timeline view')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('time spent'));

        await waitFor(() => {
            expect(screen.getByText('graph profile modal')).toBeInTheDocument();
            expect(screen.getByText('graph-profile:goalDuration')).toBeInTheDocument();
            expect(screen.getByText('graph-goal:Deep Work')).toBeInTheDocument();
            expect(screen.getByText('graph-duration:7320')).toBeInTheDocument();
        }, { timeout: 5000 });
    });

    it('opens the time spent graph from the panel timeline shell', async () => {
        mockGoalDurations.data = {
            points: [
                { date: '2026-06-25', activity_duration: 7320, session_duration: 9000 },
            ],
        };

        render(
            <GoalDetailModal
                isOpen={true}
                displayMode="panel"
                onClose={vi.fn()}
                goal={{
                    id: 'goal-1',
                    name: 'Deep Work',
                    attributes: {
                        id: 'goal-1',
                        name: 'Deep Work',
                        type: 'ShortTermGoal',
                    },
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
            expect(screen.getByText('goal timeline view')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('time spent'));

        await waitFor(() => {
            expect(screen.getByText('graph profile modal')).toBeInTheDocument();
            expect(screen.getByText('graph-profile:goalDuration')).toBeInTheDocument();
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

        fireEvent.click(screen.getByRole('tab', { name: 'Activities' }));

        await waitFor(() => {
            expect(screen.getByText('goal activities view')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: '+ Associate Activities' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: '+ Add Target' })).toBeInTheDocument();
        }, { timeout: 5000 });
    });

    it('passes provided activity groups into the activities view', async () => {
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
                activityDefinitions={[]}
                activityGroups={[{ id: 'group-1', name: 'Technique', parent_id: null }]}
                treeData={{
                    id: 'root-1',
                    name: 'Root',
                    attributes: { id: 'root-1', type: 'UltimateGoal', level_id: 'level-root' },
                    children: [],
                }}
            />
        );

        fireEvent.click(screen.getByRole('tab', { name: 'Activities' }));

        await waitFor(() => {
            expect(screen.getByText('activity groups:1')).toBeInTheDocument();
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

        fireEvent.click(screen.getByRole('tab', { name: 'Activities' }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: '+ Add Target' })).toBeInTheDocument();
        }, { timeout: 5000 });

        fireEvent.click(screen.getByRole('button', { name: '+ Add Target' }));

        await waitFor(() => {
            expect(screen.getByText('goal activities view')).toBeInTheDocument();
            expect(screen.getByText('Select the activity you want to create a target for.')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'select target activity' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: '+ Add Target' })).toBeDisabled();
        }, { timeout: 5000 });

        fireEvent.click(screen.getByRole('button', { name: 'select target activity' }));

        // The builder now opens in its own modal layered above the Activities view,
        // rather than replacing the goal detail content.
        await waitFor(() => {
            expect(screen.getByText('embedded target builder')).toBeInTheDocument();
        }, { timeout: 5000 });

        fireEvent.click(screen.getByRole('button', { name: 'save target' }));

        await waitFor(() => {
            expect(screen.getByText('view:Deep Work')).toBeInTheDocument();
            expect(screen.queryByText('goal activities view')).not.toBeInTheDocument();
        }, { timeout: 5000 });
    });

    it('keeps the Activities footer visible and turns Add Target into Cancel during association flow', async () => {
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

        fireEvent.click(screen.getByRole('tab', { name: 'Activities' }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: '+ Associate Activities' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: '+ Add Target' })).toBeInTheDocument();
        }, { timeout: 5000 });

        fireEvent.click(screen.getByRole('button', { name: '+ Associate Activities' }));

        await waitFor(() => {
            expect(screen.getByText('activity association picker')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: '+ Create New Activity Definition' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: '+ Copy Existing Activity Definition' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: '+ Create New Group' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Add Selected (2 activities)' })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: '+ Associate Activities' })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: '+ Add Target' })).not.toBeInTheDocument();
        }, { timeout: 5000 });

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        await waitFor(() => {
            expect(screen.queryByText('activity association picker')).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: '+ Associate Activities' })).toBeEnabled();
            expect(screen.getByRole('button', { name: '+ Add Target' })).toBeInTheDocument();
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

        fireEvent.click(screen.getByRole('tab', { name: 'Activities' }));

        await waitFor(() => {
            expect(mockResetForm).toHaveBeenCalled();
            expect(screen.getByText('goal activities view')).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
        }, { timeout: 5000 });
    });

    it('awaits update saves before returning to view mode and shows a success toast', async () => {
        const onUpdate = vi.fn().mockResolvedValue({
            id: 'goal-1',
            name: 'Deep Work',
            attributes: {
                id: 'goal-1',
                type: 'ShortTermGoal',
                description: 'Focus on leverage work',
            },
        });

        render(
            <GoalDetailModal
                isOpen={true}
                onClose={vi.fn()}
                goal={{
                    id: 'goal-1',
                    name: 'Deep Work',
                    attributes: { id: 'goal-1', type: 'ShortTermGoal' },
                }}
                onUpdate={onUpdate}
                onToggleCompletion={vi.fn()}
                onDelete={vi.fn()}
                rootId="root-1"
                mode="edit"
                treeData={[]}
            />
        );

        fireEvent.click(screen.getByText('save goal'));

        await waitFor(() => {
            expect(onUpdate).toHaveBeenCalledWith('goal-1', expect.objectContaining({
                name: 'Deep Work',
                description: 'Focus on leverage work',
            }));
            expect(mockNotify.success).toHaveBeenCalledWith('Goal updated');
            expect(screen.getByText('view:Deep Work')).toBeInTheDocument();
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

    it('in read-only mode shows all tabs, renders snapshot activities, and hides edit affordances', async () => {
        render(
            <GoalDetailModal
                isOpen={true}
                onClose={vi.fn()}
                readOnly
                goal={{
                    id: 'goal-1',
                    name: 'Deep Work',
                    attributes: {
                        id: 'goal-1',
                        type: 'ShortTermGoal',
                        associated_activities: [
                            {
                                id: 'activity-snap-1',
                                name: 'Sight reading drill',
                                metric_definitions: [{ id: 'm1', name: 'Bars', unit: 'count' }],
                            },
                        ],
                        timeline_events: [],
                        notes: [],
                    },
                }}
                rootId="root-1"
                treeData={[]}
                activityGroups={[{ id: 'group-1', name: 'Reading', parent_id: null }]}
            />
        );

        // All four navigation tabs remain available in read-only.
        expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Timeline' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Activities' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Notes' })).toBeInTheDocument();

        // No edit / options / completion footer affordances.
        expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Options' })).not.toBeInTheDocument();

        // The Activities tab renders the snapshot activities read-only (no remove control).
        fireEvent.click(screen.getByRole('tab', { name: 'Activities' }));
        await waitFor(() => {
            expect(screen.getByText('goal activities view')).toBeInTheDocument();
            expect(screen.getByText('read-only associator')).toBeInTheDocument();
            expect(screen.getByText('Sight reading drill')).toBeInTheDocument();
            expect(screen.getByText('activity groups:1')).toBeInTheDocument();
            expect(screen.queryByText('+ Associate Activities')).not.toBeInTheDocument();
        }, { timeout: 5000 });
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
