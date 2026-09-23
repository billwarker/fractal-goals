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


describe("SessionActivityItem metric and timer editing — timerLifecycle", () => {
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
it('applies a relative adjustment to the stop time from the header control', async () => {
        renderWithProviders(
            <SessionActivityItem
                exercise={{
                    id: 'instance-5',
                    session_id: 'session-1',
                    activity_definition_id: 'activity-1',
                    sets: [],
                    metrics: [],
                    time_start: '2026-07-04T13:21:14.000Z',
                    time_stop: '2026-07-04T13:30:14.000Z',
                    duration_seconds: 540
                }}
                onFocus={vi.fn()}
                isSelected
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

        fireEvent.click(screen.getByRole('button', { name: 'Adjust stop time' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'Relative stop adjustment' }), {
            target: { value: '-30S' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

        await waitFor(() => {
            expect(updateInstance).toHaveBeenCalledWith('instance-5', {
                time_stop: '2026-07-04T13:29:44.000Z',
            });
        });
    });

it('prevents relative timer adjustments that would create a negative duration', () => {
        renderWithProviders(
            <SessionActivityItem
                exercise={{
                    id: 'instance-negative-relative',
                    session_id: 'session-1',
                    activity_definition_id: 'activity-1',
                    sets: [],
                    metrics: [],
                    time_start: '2026-07-04T13:21:14.000Z',
                    time_stop: '2026-07-04T13:30:14.000Z',
                    duration_seconds: 540
                }}
                onFocus={vi.fn()}
                isSelected
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

        fireEvent.click(screen.getByRole('button', { name: 'Adjust stop time' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'Relative stop adjustment' }), {
            target: { value: '-30M' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

        expect(updateInstance).not.toHaveBeenCalled();
        expect(screen.getByText('Stop must be after start')).toBeInTheDocument();
    });

it('blurs the relative adjustment input on first outside click and closes on the next one', () => {
        renderWithProviders(
            <SessionActivityItem
                exercise={{
                    id: 'instance-adjust-click-off',
                    session_id: 'session-1',
                    activity_definition_id: 'activity-1',
                    sets: [],
                    metrics: [],
                    time_start: '2026-07-04T13:21:14.000Z',
                    time_stop: '2026-07-04T13:30:14.000Z',
                    duration_seconds: 540
                }}
                onFocus={vi.fn()}
                isSelected
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

        fireEvent.click(screen.getByRole('button', { name: 'Adjust stop time' }));
        const adjustmentInput = screen.getByRole('textbox', { name: 'Relative stop adjustment' });
        adjustmentInput.focus();
        expect(adjustmentInput).toHaveFocus();

        fireEvent.pointerDown(document.body);

        expect(adjustmentInput).not.toHaveFocus();
        expect(screen.getByRole('textbox', { name: 'Relative stop adjustment' })).toBeInTheDocument();

        fireEvent.pointerDown(document.body);

        expect(screen.queryByRole('textbox', { name: 'Relative stop adjustment' })).not.toBeInTheDocument();
    });

it('hides relative timer adjustment controls when the activity is not selected', () => {
        renderWithProviders(
            <SessionActivityItem
                exercise={{
                    id: 'instance-hidden-adjust',
                    session_id: 'session-1',
                    activity_definition_id: 'activity-1',
                    sets: [],
                    metrics: [],
                    time_start: '2026-07-04T13:21:14.000Z',
                    time_stop: '2026-07-04T13:30:14.000Z',
                    duration_seconds: 540
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

        expect(screen.queryByRole('button', { name: 'Adjust start time' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Adjust stop time' })).not.toBeInTheDocument();
    });

it('does not keep accruing a timer after the activity is marked complete', () => {
        vi.useFakeTimers();

        renderWithProviders(
            <SessionActivityItem
                exercise={{
                    id: 'instance-completed-session',
                    session_id: 'session-1',
                    activity_definition_id: 'activity-1',
                    sets: [],
                    metrics: [],
                    time_start: '2026-07-04T13:21:14.000Z',
                    time_stop: null,
                    duration_seconds: 540,
                    completed: true,
                    target_duration_seconds: 1,
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
                    has_splits: false,
                }}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        vi.advanceTimersByTime(3000);

        expect(updateTimer).not.toHaveBeenCalled();
        vi.useRealTimers();
    });
});
