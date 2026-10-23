import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { formatError } from '../utils/mutationNotify';
import notify from '../utils/notify';
import { useProgramLogic } from './useProgramLogic';
import { logError } from '../utils/logger';
import { calendarConflictMessage } from '../utils/programCalendarConflicts';
import { focusError } from '../utils/programFocus';
import { applyCreatedGoal, refreshGoalReadModels } from '../utils/goalTreeCache';
import { queryKeys } from './queryKeys';

function formatGoalTypeLabel(type) {
    if (!type) return 'Goal';
    return type.replace(/Goal$/, ' Goal').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
}

export function useProgramDetailMutations({
    rootId,
    program,
    refreshData,
    refreshers,
    dayModalInitialData,
    onProgramSaved,
    onBlockSaved,
    onDaySaved,
    onScheduleDaySaved,
    onGoalEditorClosed,
    onGoalCreated,
}) {
    const queryClient = useQueryClient();
    const resolvedRefreshers = useMemo(() => (
        refreshers || {
            all: refreshData,
            program: refreshData,
            programGoals: refreshData,
            scheduling: refreshData,
        }
    ), [refreshData, refreshers]);
    const actions = useProgramLogic(rootId, program, resolvedRefreshers);

    const saveProgram = useCallback(async (programData) => {
        try {
            await actions.saveProgram(programData);
            notify.success('Program updated');
            onProgramSaved?.();
        } catch (error) {
            logError('Failed to update program:', error);
            notify.error(`Failed to update program: ${formatError(error)}`);
            throw error;
        }
    }, [actions, onProgramSaved]);

    const saveBlock = useCallback(async (blockData) => {
        try {
            await actions.saveBlock(blockData);
            notify.success('Training block saved');
            onBlockSaved?.();
        } catch (error) {
            logError('Failed to save training block:', error);
            // Calendar and focus conflicts are shown inline by the modal, which stays open.
            if (!calendarConflictMessage(error) && !focusError(error)) {
                notify.error(`Failed to save training block: ${formatError(error)}`);
            }
            throw error;
        }
    }, [actions, onBlockSaved]);

    const deleteBlock = useCallback(async (blockId) => {
        try {
            await actions.deleteBlock(blockId);
            notify.success('Training block deleted');
        } catch (error) {
            logError('Failed to delete block:', error);
            notify.error(`Failed to delete block: ${formatError(error)}`);
        }
    }, [actions]);

    const saveDay = useCallback(async (dayData) => {
        try {
            const dayId = dayModalInitialData?.id ?? null;
            const saved = await actions.saveDay(dayId, dayData);
            notify.success(dayId ? 'Day saved' : 'Program day created');
            onDaySaved?.(saved);
            return saved;
        } catch (error) {
            logError('Failed to save day:', error);
            if (!calendarConflictMessage(error) && !focusError(error)) {
                notify.error(`Failed to save day: ${formatError(error)}`);
            }
            throw error;
        }
    }, [actions, dayModalInitialData, onDaySaved]);

    const duplicateDay = useCallback(async (dayId) => {
        try {
            const copy = await actions.duplicateDay(dayId);
            notify.success(copy?.name ? `Created ${copy.name}` : 'Day duplicated');
            onDaySaved?.(copy);
            return copy;
        } catch (error) {
            logError('Failed to duplicate day:', error);
            notify.error(`Failed to duplicate day: ${formatError(error)}`);
            throw error;
        }
    }, [actions, onDaySaved]);

    const reorderDays = useCallback(async (dayIds) => {
        try {
            await actions.reorderDays(dayIds);
        } catch (error) {
            logError('Failed to reorder days:', error);
            notify.error(`Failed to reorder days: ${formatError(error)}`);
            throw error;
        }
    }, [actions]);

    const deleteDay = useCallback(async (dayId) => {
        try {
            await actions.deleteDay(dayId);
            notify.success('Day deleted');
            onDaySaved?.(null);
        } catch (error) {
            logError('Failed to delete day:', error);
            notify.error(`Failed to delete day: ${formatError(error)}`);
        }
    }, [actions, onDaySaved]);

    const scheduleDay = useCallback(async (date, templateDay) => {
        try {
            await actions.scheduleDay(date, templateDay);
            notify.success('Day scheduled');
            onScheduleDaySaved?.();
        } catch (error) {
            logError('Failed to schedule day:', error);
            notify.error(calendarConflictMessage(error) || `Failed to schedule day: ${formatError(error)}`);
        }
    }, [actions, onScheduleDaySaved]);

    // Propagate failures so inline schedule controls retain their state and show errors.
    const unscheduleDay = useCallback(async (dayId, date, timezone) => {
        await actions.unscheduleDay(dayId, date, timezone);
        notify.success('Removed from this date');
    }, [actions]);

    const moveDay = useCallback(async (dayId, sourceDate, targetDate) => {
        const result = await actions.moveDay(dayId, sourceDate, targetDate);
        notify.success('Program day moved');
        return result;
    }, [actions]);

    const updateGoal = useCallback(async (goalId, payload) => {
        try {
            const response = await fractalApi.updateGoal(rootId, goalId, payload);
            // The calendar's due badges read the fractal tree, so refresh every goal read model.
            await Promise.all([
                resolvedRefreshers.programGoals(),
                refreshGoalReadModels(queryClient, queryKeys, rootId),
            ]);
            return response?.data || null;
        } catch (error) {
            logError('Failed to update goal:', error);
            notify.error(`Failed to update goal: ${formatError(error)}`);
            throw error;
        }
    }, [queryClient, resolvedRefreshers, rootId]);

    const toggleGoalCompletion = useCallback(async (goalId, currentStatus, sequenceOptions = null) => {
        try {
            const response = await fractalApi.toggleGoalCompletion(rootId, goalId, !currentStatus, null, sequenceOptions);
            // Completing a sequenced goal can resume or re-pause its sibling, so refresh every goal view.
            await Promise.all([
                resolvedRefreshers.programGoals(),
                refreshGoalReadModels(queryClient, queryKeys, rootId),
            ]);
            const goalResponse = response?.data;
            const goalType = formatGoalTypeLabel(goalResponse?.attributes?.type || goalResponse?.type);
            const action = currentStatus ? 'Uncompleted' : 'Completed';
            const goalName = goalResponse?.name;
            notify.success(goalName ? `${goalType} ${action}: ${goalName}` : `${goalType} ${action}`);
        } catch (error) {
            logError('Failed to toggle goal completion:', error);
            notify.error(`Failed to toggle goal completion: ${formatError(error)}`);
        }
    }, [queryClient, resolvedRefreshers, rootId]);

    // The goal modal's Delete option confirms (and asks about a sequence's next goal) before this runs.
    const deleteGoal = useCallback(async (goal, { beginNext = true } = {}) => {
        try {
            await fractalApi.deleteGoal(rootId, goal.id, { beginNext });
            onGoalEditorClosed?.();
            await Promise.all([
                resolvedRefreshers.programGoals(),
                refreshGoalReadModels(queryClient, queryKeys, rootId),
            ]);
            notify.success('Goal deleted');
        } catch (error) {
            logError('Failed to delete goal:', error);
            notify.error(`Failed to delete goal: ${formatError(error)}`);
        }
    }, [onGoalEditorClosed, queryClient, resolvedRefreshers, rootId]);

    // Returns the created goal so the goal modal can attach its pending activities, and leaves
    // success and failure toasts to the modal.
    const createGoal = useCallback(async (payload) => {
        let goal;
        try {
            goal = (await fractalApi.createGoal(rootId, payload)).data;
        } catch (error) {
            logError('Failed to create goal:', error);
            throw error;
        }
        onGoalEditorClosed?.();
        onGoalCreated?.(goal);
        await Promise.all([
            applyCreatedGoal(queryClient, queryKeys, rootId, goal),
            resolvedRefreshers.programGoals(),
        ]);
        return goal;
    }, [onGoalCreated, onGoalEditorClosed, queryClient, resolvedRefreshers, rootId]);

    return {
        saveProgram,
        saveBlock,
        deleteBlock,
        saveDay,
        duplicateDay,
        reorderDays,
        deleteDay,
        scheduleDay,
        unscheduleDay,
        moveDay,
        updateGoal,
        toggleGoalCompletion,
        deleteGoal,
        createGoal,
    };
}

export default useProgramDetailMutations;
