import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
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


describe("SessionActivityItem quick mode — progress", () => {
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

it('hydrates dynamic progress for completed activities after refresh', () => {
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
                    tags: [{ id: 'parent-tag', name: 'Parent tag' }],
                    sets: [
                        {
                            id: 'set-1',
                            instance_id: 'set-1',
                            tags: [{ id: 'set-tag', name: 'Set-specific tag' }],
                            inherited_tags: [{ id: 'parent-tag', name: 'Parent tag' }],
                            metrics: [{ metric_id: 'm1', value: '400' }],
                        },
                        { instance_id: 'set-2', metrics: [{ metric_id: 'm1', value: '23' }] },
                    ],
                    time_start: '2026-04-10T17:38:58Z',
                    time_stop: '2026-04-10T17:39:58Z',
                    duration_seconds: 60,
                }}
                isSelected
                activityDefinition={{
                    id: 'activity-1',
                    name: 'Bernth Pinky Control Exercise',
                    has_sets: true,
                    has_metrics: true,
                    tags: [
                        { id: 'parent-tag', name: 'Parent tag' },
                        { id: 'set-tag', name: 'Set-specific tag' },
                        { id: 'unused-tag', name: 'Available set tag' },
                    ],
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
        const firstSetRow = screen.getByText('#1').parentElement;
        fireEvent.click(firstSetRow);
        const setTags = within(firstSetRow).getByRole('group', { name: 'Set tags' });
        expect(setTags.parentElement.parentElement.nextElementSibling).toHaveAccessibleName('Remove set');
        expect(within(setTags).getByText('Set-specific tag')).toBeInTheDocument();
        expect(within(setTags).queryByText('Parent tag')).not.toBeInTheDocument();
        expect(within(setTags).queryByText('Available set tag')).not.toBeInTheDocument();
        expect(within(screen.getByText('#2').parentElement).queryByRole('button', { name: 'Add tag' })).not.toBeInTheDocument();
        fireEvent.click(within(setTags).getByRole('button', { name: 'Add tag' }));
        expect(screen.getByRole('dialog', { name: 'Choose set tags' })).toHaveTextContent('Available set tag');
        expect(screen.getByRole('dialog', { name: 'Choose set tags' })).not.toHaveTextContent('Parent tag');
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
                            id: 'set-1',
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
        expect(screen.queryByRole('button', { name: 'Add tag' })).not.toBeInTheDocument();
        expect(within(setRows[0]).queryByText('(last 7)')).not.toBeInTheDocument();
        expect(within(setRows[1]).getByText('(last 7)')).toBeInTheDocument();
    });
});
