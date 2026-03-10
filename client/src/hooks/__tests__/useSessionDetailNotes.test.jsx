import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryKeys } from '../queryKeys';
import { useSessionDetailNotes } from '../useSessionDetailNotes';

const {
    deleteGoal,
    notify,
    useSessionNotes,
} = vi.hoisted(() => ({
    deleteGoal: vi.fn(),
    notify: {
        success: vi.fn(),
        error: vi.fn(),
    },
    useSessionNotes: vi.fn(),
}));

vi.mock('../../utils/api', () => ({
    fractalApi: {
        deleteGoal: (...args) => deleteGoal(...args),
    },
}));

vi.mock('../../utils/notify', () => ({
    default: notify,
}));

vi.mock('../useSessionNotes', () => ({
    default: (...args) => useSessionNotes(...args),
}));

function createWrapper(queryClient) {
    return function Wrapper({ children }) {
        return (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
    };
}

describe('useSessionDetailNotes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useSessionNotes.mockReturnValue({
            notes: [
                {
                    id: 'note-1',
                    content: 'Nano goal note',
                    is_nano_goal: true,
                    nano_goal_id: 'goal-1',
                },
            ],
            previousNotes: [],
            previousSessionNotes: [],
            addNote: vi.fn(),
            updateNote: vi.fn(),
            deleteNote: vi.fn(() => Promise.resolve()),
            refreshNotes: vi.fn(),
        });
    });

    it('deletes nano goals through the goal path and invalidates canonical goal/session families', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
            },
        });
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
        const updateGoal = vi.fn(() => Promise.resolve());
        deleteGoal.mockResolvedValueOnce({ data: { ok: true } });

        const { result } = renderHook(
            () => useSessionDetailNotes({
                rootId: 'root-1',
                sessionId: 'session-1',
                selectedActivity: { activity_definition_id: 'activity-1' },
                updateGoal,
            }),
            { wrapper: createWrapper(queryClient) }
        );

        await act(async () => {
            await result.current.deleteNote('note-1');
        });

        expect(updateGoal).toHaveBeenCalledWith({
            goalId: 'goal-1',
            updates: { isDeleting: true },
        });
        expect(deleteGoal).toHaveBeenCalledWith('root-1', 'goal-1');
        expect(useSessionNotes.mock.results[0].value.deleteNote).toHaveBeenCalledWith('note-1');
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.sessionGoalsView('root-1', 'session-1') });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.session('root-1', 'session-1') });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.fractalTree('root-1') });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.goals('root-1') });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.goalsForSelection('root-1') });
        expect(notify.success).toHaveBeenCalledWith('Deleted Nano Goal: Nano goal note');
    });

    it('shows a nano-goal specific success toast after note edits', async () => {
        const updateNote = vi.fn(() => Promise.resolve());
        useSessionNotes.mockReturnValueOnce({
            notes: [
                {
                    id: 'note-1',
                    content: 'Nano goal note',
                    is_nano_goal: true,
                    nano_goal_id: 'goal-1',
                },
            ],
            previousNotes: [],
            previousSessionNotes: [],
            addNote: vi.fn(),
            updateNote,
            deleteNote: vi.fn(),
            refreshNotes: vi.fn(),
        });

        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
            },
        });

        const { result } = renderHook(
            () => useSessionDetailNotes({
                rootId: 'root-1',
                sessionId: 'session-1',
                selectedActivity: { activity_definition_id: 'activity-1' },
                updateGoal: vi.fn(),
            }),
            { wrapper: createWrapper(queryClient) }
        );

        await act(async () => {
            await result.current.updateNote('note-1', 'Updated nano goal');
        });

        expect(updateNote).toHaveBeenCalledWith('note-1', 'Updated nano goal');
        expect(notify.success).toHaveBeenCalledWith('Updated Nano Goal: Updated nano goal');
    });
});
