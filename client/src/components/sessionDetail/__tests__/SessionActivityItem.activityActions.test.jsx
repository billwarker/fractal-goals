import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import SessionActivityItem from '../SessionActivityItem';
const {
    updateInstance,
    updateTimer,
    removeActivity,
    copyActivityValuesFromSource,
    useProgressComparison,
    useActivityHistory,
} = vi.hoisted(() => ({
    updateInstance: vi.fn(() => Promise.resolve()),
    updateTimer: vi.fn(),
    removeActivity: vi.fn(),
    copyActivityValuesFromSource: vi.fn(() => Promise.resolve()),
    useProgressComparison: vi.fn(() => ({ progressComparison: null })),
    useActivityHistory: vi.fn(() => ({ history: [], loading: false, error: null })),
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
        session: { session_goals: [{ id: 'ig-1' }] },
    }),
    useActiveSessionActions: () => ({
        updateInstance,
        updateTimer,
        removeActivity,
        copyActivityValuesFromSource,
    })
}));

vi.mock('../../../hooks/useActivityHistory', () => ({
    useActivityHistory: (...args) => useActivityHistory(...args),
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


describe("SessionActivityItem metric and timer editing — activityActions", () => {
beforeEach(() => {
        updateInstance.mockClear();
        updateTimer.mockClear();
        removeActivity.mockClear();
        copyActivityValuesFromSource.mockClear();
        useProgressComparison.mockReset();
        useProgressComparison.mockReturnValue({ progressComparison: null });
        useActivityHistory.mockReset();
        useActivityHistory.mockReturnValue({ history: [], loading: false, error: null });
    });
it('shows copy previous values from historical activity history when there is no current-session previous instance', async () => {
        const previousInstance = {
            id: 'history-inst-1',
            activity_definition_id: 'activity-1',
            sets: [
                {
                    instance_id: 'history-set-1',
                    completed: true,
                    metrics: [{ metric_id: 'm1', value: 8 }],
                },
            ],
        };
        useActivityHistory.mockReturnValue({ history: [previousInstance], loading: false, error: null });

        renderWithProviders(
            <SessionActivityItem
                exercise={{
                    id: 'instance-history-target',
                    session_id: 'session-1',
                    activity_definition_id: 'activity-1',
                    sets: [],
                    metrics: [],
                    time_start: null,
                    time_stop: null,
                    duration_seconds: 0
                }}
                onFocus={vi.fn()}
                isSelected
                onReorder={vi.fn()}
                canMoveUp={false}
                canMoveDown={false}
                showReorderButtons
                sessionIndex={1}
                onDuplicate={vi.fn()}
                onClearValues={vi.fn()}
                onNoteCreated={vi.fn()}
                allNotes={[]}
                onAddNote={vi.fn()}
                onUpdateNote={vi.fn()}
                onDeleteNote={vi.fn()}
                isDragging={false}
                activityDefinition={{
                    id: 'activity-1',
                    name: 'Pull Up',
                    metric_definitions: [{ id: 'm1', name: 'Reps', unit: 'reps' }],
                    split_definitions: [],
                    has_sets: true,
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

        expect(useActivityHistory).toHaveBeenCalledWith('root-1', 'activity-1', 'session-1', {
            limit: 1,
            enabled: true,
        });

        fireEvent.click(screen.getByRole('button', { name: 'Pull Up options' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy values from previous instance' }));

        expect(copyActivityValuesFromSource).toHaveBeenCalledWith('instance-history-target', previousInstance);
    });

it('applies metric defaults, presets, integer bounds, and duration formatting', async () => {
        const boundedMetricDefinition = {
            id: 'activity-1',
            name: 'Skill Hold',
            metric_definitions: [
                {
                    id: 'm1',
                    name: 'Reps',
                    unit: 'reps',
                    input_type: 'integer',
                    default_value: 5,
                    predefined_values: [5, 7],
                    min_value: 1,
                    max_value: 10,
                },
            ],
            split_definitions: [],
            has_sets: false,
            has_splits: false,
        };

        renderWithProviders(
            <SessionActivityItem
                exercise={{
                    id: 'instance-defaults',
                    session_id: 'session-1',
                    activity_definition_id: 'activity-1',
                    sets: [],
                    metrics: [],
                    time_start: null,
                    time_stop: null,
                    duration_seconds: 0,
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
                activityDefinition={boundedMetricDefinition}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        await waitFor(() => {
            expect(updateInstance).toHaveBeenCalledWith('instance-defaults', {
                metrics: [{ metric_id: 'm1', value: '5' }],
            });
        });

        updateInstance.mockClear();
    });

it('normalizes configured metric inputs when committing edits', async () => {
        const activityDefinition = {
            id: 'activity-1',
            name: 'Skill Hold',
            metric_definitions: [
                {
                    id: 'm1',
                    name: 'Reps',
                    unit: 'reps',
                    input_type: 'integer',
                    predefined_values: [5, 7],
                    min_value: 1,
                    max_value: 10,
                },
                {
                    id: 'm2',
                    name: 'Hold Time',
                    unit: 'sec',
                    input_type: 'duration',
                    predefined_values: [30, 90],
                },
            ],
            split_definitions: [],
            has_sets: false,
            has_splits: false,
        };

        renderWithProviders(
            <SessionActivityItem
                exercise={{
                    id: 'instance-configured',
                    session_id: 'session-1',
                    activity_definition_id: 'activity-1',
                    sets: [],
                    metrics: [
                        { metric_id: 'm1', value: '5' },
                        { metric_id: 'm2', value: '90' },
                    ],
                    time_start: null,
                    time_stop: null,
                    duration_seconds: 0,
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
                activityDefinition={activityDefinition}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        expect(screen.queryByRole('button', { name: '7' })).not.toBeInTheDocument();
        expect(screen.queryByText('Allowed: 5, 7')).not.toBeInTheDocument();

        fireEvent.change(screen.getByDisplayValue('5'), { target: { value: '7' } });
        await waitFor(() => {
            expect(updateInstance).toHaveBeenCalledWith('instance-configured', {
                metrics: [
                    { metric_id: 'm1', value: '7' },
                    { metric_id: 'm2', value: '90' },
                ],
            });
        });

        updateInstance.mockClear();
        const repsInput = screen.getByDisplayValue('5');
        fireEvent.change(repsInput, { target: { value: '99' } });
        await waitFor(() => {
            expect(updateInstance).toHaveBeenCalledWith('instance-configured', {
                metrics: [
                    { metric_id: 'm1', value: '' },
                    { metric_id: 'm2', value: '90' },
                ],
            });
        });

        updateInstance.mockClear();
        expect(screen.queryByText('Allowed: 00:30, 01:30')).not.toBeInTheDocument();
        const durationInput = screen.getAllByRole('combobox')[1];
        fireEvent.change(durationInput, { target: { value: '30' } });
        await waitFor(() => {
            expect(updateInstance).toHaveBeenCalledWith('instance-configured', {
                metrics: [
                    { metric_id: 'm1', value: '5' },
                    { metric_id: 'm2', value: '30' },
                ],
            });
        });
    });
});
