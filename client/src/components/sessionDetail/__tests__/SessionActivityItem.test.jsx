import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import SessionActivityItem from '../SessionActivityItem';

const {
    updateInstance,
    updateTimer,
    removeActivity,
    toggleGoalCompletion,
    deleteGoal,
    createNanoGoalNote,
    getActivityModes,
} = vi.hoisted(() => ({
    updateInstance: vi.fn(() => Promise.resolve()),
    updateTimer: vi.fn(),
    removeActivity: vi.fn(),
    toggleGoalCompletion: vi.fn(() => Promise.resolve()),
    deleteGoal: vi.fn(() => Promise.resolve()),
    createNanoGoalNote: vi.fn(() => Promise.resolve({
        data: {
            goal: {
                id: 'nano-1',
                name: 'Do one strict rep',
                attributes: { type: 'NanoGoal' }
            },
            note: {
                id: 'note-1',
                session_id: 'session-1',
                content: 'Do one strict rep',
                nano_goal_id: 'nano-1',
                is_nano_goal: true
            }
        }
    })),
    getActivityModes: vi.fn(() => Promise.resolve({ data: [] })),
}));

vi.mock('../../../contexts/ActiveSessionContext', () => ({
    useActiveSessionData: () => ({
        rootId: 'root-1',
        sessionId: 'session-1',
        activities: [
            {
                id: 'activity-1',
                name: 'Pull Up',
                associated_goal_ids: ['ig-1'],
                metric_definitions: [],
                split_definitions: [],
                has_sets: false,
                has_splits: false
            }
        ],
        parentGoals: [],
        immediateGoals: [{ id: 'ig-1', name: 'Immediate' }],
        microGoals: [
            {
                id: 'micro-1',
                name: 'Micro Goal',
                parent_id: 'ig-1',
                completed: false,
                attributes: { session_id: 'session-1' },
                children: []
            }
        ],
        session: { immediate_goals: [{ id: 'ig-1' }] },
    }),
    useActiveSessionActions: () => ({
        updateInstance,
        updateTimer,
        removeActivity,
        toggleGoalCompletion
    })
}));

vi.mock('../../../utils/api', () => ({
    fractalApi: {
        deleteGoal,
        createNanoGoalNote,
        getActivityModes,
    }
}));

vi.mock('../../../contexts/TimezoneContext', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useTimezone: () => ({ timezone: 'UTC' })
    };
});

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

describe('SessionActivityItem nano note flow', () => {
    beforeEach(() => {
        updateInstance.mockClear();
        updateTimer.mockClear();
        removeActivity.mockClear();
        toggleGoalCompletion.mockClear();
        deleteGoal.mockClear();
        createNanoGoalNote.mockClear();
        getActivityModes.mockClear();
        getActivityModes.mockResolvedValue({ data: [] });
    });

    it('creates a nano goal note without runtime errors', async () => {
        renderWithProviders(
            <SessionActivityItem
                exercise={{
                    id: 'instance-1',
                    session_id: 'session-1',
                    activity_definition_id: 'activity-1',
                    sets: [],
                    metrics: [],
                    time_start: null,
                    time_stop: null,
                    duration_seconds: 0
                }}
                onFocus={vi.fn()}
                isSelected={false}
                onReorder={vi.fn()}
                canMoveUp={false}
                canMoveDown={false}
                showReorderButtons={false}
                onNoteCreated={vi.fn()}
                allNotes={[]}
                onAddNote={vi.fn()}
                onUpdateNote={vi.fn()}
                onDeleteNote={vi.fn()}
                onOpenGoals={vi.fn()}
                isDragging={false}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false
            }
        );

        const textarea = screen.getByPlaceholderText('Add a nano goal / sub-step...');
        fireEvent.change(textarea, { target: { value: 'Do one strict rep' } });
        fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

        await waitFor(() => {
            expect(createNanoGoalNote).toHaveBeenCalledTimes(1);
        });
        expect(createNanoGoalNote).toHaveBeenCalledWith('root-1', {
            name: 'Do one strict rep',
            parent_id: 'micro-1',
            session_id: 'session-1',
            activity_instance_id: 'instance-1',
            activity_definition_id: 'activity-1',
            set_index: null,
        });
    });

    it('shows a single failure when nano goal creation fails', async () => {
        createNanoGoalNote.mockImplementationOnce(() => Promise.reject(new Error('nano failed')));

        renderWithProviders(
            <SessionActivityItem
                exercise={{
                    id: 'instance-1',
                    session_id: 'session-1',
                    activity_definition_id: 'activity-1',
                    sets: [],
                    metrics: [],
                    time_start: null,
                    time_stop: null,
                    duration_seconds: 0
                }}
                onFocus={vi.fn()}
                isSelected={false}
                onReorder={vi.fn()}
                canMoveUp={false}
                canMoveDown={false}
                showReorderButtons={false}
                onNoteCreated={vi.fn()}
                allNotes={[]}
                onAddNote={vi.fn()}
                onUpdateNote={vi.fn()}
                onDeleteNote={vi.fn()}
                onOpenGoals={vi.fn()}
                isDragging={false}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false
            }
        );

        const textarea = screen.getByPlaceholderText('Add a nano goal / sub-step...');
        fireEvent.change(textarea, { target: { value: 'Do one strict rep' } });
        fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

        await waitFor(() => {
            expect(createNanoGoalNote).toHaveBeenCalledWith('root-1', {
                name: 'Do one strict rep',
                parent_id: 'micro-1',
                session_id: 'session-1',
                activity_instance_id: 'instance-1',
                activity_definition_id: 'activity-1',
                set_index: null,
            });
        });
        expect(deleteGoal).not.toHaveBeenCalled();
    });

    it('buffers single metric edits and commits on blur', async () => {
        renderWithProviders(
            <SessionActivityItem
                exercise={{
                    id: 'instance-2',
                    session_id: 'session-1',
                    activity_definition_id: 'activity-1',
                    sets: [],
                    metrics: [{ metric_id: 'm1', value: '5' }],
                    metric_definitions: [{ id: 'm1', name: 'Reps', unit: 'reps' }],
                    time_start: null,
                    time_stop: null,
                    duration_seconds: 0
                }}
                onFocus={vi.fn()}
                isSelected={false}
                onReorder={vi.fn()}
                canMoveUp={false}
                canMoveDown={false}
                showReorderButtons={false}
                onNoteCreated={vi.fn()}
                allNotes={[]}
                onAddNote={vi.fn()}
                onUpdateNote={vi.fn()}
                onDeleteNote={vi.fn()}
                onOpenGoals={vi.fn()}
                isDragging={false}
                activityDefinition={{
                    id: 'activity-1',
                    name: 'Pull Up',
                    metric_definitions: [{ id: 'm1', name: 'Reps', unit: 'reps' }],
                    split_definitions: [],
                    has_sets: false,
                    has_splits: false
                }}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false
            }
        );

        const input = screen.getByDisplayValue('5');
        fireEvent.change(input, { target: { value: '123' } });
        expect(updateInstance).not.toHaveBeenCalled();
        fireEvent.blur(input);

        await waitFor(() => {
            expect(updateInstance).toHaveBeenCalledTimes(1);
        });
        expect(updateInstance).toHaveBeenCalledWith('instance-2', {
            metrics: [{ metric_id: 'm1', value: '123' }]
        });
    });

    it('buffers timer input edits and commits start time on blur', async () => {
        renderWithProviders(
            <SessionActivityItem
                exercise={{
                    id: 'instance-3',
                    session_id: 'session-1',
                    activity_definition_id: 'activity-1',
                    sets: [],
                    metrics: [],
                    time_start: '2026-01-01T00:00:00.000Z',
                    time_stop: null,
                    duration_seconds: 0
                }}
                onFocus={vi.fn()}
                isSelected={false}
                onReorder={vi.fn()}
                canMoveUp={false}
                canMoveDown={false}
                showReorderButtons={false}
                onNoteCreated={vi.fn()}
                allNotes={[]}
                onAddNote={vi.fn()}
                onUpdateNote={vi.fn()}
                onDeleteNote={vi.fn()}
                onOpenGoals={vi.fn()}
                isDragging={false}
                activityDefinition={{
                    id: 'activity-1',
                    name: 'Pull Up',
                    metric_definitions: [],
                    split_definitions: [],
                    has_sets: false,
                    has_splits: false
                }}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false
            }
        );

        const [startInput] = screen.getAllByPlaceholderText('YYYY-MM-DD HH:MM:SS');
        expect(startInput).toHaveValue('2026-01-01 00:00:00');

        fireEvent.change(startInput, { target: { value: '2026-01-01 01:15:00' } });
        expect(updateInstance).not.toHaveBeenCalled();
        fireEvent.blur(startInput);

        await waitFor(() => {
            expect(updateInstance).toHaveBeenCalledTimes(1);
        });
        expect(updateInstance).toHaveBeenCalledWith('instance-3', {
            time_start: '2026-01-01T01:15:00.000Z'
        });
    });
});

describe('SessionActivityItem quick mode', () => {
    const quickModeDefinition = {
        id: 'activity-1',
        name: 'Military Press',
        group_id: 'group-child',
        associated_goal_ids: ['ig-1'],
        metric_definitions: [{ id: 'm1', name: 'Weight', unit: 'lbs' }],
        split_definitions: [],
        has_sets: false,
        has_splits: false,
    };

    const baseExercise = {
        id: 'quick-instance-1',
        session_id: 'session-1',
        activity_definition_id: 'activity-1',
        completed: false,
        metrics: [{ metric_id: 'm1', value: '190' }],
        sets: [],
        time_start: null,
        time_stop: null,
        duration_seconds: 0,
    };

    beforeEach(() => {
        updateInstance.mockClear();
        updateTimer.mockClear();
        removeActivity.mockClear();
    });

    it('renders timer controls, notes, delete button, and micro goal icon in regular mode', () => {
        renderWithProviders(
            <SessionActivityItem
                exercise={baseExercise}
                onFocus={vi.fn()}
                isSelected={false}
                onReorder={vi.fn()}
                canMoveUp={false}
                canMoveDown={false}
                showReorderButtons={false}
                onNoteCreated={vi.fn()}
                allNotes={[]}
                onAddNote={vi.fn()}
                onUpdateNote={vi.fn()}
                onDeleteNote={vi.fn()}
                isDragging={false}
                activityDefinition={quickModeDefinition}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        expect(screen.getByTitle('Micro Goal: Micro Goal')).toBeInTheDocument();
        expect(screen.getByTitle('Start timer')).toBeInTheDocument();
        expect(screen.getByTitle('Instant complete (0s duration)')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Add a nano goal / sub-step...')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Delete activity' })).toBeInTheDocument();
    });

    it('truncates long descriptions to one line and exposes the full value in a tooltip', () => {
        const description = 'https://my.pickupmusic.com/lesson/35e8b87f-c2a5-46d8-baa9-c8352f1444ef';

        renderWithProviders(
            <SessionActivityItem
                exercise={baseExercise}
                onFocus={vi.fn()}
                isSelected={false}
                onReorder={vi.fn()}
                canMoveUp={false}
                canMoveDown={false}
                showReorderButtons={false}
                onNoteCreated={vi.fn()}
                allNotes={[]}
                onAddNote={vi.fn()}
                onUpdateNote={vi.fn()}
                onDeleteNote={vi.fn()}
                isDragging={false}
                activityDefinition={{ ...quickModeDefinition, description }}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        expect(screen.getByTitle(description)).toBeInTheDocument();

        const descriptionLink = screen.getByRole('link', { name: description });
        expect(descriptionLink).toHaveAttribute('href', description);
    });

    it('renders completion button, hides timer controls, notes, delete button, and micro goal icon in quick mode', () => {
        renderWithProviders(
            <SessionActivityItem
                exercise={{ ...baseExercise, metrics: [] }}
                quickMode
                isSelected={false}
                activityDefinition={{ ...quickModeDefinition, metric_definitions: [] }}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        expect(screen.queryByTitle('Start timer')).not.toBeInTheDocument();
        expect(screen.queryByTitle('Instant complete (0s duration)')).not.toBeInTheDocument();
        expect(screen.queryByPlaceholderText('Add a nano goal / sub-step...')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '×' })).not.toBeInTheDocument();
        expect(screen.queryByTitle('Micro Goal: Micro Goal')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Mark Complete' })).toBeInTheDocument();
        expect(screen.getByText('Mark this activity complete when finished.')).toBeInTheDocument();
    });

    it('renders the same metric input surface in quick and regular modes', () => {
        const regularRender = renderWithProviders(
            <SessionActivityItem
                exercise={baseExercise}
                isSelected={false}
                activityDefinition={quickModeDefinition}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        expect(screen.getByText('Weight')).toBeInTheDocument();
        expect(screen.getByDisplayValue('190')).toBeInTheDocument();

        regularRender.unmount();

        renderWithProviders(
            <SessionActivityItem
                exercise={baseExercise}
                quickMode
                isSelected={false}
                activityDefinition={quickModeDefinition}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        expect(screen.getByText('Weight')).toBeInTheDocument();
        expect(screen.getByDisplayValue('190')).toBeInTheDocument();
    });

    it('opens the modes modal and saves checked activity modes', async () => {
        getActivityModes.mockResolvedValue({
            data: [
                { id: 'mode-1', name: 'Standing', color: '#4488EE' },
                { id: 'mode-2', name: 'Tempo', color: '#55AA66' },
                { id: 'mode-3', name: 'Quality', color: '#DD8844' },
                { id: 'mode-4', name: 'Balance', color: '#AA66CC' },
            ],
        });

        renderWithProviders(
            <SessionActivityItem
                exercise={{
                    ...baseExercise,
                    modes: [
                        { id: 'mode-1', name: 'Standing', color: '#4488EE' },
                        { id: 'mode-2', name: 'Tempo', color: '#55AA66' },
                        { id: 'mode-3', name: 'Quality', color: '#DD8844' },
                    ],
                    mode_ids: ['mode-1', 'mode-2', 'mode-3'],
                }}
                isSelected={false}
                activityDefinition={quickModeDefinition}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        expect(screen.getAllByText('Standing').length).toBeGreaterThan(0);
        expect(screen.getByText('Tempo')).toBeInTheDocument();
        const hiddenModesButton = screen.getByRole('button', {
            name: 'Hidden modes: Quality. Click to edit modes.',
        });
        expect(hiddenModesButton).toHaveTextContent('+1 mode');
        expect(hiddenModesButton).toHaveAttribute('title', 'Quality');
        expect(screen.queryByText('Quality')).not.toBeInTheDocument();

        fireEvent.click(hiddenModesButton);

        const balanceCheckbox = await screen.findByLabelText('Balance');
        fireEvent.click(balanceCheckbox);
        fireEvent.click(screen.getByRole('button', { name: 'Save Modes' }));

        await waitFor(() => {
            expect(updateInstance).toHaveBeenCalledWith('quick-instance-1', {
                mode_ids: ['mode-1', 'mode-2', 'mode-3', 'mode-4'],
            });
        });
    });
});
