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


describe("SessionActivityItem metric and timer editing — timerDrafts", () => {
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

        fireEvent.change(startInput, { target: { value: '2026-01-01 01:15' } });
        expect(updateInstance).not.toHaveBeenCalled();
        fireEvent.blur(startInput);

        await waitFor(() => {
            expect(updateInstance).toHaveBeenCalledTimes(1);
        });
        expect(updateInstance).toHaveBeenCalledWith('instance-3', {
            time_start: '2026-01-01T01:15:00.000Z'
        });
    });

it('keeps invalid timer edits visible and does not save them', async () => {
        renderWithProviders(
            <SessionActivityItem
                exercise={{
                    id: 'instance-invalid-time',
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
        fireEvent.change(startInput, { target: { value: '2026-99-99 10:00:00' } });
        fireEvent.blur(startInput);

        expect(updateInstance).not.toHaveBeenCalled();
        expect(startInput).toHaveValue('2026-99-99 10:00:00');
        expect(screen.getByText('Use YYYY-MM-DD HH:MM:SS')).toBeInTheDocument();
    });

it('keeps a valid timer draft visible and shows the server error when persistence fails', async () => {
        const saveError = new Error('conflicting historical interval');
        saveError.response = { data: { error: 'Timer overlaps another work interval' } };
        updateInstance.mockResolvedValueOnce({ error: saveError });

        renderWithProviders(
            <SessionActivityItem
                exercise={{
                    id: 'instance-failed-time',
                    session_id: 'session-1',
                    activity_definition_id: 'activity-1',
                    sets: [],
                    metrics: [],
                    time_start: '2026-01-01T00:00:00.000Z',
                    time_stop: '2026-01-01T02:00:00.000Z',
                    duration_seconds: 7200,
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
            },
        );

        const [startInput] = screen.getAllByPlaceholderText('YYYY-MM-DD HH:MM:SS');
        fireEvent.change(startInput, { target: { value: '2026-01-01 01:00:00' } });
        fireEvent.blur(startInput);

        await waitFor(() => {
            expect(screen.getByText('Timer overlaps another work interval')).toBeInTheDocument();
        });
        expect(startInput).toHaveValue('2026-01-01 01:00:00');
    });

it('applies a relative adjustment to the start time from the header control', async () => {
        renderWithProviders(
            <SessionActivityItem
                exercise={{
                    id: 'instance-4',
                    session_id: 'session-1',
                    activity_definition_id: 'activity-1',
                    sets: [],
                    metrics: [],
                    time_start: '2026-07-04T13:21:14.000Z',
                    time_stop: '2026-07-04T13:40:14.000Z',
                    duration_seconds: 1140
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

        fireEvent.click(screen.getByRole('button', { name: 'Adjust start time' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'Relative start adjustment' }), {
            target: { value: '+10M' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

        await waitFor(() => {
            expect(updateInstance).toHaveBeenCalledWith('instance-4', {
                time_start: '2026-07-04T13:31:14.000Z',
            });
        });
    });

it('prevents direct timer edits that would create a negative duration', () => {
        renderWithProviders(
            <SessionActivityItem
                exercise={{
                    id: 'instance-negative-direct',
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

        const [, stopInput] = screen.getAllByPlaceholderText('YYYY-MM-DD HH:MM:SS');
        fireEvent.change(stopInput, { target: { value: '2026-07-04 13:11:34' } });
        fireEvent.blur(stopInput);

        expect(updateInstance).not.toHaveBeenCalled();
        expect(stopInput).toHaveValue('2026-07-04 13:11:34');
        expect(screen.getByText('Stop must be after start')).toBeInTheDocument();
    });
});
