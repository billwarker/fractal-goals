import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
        onGoalCreated: vi.fn(),
    };
    let queryClient;

    beforeEach(() => {
        vi.clearAllMocks();
        Object.values(mockActions).forEach((mockFn) => mockFn.mockResolvedValue(undefined));
        refreshData.mockResolvedValue(undefined);
        updateGoal.mockResolvedValue(undefined);
        toggleGoalCompletion.mockResolvedValue(undefined);
        deleteGoal.mockResolvedValue(undefined);
        createGoal.mockResolvedValue(undefined);
        Object.values(refreshers).forEach((mockFn) => mockFn.mockResolvedValue(undefined));
        queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
        }), {
            wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
        });
    }

    it('creates a goal, inserts it into the cached goal trees, and returns it for the goal modal', async () => {
        const created = { id: 'goal-new', name: 'New child', attributes: { id: 'goal-new', parent_id: 'goal-1' } };
        createGoal.mockResolvedValueOnce({ data: created });
        queryClient.setQueryData(['goals-tree', 'root-1'], { id: 'root-1', children: [{ id: 'goal-1', children: [] }] });
        const { result } = renderMutations();

        let returned;
        await act(async () => {
            returned = await result.current.createGoal({ name: 'New child', parent_id: 'goal-1' });
        });

        expect(returned).toBe(created);
        expect(callbacks.onGoalEditorClosed).toHaveBeenCalled();
        expect(callbacks.onGoalCreated).toHaveBeenCalledWith(created);
        expect(refreshers.programGoals).toHaveBeenCalled();
        expect(queryClient.getQueryData(['goals-tree', 'root-1']).children[0].children.map((goal) => goal.id))
            .toEqual(['goal-new']);
        expect(notify.success).not.toHaveBeenCalled();
    });

    it('rethrows a failed goal creation so the goal modal reports it', async () => {
        createGoal.mockRejectedValueOnce(new Error('boom'));
        const { result } = renderMutations();

        await expect(act(async () => {
            await result.current.createGoal({ name: 'x' });
        })).rejects.toThrow('boom');
        expect(callbacks.onGoalEditorClosed).not.toHaveBeenCalled();
        expect(callbacks.onGoalCreated).not.toHaveBeenCalled();
    });

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

    it('deletes a confirmed goal with the sequence choice, then refreshes and closes the goal editor', async () => {
        const confirmSpy = vi.spyOn(window, 'confirm');
        const { result } = renderMutations();

        await act(async () => {
            await result.current.deleteGoal({ id: 'goal-1', name: 'Goal 1' }, { beginNext: false });
        });

        // The goal modal's Delete option has already confirmed.
        expect(confirmSpy).not.toHaveBeenCalled();
        expect(deleteGoal).toHaveBeenCalledWith('root-1', 'goal-1', { beginNext: false });
        expect(callbacks.onGoalEditorClosed).toHaveBeenCalledTimes(1);
        expect(refreshers.programGoals).toHaveBeenCalledTimes(1);
        expect(notify.success).toHaveBeenCalledWith('Goal deleted');

        confirmSpy.mockRestore();
    });

});
