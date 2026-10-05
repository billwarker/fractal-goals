import { useCallback, useMemo } from 'react';

import { fractalApi } from '../utils/api';
import { formatError } from '../utils/mutationNotify';
import notify from '../utils/notify';
import { useProgramLogic } from './useProgramLogic';
import { logError } from '../utils/logger';
import { calendarConflictMessage } from '../utils/programCalendarConflicts';
import { focusError } from '../utils/programFocus';

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
}) {
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

    const unscheduleDay = useCallback(async (dayId, date, timezone) => {
        try {
            await actions.unscheduleDay(dayId, date, timezone);
            notify.success('Removed from this date');
        } catch (error) {
            logError('Failed to remove scheduled day:', error);
            notify.error(`Failed to remove scheduled day: ${formatError(error)}`);
        }
    }, [actions]);


    const updateGoal = useCallback(async (goalId, payload) => {
        try {
            const response = await fractalApi.updateGoal(rootId, goalId, payload);
            await resolvedRefreshers.programGoals();
            return response?.data || null;
        } catch (error) {
            logError('Failed to update goal:', error);
            notify.error(`Failed to update goal: ${formatError(error)}`);
            throw error;
        }
    }, [resolvedRefreshers, rootId]);

    const toggleGoalCompletion = useCallback(async (goalId, currentStatus) => {
        try {
            const response = await fractalApi.toggleGoalCompletion(rootId, goalId, !currentStatus);
            await resolvedRefreshers.programGoals();
            const goalResponse = response?.data;
            const goalType = formatGoalTypeLabel(goalResponse?.attributes?.type || goalResponse?.type);
            const action = currentStatus ? 'Uncompleted' : 'Completed';
            const goalName = goalResponse?.name;
            notify.success(goalName ? `${goalType} ${action}: ${goalName}` : `${goalType} ${action}`);
        } catch (error) {
            logError('Failed to toggle goal completion:', error);
            notify.error(`Failed to toggle goal completion: ${formatError(error)}`);
        }
    }, [resolvedRefreshers, rootId]);

    const deleteGoal = useCallback(async (goal) => {
        if (!window.confirm(`Are you sure you want to delete "${goal.name}" and all its children?`)) {
            return;
        }

        try {
            await fractalApi.deleteGoal(rootId, goal.id);
            onGoalEditorClosed?.();
            await resolvedRefreshers.programGoals();
            notify.success('Goal deleted');
        } catch (error) {
            logError('Failed to delete goal:', error);
            notify.error(`Failed to delete goal: ${formatError(error)}`);
        }
    }, [onGoalEditorClosed, resolvedRefreshers, rootId]);

    const createGoal = useCallback(async (payload) => {
        try {
            await fractalApi.createGoal(rootId, payload);
            onGoalEditorClosed?.();
            await resolvedRefreshers.programGoals();
            notify.success('Goal created');
        } catch (error) {
            logError('Failed to create goal:', error);
            notify.error(`Failed to create goal: ${formatError(error)}`);
        }
    }, [onGoalEditorClosed, resolvedRefreshers, rootId]);

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
        updateGoal,
        toggleGoalCompletion,
        deleteGoal,
        createGoal,
    };
}

export default useProgramDetailMutations;
