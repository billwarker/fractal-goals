import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import SessionActivityItem from '../SessionActivityItem';

const {
    updateInstance,
    updateTimer,
    removeActivity,
    useProgressComparison,
} = vi.hoisted(() => ({
    updateInstance: vi.fn(() => Promise.resolve()),
    updateTimer: vi.fn(),
    removeActivity: vi.fn(),
    useProgressComparison: vi.fn(() => ({ progressComparison: null })),
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
        session: { immediate_goals: [{ id: 'ig-1' }] },
    }),
    useActiveSessionActions: () => ({
        updateInstance,
        updateTimer,
        removeActivity,
    })
}));

vi.mock('../../../hooks/useProgressComparison', () => ({
    useProgressComparison: (...args) => useProgressComparison(...args),
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

describe('SessionActivityItem metric and timer editing', () => {
    beforeEach(() => {
        updateInstance.mockClear();
        updateTimer.mockClear();
        removeActivity.mockClear();
        useProgressComparison.mockReset();
        useProgressComparison.mockReturnValue({ progressComparison: null });
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
        useProgressComparison.mockReset();
        useProgressComparison.mockReturnValue({ progressComparison: null });
    });

    it('renders timer controls, notes, and delete button in regular mode', () => {
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

        expect(screen.getByTitle('Start timer')).toBeInTheDocument();
        expect(screen.getByTitle('Instant complete (0s duration)')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Delete activity' })).toBeInTheDocument();
    });

    it('starts countdown mode when a valid MM:SS target is entered', () => {
        renderWithProviders(
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

        fireEvent.change(screen.getByPlaceholderText('MM:SS'), { target: { value: '01:30' } });
        expect(screen.getByText('Countdown 01:30')).toBeInTheDocument();
        fireEvent.click(screen.getByTitle('Start timer'));

        expect(updateTimer).toHaveBeenCalledWith('quick-instance-1', 'start', {
            target_duration_seconds: 90,
        });
    });

    it('rejects invalid countdown targets before starting', () => {
        renderWithProviders(
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

        fireEvent.change(screen.getByPlaceholderText('MM:SS'), { target: { value: '01:99' } });
        fireEvent.click(screen.getByTitle('Start timer'));

        expect(updateTimer).not.toHaveBeenCalled();
        expect(screen.getByText('Use MM:SS, seconds 00-59')).toBeInTheDocument();
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

    it('renders completion button and hides timer controls in quick mode', () => {
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
        expect(screen.queryByRole('button', { name: '×' })).not.toBeInTheDocument();
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

    it('renders progress inline beside the metric unit without summary badges', () => {
        useProgressComparison.mockReturnValue({
            progressComparison: {
                is_first_instance: false,
                metric_comparisons: [
                    {
                        metric_id: 'm1',
                        metric_name: 'Weight',
                        unit: 'lbs',
                        previous_value: 185,
                        current_value: 190,
                        delta: 5,
                        pct_change: 2.7,
                        improved: true,
                        regressed: false,
                    },
                ],
            },
        });

        renderWithProviders(
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

        expect(screen.getByText('lbs')).toBeInTheDocument();
        expect(screen.getByText('(last 185)')).toBeInTheDocument();
        expect(screen.queryByText(/new personal best/i)).not.toBeInTheDocument();
    });

    it('shows previous metric references before the user enters a value', () => {
        useProgressComparison.mockReturnValue({
            progressComparison: {
                is_first_instance: false,
                metric_comparisons: [
                    {
                        metric_id: 'm1',
                        metric_name: 'Weight',
                        unit: 'lbs',
                        previous_value: 185,
                        current_value: null,
                        delta: null,
                        pct_change: null,
                        improved: false,
                        regressed: false,
                    },
                ],
            },
        });

        renderWithProviders(
            <SessionActivityItem
                exercise={{ ...baseExercise, metrics: [] }}
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

        expect(screen.getByText('(last 185)')).toBeInTheDocument();
    });

    it('hydrates persisted progress for completed activities after refresh', () => {
        useProgressComparison.mockReturnValue({
            progressComparison: {
                is_first_instance: false,
                metric_comparisons: [
                    {
                        metric_definition_id: 'm1',
                        metric_name: 'Weight',
                        unit: 'lbs',
                        previous_value: 185,
                        current_value: 190,
                        delta: 5,
                        pct_change: 2.7,
                        improved: true,
                        regressed: false,
                    },
                ],
            },
        });

        renderWithProviders(
            <SessionActivityItem
                exercise={{
                    ...baseExercise,
                    completed: true,
                    time_start: '2026-04-10T17:38:58Z',
                    time_stop: '2026-04-10T17:39:58Z',
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

        expect(useProgressComparison).toHaveBeenCalledWith(
            'root-1',
            'quick-instance-1',
            { enabled: true }
        );
        expect(screen.getByText('(▲2.7%)')).toBeInTheDocument();
    });

    it('shows a last-aggregation progress hint only on the driving set row', () => {
        useProgressComparison.mockReturnValue({
            progressComparison: {
                is_first_instance: false,
                metric_comparisons: [
                    {
                        metric_id: 'm1',
                        metric_name: 'Speed',
                        aggregation: 'last',
                        previous_value: 20,
                        current_value: 23,
                        delta: 3,
                        pct_change: 15,
                        improved: true,
                        regressed: false,
                    },
                ],
            },
        });

        renderWithProviders(
            <SessionActivityItem
                exercise={{
                    id: 'set-instance-1',
                    session_id: 'session-1',
                    activity_definition_id: 'activity-1',
                    completed: true,
                    sets: [
                        { instance_id: 'set-1', metrics: [{ metric_id: 'm1', value: '400' }] },
                        { instance_id: 'set-2', metrics: [{ metric_id: 'm1', value: '23' }] },
                    ],
                    time_start: '2026-04-10T17:38:58Z',
                    time_stop: '2026-04-10T17:39:58Z',
                    duration_seconds: 60,
                }}
                isSelected={false}
                activityDefinition={{
                    id: 'activity-1',
                    name: 'Bernth Pinky Control Exercise',
                    has_sets: true,
                    has_metrics: true,
                    metric_definitions: [
                        {
                            id: 'm1',
                            name: 'Speed',
                            unit: 'BPM',
                            progress_aggregation: 'last',
                        },
                    ],
                    split_definitions: [],
                }}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        expect(screen.getAllByText('(▲15%)')).toHaveLength(1);
    });

    it('uses the lower-is-better best-set anchor when placing max hints across set rows', () => {
        useProgressComparison.mockReturnValue({
            progressComparison: {
                is_first_instance: false,
                metric_comparisons: [
                    {
                        metric_id: 'm2',
                        metric_name: 'Reps',
                        aggregation: 'max',
                        previous_value: 7,
                        current_value: null,
                        delta: null,
                        pct_change: null,
                        improved: false,
                        regressed: false,
                        set_comparisons: [],
                    },
                ],
            },
        });

        renderWithProviders(
            <SessionActivityItem
                exercise={{
                    id: 'set-instance-2',
                    session_id: 'session-1',
                    activity_definition_id: 'activity-1',
                    completed: false,
                    sets: [
                        {
                            instance_id: 'set-1',
                            metrics: [
                                { metric_id: 'm1', value: '60' },
                                { metric_id: 'm2', value: '10' },
                            ],
                        },
                        {
                            instance_id: 'set-2',
                            metrics: [
                                { metric_id: 'm1', value: '55' },
                                { metric_id: 'm2', value: '8' },
                            ],
                        },
                    ],
                    time_start: '2026-04-10T17:38:58Z',
                    time_stop: null,
                    duration_seconds: null,
                }}
                isSelected={false}
                activityDefinition={{
                    id: 'activity-1',
                    name: 'Interval Drill',
                    has_sets: true,
                    has_metrics: true,
                    metric_definitions: [
                        {
                            id: 'm1',
                            name: 'Time',
                            unit: 's',
                            is_best_set_metric: true,
                            higher_is_better: false,
                        },
                        {
                            id: 'm2',
                            name: 'Reps',
                            unit: 'reps',
                            progress_aggregation: 'max',
                        },
                    ],
                    split_definitions: [],
                }}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        const setRows = screen.getAllByText(/^#\d+$/).map((label) => label.parentElement);
        expect(setRows).toHaveLength(2);
        expect(within(setRows[0]).queryByText('(last 7)')).not.toBeInTheDocument();
        expect(within(setRows[1]).getByText('(last 7)')).toBeInTheDocument();
    });

});
