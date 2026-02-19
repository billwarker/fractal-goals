import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SessionActivityItem from '../SessionActivityItem';

const createGoal = vi.fn(() => Promise.resolve({ id: 'nano-1' }));
const onAddNote = vi.fn(() => Promise.resolve());

vi.mock('../../../contexts/ActiveSessionContext', () => ({
    useActiveSession: () => ({
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
        updateInstance: vi.fn(),
        updateTimer: vi.fn(),
        removeActivity: vi.fn(),
        createGoal,
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
        refreshSession: vi.fn()
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
});
