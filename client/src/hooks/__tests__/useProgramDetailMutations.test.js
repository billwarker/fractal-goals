import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProgramDetailMutations } from '../useProgramDetailMutations';

const {
    mockActions,
    updateGoal,
    toggleGoalCompletion,
    deleteGoal,
    createGoal,
    refreshData,
    notify,
} = vi.hoisted(() => {
    return {
        mockActions: {
            saveProgram: vi.fn(),
            saveBlock: vi.fn(),
            deleteBlock: vi.fn(),
            saveDay: vi.fn(),
            duplicateDay: vi.fn(),
            deleteDay: vi.fn(),
            scheduleDay: vi.fn(),
            attachGoal: vi.fn(),
        },
        updateGoal: vi.fn(),
        toggleGoalCompletion: vi.fn(),
        deleteGoal: vi.fn(),
        createGoal: vi.fn(),
        refreshData: vi.fn(),
        notify: {
            success: vi.fn(),
            error: vi.fn(),
        },
    };
});

vi.mock('../useProgramLogic', () => ({
    useProgramLogic: () => mockActions,
}));

vi.mock('../../utils/api', () => ({
    fractalApi: {
        updateGoal: (...args) => updateGoal(...args),
        toggleGoalCompletion: (...args) => toggleGoalCompletion(...args),
        deleteGoal: (...args) => deleteGoal(...args),
        createGoal: (...args) => createGoal(...args),
    },
}));

vi.mock('../../utils/notify', () => ({
    default: notify,
}));

describe('useProgramDetailMutations', () => {
    const refreshers = {
        all: vi.fn(),
        program: vi.fn(),
        programGoals: vi.fn(),
        scheduling: vi.fn(),
    };

    const callbacks = {
        onProgramSaved: vi.fn(),
        onBlockSaved: vi.fn(),
        onDaySaved: vi.fn(),
        onAttachGoalSaved: vi.fn(),
        onScheduleDaySaved: vi.fn(),
        onGoalEditorClosed: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        Object.values(mockActions).forEach((mockFn) => mockFn.mockResolvedValue(undefined));
        refreshData.mockResolvedValue(undefined);
        updateGoal.mockResolvedValue(undefined);
        toggleGoalCompletion.mockResolvedValue(undefined);
        deleteGoal.mockResolvedValue(undefined);
        createGoal.mockResolvedValue(undefined);
        Object.values(refreshers).forEach((mockFn) => mockFn.mockResolvedValue(undefined));
    });

    function renderMutations(overrides = {}) {
        return renderHook(() => useProgramDetailMutations({
            rootId: 'root-1',
            program: { id: 'program-1', blocks: [], goal_ids: [] },
            refreshData,
            refreshers,
            dayModalInitialData: { id: 'day-1' },
            attachBlockId: 'block-2',
            ...callbacks,
            ...overrides,
        }));
    }

    it('saves the edited program day and hands the saved day to the caller', async () => {
        mockActions.saveDay.mockResolvedValueOnce({ id: 'day-1', name: 'Intervals' });
        const { result } = renderMutations();

        await act(async () => {
            await result.current.saveDay({ name: 'Intervals' });
        });

        expect(mockActions.saveDay).toHaveBeenCalledWith('day-1', { name: 'Intervals' });
        expect(callbacks.onDaySaved).toHaveBeenCalledWith({ id: 'day-1', name: 'Intervals' });
        expect(notify.success).toHaveBeenCalledWith('Day saved');
    });

    it('creates a new program day when no day is being edited', async () => {
        mockActions.saveDay.mockResolvedValueOnce({ id: 'day-9', name: 'Legs' });
        const { result } = renderMutations({ dayModalInitialData: null });

        await act(async () => {
            await result.current.saveDay({ name: 'Legs' });
        });

        expect(mockActions.saveDay).toHaveBeenCalledWith(null, { name: 'Legs' });
        expect(notify.success).toHaveBeenCalledWith('Program day created');
    });

    it('returns updated goals and leaves edit-save success toast ownership to the caller', async () => {
        updateGoal.mockResolvedValueOnce({
            data: { id: 'goal-1', name: 'Updated goal' },
        });
        const { result } = renderMutations();

        let updatedGoal;
        await act(async () => {
            updatedGoal = await result.current.updateGoal('goal-1', { description: 'New description' });
        });

        expect(updatedGoal).toEqual({ id: 'goal-1', name: 'Updated goal' });
        expect(updateGoal).toHaveBeenCalledWith('root-1', 'goal-1', { description: 'New description' });
        expect(refreshers.programGoals).toHaveBeenCalledTimes(1);
        expect(notify.success).not.toHaveBeenCalled();
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
        expect(refreshers.programGoals).toHaveBeenCalledTimes(1);
        expect(notify.success).toHaveBeenCalledWith('Goal deleted');

        confirmSpy.mockRestore();
    });

});
