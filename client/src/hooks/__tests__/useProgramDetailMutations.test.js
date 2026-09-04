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
            copyDay: vi.fn(),
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
            selectedBlockId: 'block-1',
            dayModalInitialData: { id: 'day-1' },
            attachBlockId: 'block-2',
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
        expect(notify.success).toHaveBeenCalledWith('Day saved');
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
