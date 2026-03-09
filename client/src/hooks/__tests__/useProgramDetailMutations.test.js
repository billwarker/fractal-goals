import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProgramDetailMutations } from '../useProgramDetailMutations';

const {
    mockActions,
    deleteSession,
    updateGoal,
    toggleGoalCompletion,
    deleteGoal,
    createGoal,
    refreshData,
    toast,
} = vi.hoisted(() => {
    const toastMock = vi.fn();
    toastMock.error = vi.fn();

    return {
        mockActions: {
            saveProgram: vi.fn(),
            saveBlock: vi.fn(),
            deleteBlock: vi.fn(),
            saveDay: vi.fn(),
            copyDay: vi.fn(),
            deleteDay: vi.fn(),
            unscheduleDay: vi.fn(),
            scheduleDay: vi.fn(),
            attachGoal: vi.fn(),
        },
        deleteSession: vi.fn(),
        updateGoal: vi.fn(),
        toggleGoalCompletion: vi.fn(),
        deleteGoal: vi.fn(),
        createGoal: vi.fn(),
        refreshData: vi.fn(),
        toast: toastMock,
    };
});

vi.mock('../useProgramLogic', () => ({
    useProgramLogic: () => mockActions,
}));

vi.mock('../../utils/api', () => ({
    fractalApi: {
        deleteSession: (...args) => deleteSession(...args),
        updateGoal: (...args) => updateGoal(...args),
        toggleGoalCompletion: (...args) => toggleGoalCompletion(...args),
        deleteGoal: (...args) => deleteGoal(...args),
        createGoal: (...args) => createGoal(...args),
    },
}));

vi.mock('react-hot-toast', () => ({
    toast,
}));

describe('useProgramDetailMutations', () => {
    const callbacks = {
        onProgramSaved: vi.fn(),
        onBlockSaved: vi.fn(),
        onDaySaved: vi.fn(),
        onAttachGoalSaved: vi.fn(),
        onScheduleDaySaved: vi.fn(),
        onUnscheduleFinished: vi.fn(),
        onGoalEditorClosed: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        Object.values(mockActions).forEach((mockFn) => mockFn.mockResolvedValue(undefined));
        refreshData.mockResolvedValue(undefined);
        deleteSession.mockResolvedValue(undefined);
        updateGoal.mockResolvedValue(undefined);
        toggleGoalCompletion.mockResolvedValue(undefined);
        deleteGoal.mockResolvedValue(undefined);
        createGoal.mockResolvedValue(undefined);
    });

    function renderMutations(overrides = {}) {
        return renderHook(() => useProgramDetailMutations({
            rootId: 'root-1',
            program: { id: 'program-1', blocks: [], goal_ids: [] },
            refreshData,
            timezone: 'UTC',
            sessions: [],
            selectedBlockId: 'block-1',
            dayModalInitialData: { id: 'day-1' },
            attachBlockId: 'block-2',
            selectedDate: '2026-03-10',
            itemToUnschedule: null,
            ...callbacks,
            ...overrides,
        }));
    }

    it('saves a day with the selected block/day context and closes the editor on success', async () => {
        const { result } = renderMutations();

        await act(async () => {
            await result.current.saveDay({ name: 'Intervals' });
        });

        expect(mockActions.saveDay).toHaveBeenCalledWith('block-1', 'day-1', { name: 'Intervals' });
        expect(callbacks.onDaySaved).toHaveBeenCalledTimes(1);
    });

    it('unschedules only matching recurring sessions for the selected date and always clears the confirmation state', async () => {
        const sessions = [
            {
                id: 'session-match',
                session_start: '2026-03-10T15:00:00Z',
                completed: false,
                program_day_id: 'day-template',
            },
            {
                id: 'session-other-date',
                session_start: '2026-03-11T15:00:00Z',
                completed: false,
                program_day_id: 'day-template',
            },
            {
                id: 'session-complete',
                session_start: '2026-03-10T18:00:00Z',
                completed: true,
                program_day_id: 'day-template',
            },
        ];

        const { result } = renderMutations({
            sessions,
            itemToUnschedule: {
                id: 'day-template',
                type: 'program_day',
                isRecurringTemplate: true,
                name: 'Template Day',
            },
        });

        await act(async () => {
            await result.current.unscheduleDay();
        });

        expect(deleteSession).toHaveBeenCalledTimes(1);
        expect(deleteSession).toHaveBeenCalledWith('root-1', 'session-match');
        expect(refreshData).toHaveBeenCalledTimes(1);
        expect(mockActions.unscheduleDay).not.toHaveBeenCalled();
        expect(callbacks.onUnscheduleFinished).toHaveBeenCalledTimes(1);
    });

    it('deletes a goal after confirmation, then refreshes and closes the goal editor', async () => {
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

        const { result } = renderMutations();

        await act(async () => {
            await result.current.deleteGoal({ id: 'goal-1', name: 'Goal 1' });
        });

        expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to delete "Goal 1" and all its children?');
        expect(deleteGoal).toHaveBeenCalledWith('root-1', 'goal-1');
        expect(callbacks.onGoalEditorClosed).toHaveBeenCalledTimes(1);
        expect(refreshData).toHaveBeenCalledTimes(1);

        confirmSpy.mockRestore();
    });
});
