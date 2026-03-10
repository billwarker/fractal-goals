import React from 'react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSessionSidePaneViewModel } from '../useSessionSidePaneViewModel';

const {
    toggleSessionComplete,
    pauseSession,
    resumeSession,
    useActiveSessionData,
    useActiveSessionActions,
} = vi.hoisted(() => ({
    toggleSessionComplete: vi.fn(),
    pauseSession: vi.fn(),
    resumeSession: vi.fn(),
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
            pauseSession,
            resumeSession,
        });
    });

    it('builds a narrow side-pane model with derived notes and history inputs', () => {
        const onModeChange = vi.fn();
        const onSave = vi.fn();
        const onDelete = vi.fn();
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
            onSave,
            onDelete,
            onOpenGoals,
            mode: 'details',
            onModeChange,
        }));

        expect(result.current.mode).toBe('details');
        expect(result.current.onModeChange).toBe(onModeChange);
        expect(result.current.details).toMatchObject({
            isCompleted: false,
            isPaused: false,
            onToggleComplete: toggleSessionComplete,
            onSave,
            onDelete,
        });
        expect(result.current.details.notesPanelProps).toMatchObject({
            rootId: 'root-1',
            sessionId: 'session-1',
            selectedActivity,
            selectedActivityDef: { id: 'activity-1', name: 'Squat' },
            selectedSetIndex: 1,
            notes: [{ id: 'note-1' }],
            previousNotes: [{ id: 'prev-note-1' }],
            previousSessionNotes: [{ id: 'prev-session-1' }],
            addNote,
            updateNote,
            deleteNote,
        });
        expect(result.current.goals).toMatchObject({
            selectedActivity,
            onGoalClick,
            onGoalCreated,
            onOpenGoals,
        });
        expect(result.current.history).toEqual({
            rootId: 'root-1',
            sessionId: 'session-1',
            selectedActivity,
            sessionActivityDefs: [
                { id: 'activity-1', name: 'Squat' },
                { id: 'activity-2', name: 'Bench' },
            ],
        });
    });

    it('uses resume when the session is paused', () => {
        useActiveSessionData.mockReturnValueOnce({
            rootId: 'root-1',
            sessionId: 'session-1',
            session: {
                id: 'session-1',
                is_paused: true,
                attributes: {
                    completed: true,
                },
            },
            activityInstances: [],
            activities: [],
        });

        const { result } = renderHook(() => useSessionSidePaneViewModel({
            selectedActivity: null,
            selectedSetIndex: null,
            onNoteAdded: vi.fn(),
            onGoalClick: vi.fn(),
            onGoalCreated: vi.fn(),
            notes: [],
            previousNotes: [],
            previousSessionNotes: [],
            addNote: vi.fn(),
            updateNote: vi.fn(),
            deleteNote: vi.fn(),
            onSave: vi.fn(),
            onDelete: vi.fn(),
            onOpenGoals: vi.fn(),
            mode: 'details',
            onModeChange: vi.fn(),
        }));

        result.current.details.onPauseResume();

        expect(resumeSession).toHaveBeenCalledTimes(1);
        expect(pauseSession).not.toHaveBeenCalled();
    });
});
