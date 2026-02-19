import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SessionActivityItem from '../SessionActivityItem';

const createGoal = vi.fn(() => Promise.resolve({ id: 'nano-1' }));
const onAddNote = vi.fn(() => Promise.resolve());
const updateInstance = vi.fn(() => Promise.resolve());
const updateTimer = vi.fn();
const removeActivity = vi.fn();

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
        createGoal
    })
}));

vi.mock('../../../contexts/TimezoneContext', () => ({
    useTimezone: () => ({ timezone: 'UTC' })
}));

vi.mock('../../../contexts/ThemeContext', () => ({
    useTheme: () => ({
        getGoalColor: () => '#00aa00',
        getGoalSecondaryColor: () => '#005500',
        getScopedCharacteristics: () => ({ icon: 'circle' })
    })
}));

describe('SessionActivityItem nano note flow', () => {
    beforeEach(() => {
        createGoal.mockClear();
        onAddNote.mockClear();
        updateInstance.mockClear();
        updateTimer.mockClear();
        removeActivity.mockClear();
    });

    it('creates a nano goal note without runtime errors', async () => {
        render(
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
                onAddNote={onAddNote}
                onUpdateNote={vi.fn()}
                onDeleteNote={vi.fn()}
                onOpenGoals={vi.fn()}
                isDragging={false}
            />
        );

        fireEvent.click(screen.getByText('Add Nano Goal Note'));

        const textarea = screen.getByPlaceholderText('Add a nano goal / sub-step...');
        fireEvent.change(textarea, { target: { value: 'Do one strict rep' } });
        fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

        await waitFor(() => {
            expect(createGoal).toHaveBeenCalledTimes(1);
            expect(onAddNote).toHaveBeenCalledTimes(1);
        });
    });

    it('buffers single metric edits and commits on blur', async () => {
        render(
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
                onAddNote={onAddNote}
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
            />
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
});
