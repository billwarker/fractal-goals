import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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


describe("SessionActivityItem metric and timer editing — metricDrafts", () => {
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
                    tags: [{ id: 'available-tag', name: 'Available activity tag' }],
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

        const activityTags = screen.getByRole('group', { name: 'Activity tags' });
        expect(within(activityTags.parentElement).getByRole('button', { name: 'Pull Up options' })).toBeInTheDocument();
        const addActivityTag = within(activityTags).getByRole('button', { name: 'Add tag' });
        expect(addActivityTag).toHaveTextContent('+Tag');
        expect(within(activityTags).queryByText('Available activity tag')).not.toBeInTheDocument();

        fireEvent.click(addActivityTag);
        expect(screen.getByRole('dialog', { name: 'Choose activity tags' })).toBeInTheDocument();
        expect(screen.getByText('Available activity tag')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Close tag picker' }));

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

it('evaluates arithmetic metric drafts before saving', async () => {
        renderWithProviders(
            <SessionActivityItem
                exercise={{
                    id: 'instance-arithmetic',
                    session_id: 'session-1',
                    activity_definition_id: 'activity-1',
                    sets: [],
                    metrics: [{ metric_id: 'm1', value: '5' }],
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
                isDragging={false}
                activityDefinition={{
                    id: 'activity-1',
                    name: 'Pull Up',
                    metric_definitions: [{ id: 'm1', name: 'Reps', unit: 'reps', input_type: 'integer' }],
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
        fireEvent.change(input, { target: { value: '5-2' } });
        fireEvent.blur(input);

        await waitFor(() => {
            expect(updateInstance).toHaveBeenCalledWith('instance-arithmetic', {
                metrics: [{ metric_id: 'm1', value: '3' }]
            });
        });
    });

it('keeps invalid arithmetic drafts local instead of saving them', async () => {
        renderWithProviders(
            <SessionActivityItem
                exercise={{
                    id: 'instance-invalid-arithmetic',
                    session_id: 'session-1',
                    activity_definition_id: 'activity-1',
                    sets: [],
                    metrics: [{ metric_id: 'm1', value: '5' }],
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
                isDragging={false}
                activityDefinition={{
                    id: 'activity-1',
                    name: 'Pull Up',
                    metric_definitions: [{ id: 'm1', name: 'Reps', unit: 'reps', input_type: 'number' }],
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

        const input = screen.getByDisplayValue('5.00');
        fireEvent.change(input, { target: { value: '5 / 0' } });
        fireEvent.blur(input);

        await waitFor(() => {
            expect(input).toHaveValue('5 / 0');
        });
        expect(updateInstance).not.toHaveBeenCalled();
    });

it('shows the session index and runs activity option actions', () => {
        const onDuplicate = vi.fn();
        const onClearValues = vi.fn();
        const onCopyPreviousValues = vi.fn();

        renderWithProviders(
            <SessionActivityItem
                exercise={{
                    id: 'instance-options',
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
                canMoveUp={true}
                canMoveDown={true}
                showReorderButtons
                sessionIndex={3}
                onDuplicate={onDuplicate}
                onClearValues={onClearValues}
                onCopyPreviousValues={onCopyPreviousValues}
                onNoteCreated={vi.fn()}
                allNotes={[]}
                onAddNote={vi.fn()}
                onUpdateNote={vi.fn()}
                onDeleteNote={vi.fn()}
                onOpenActivityBuilder={vi.fn()}
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

        expect(screen.getByText('#3')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Pull Up options' }));
        const optionsMenu = screen.getByRole('menu', { name: 'Pull Up activity options' });
        expect(optionsMenu.parentElement).toBe(document.body);
        expect(optionsMenu).toHaveStyle({ position: 'fixed' });
        fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate instance' }));
        expect(onDuplicate).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Pull Up options' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy values from previous instance' }));
        expect(onCopyPreviousValues).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Pull Up options' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Clear logged values' }));
        expect(onClearValues).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Pull Up options' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete from session' }));
        expect(removeActivity).toHaveBeenCalledWith('instance-options');
    });
});
