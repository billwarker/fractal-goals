import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
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


describe("SessionActivityItem quick mode — quickEntry", () => {
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
        expect(screen.queryByRole('button', { name: 'Add tag' })).not.toBeInTheDocument();
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
        expect(screen.getByRole('button', { name: '✓ Complete' })).toBeInTheDocument();
        expect(screen.getByText('Mark this activity complete when finished.')).toBeInTheDocument();
    });

it('keeps the completion button in the last timer action slot across timer states', () => {
        const timerActionsFor = (exercise) => {
            const { unmount } = renderWithProviders(
                <SessionActivityItem
                    exercise={exercise}
                    isSelected
                    activityDefinition={quickModeDefinition}
                />,
                {
                    withTimezone: false,
                    withAuth: false,
                    withGoalLevels: false,
                    withTheme: false,
                }
            );

            const completion = screen.getByTitle(/complete/i);
            const row = completion.parentElement;
            const position = Array.from(row.children).indexOf(completion);
            const result = { count: row.children.length, position };
            unmount();
            return result;
        };

        // Not started: [Start] [Complete]
        const planned = timerActionsFor({ ...baseExercise, time_start: null, time_stop: null });
        // Running: Start unmounts, Reset takes its slot -> [Reset] [Complete]
        const running = timerActionsFor({
            ...baseExercise,
            time_start: '2026-08-25T14:24:23.000Z',
            time_stop: null,
        });

        expect(planned.position).toBe(planned.count - 1);
        expect(running.position).toBe(running.count - 1);
        expect(running.position).toBe(planned.position);
    });

it('shows a started instance as complete once the session cascade marks it completed', () => {
        renderWithProviders(
            <SessionActivityItem
                exercise={{
                    ...baseExercise,
                    time_start: '2026-08-25T14:24:23.000Z',
                    time_stop: null,
                    completed: true,
                }}
                isSelected
                activityDefinition={quickModeDefinition}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        // Completed instances expose a status, not an actionable Complete button.
        expect(screen.getByRole('status', { name: /completed/i })).toBeInTheDocument();
        expect(screen.queryByTitle('Complete activity')).not.toBeInTheDocument();
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
});
