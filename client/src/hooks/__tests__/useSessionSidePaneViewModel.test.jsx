import React from 'react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSessionSidePaneViewModel } from '../useSessionSidePaneViewModel';

const {
    toggleSessionComplete,
    useActiveSessionData,
    useActiveSessionActions,
} = vi.hoisted(() => ({
    toggleSessionComplete: vi.fn(),
    useActiveSessionData: vi.fn(),
    useActiveSessionActions: vi.fn(),
}));

vi.mock('../../contexts/ActiveSessionContext', () => ({
    useActiveSessionData: (...args) => useActiveSessionData(...args),
    useActiveSessionActions: (...args) => useActiveSessionActions(...args),
}));

describe('useSessionSidePaneViewModel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useActiveSessionData.mockReturnValue({
            rootId: 'root-1',
            sessionId: 'session-1',
            session: {
                id: 'session-1',
                is_paused: false,
                attributes: {
                    completed: false,
                },
            },
            activityInstances: [
                { id: 'inst-1', activity_definition_id: 'activity-1' },
                { id: 'inst-2', activity_definition_id: 'activity-2' },
            ],
            activities: [
                { id: 'activity-1', name: 'Squat' },
                { id: 'activity-2', name: 'Bench' },
                { id: 'activity-3', name: 'Row' },
            ],
        });
        useActiveSessionActions.mockReturnValue({
            toggleSessionComplete,
        });
    });

    it('builds a narrow side-pane model with derived notes and timeline inputs', () => {
        const onModeChange = vi.fn();
        const onOptions = vi.fn();
        const onNoteAdded = vi.fn();
        const onGoalClick = vi.fn();
        const onGoalCreated = vi.fn();
        const onOpenGoals = vi.fn();
        const addNote = vi.fn();
        const updateNote = vi.fn();
        const deleteNote = vi.fn();
        const selectedActivity = { id: 'inst-1', activity_definition_id: 'activity-1' };

        const { result } = renderHook(() => useSessionSidePaneViewModel({
            selectedActivity,
            selectedSetIndex: 1,
            onNoteAdded,
            onGoalClick,
            onGoalCreated,
            notes: [{ id: 'note-1' }],
            previousNotes: [{ id: 'prev-note-1' }],
            previousSessionNotes: [{ id: 'prev-session-1' }],
            addNote,
            updateNote,
            deleteNote,
            onOptions,
            onOpenGoals,
            mode: 'details',
            onModeChange,
        }));

        expect(result.current.mode).toBe('details');
        expect(result.current.onModeChange).toBe(onModeChange);
        expect(result.current.details).toMatchObject({
            isCompleted: false,
            onToggleComplete: toggleSessionComplete,
            onOptions,
        });
        expect(result.current.goals).toMatchObject({
            selectedActivity,
            onGoalClick,
            onGoalCreated,
            onOpenGoals,
        });
        expect(result.current.timeline).toEqual({
            rootId: 'root-1',
            sessionId: 'session-1',
            selectedActivity,
            sessionActivityDefs: [
                { id: 'activity-1', name: 'Squat' },
                { id: 'activity-2', name: 'Bench' },
            ],
            onNoteAdded,
            notes: [{ id: 'note-1' }],
            previousSessionNotes: [{ id: 'prev-session-1' }],
            addNote,
            updateNote,
            deleteNote,
            pinNote: undefined,
            unpinNote: undefined,
        });
    });
});
