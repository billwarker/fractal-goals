import { useCallback } from 'react';
import { toast } from 'react-hot-toast';

import { fractalApi } from '../utils/api';
import { getISOYMDInTimezone } from '../utils/dateUtils';
import { useProgramLogic } from './useProgramLogic';

function getErrorMessage(error, fallbackMessage) {
    return error?.response?.data?.error || error?.message || fallbackMessage;
}

export function useProgramDetailMutations({
    rootId,
    program,
    refreshData,
    timezone,
    sessions = [],
    selectedBlockId,
    dayModalInitialData,
    attachBlockId,
    selectedDate,
    itemToUnschedule,
    onProgramSaved,
    onBlockSaved,
    onDaySaved,
    onAttachGoalSaved,
    onScheduleDaySaved,
    onUnscheduleFinished,
    onGoalEditorClosed,
}) {
    const actions = useProgramLogic(rootId, program, refreshData);

    const saveProgram = useCallback(async (programData) => {
        try {
            await actions.saveProgram(programData);
            onProgramSaved?.();
        } catch (error) {
            console.error('Failed to update program:', error);
            toast.error(`Failed to update program: ${getErrorMessage(error, 'Unknown error')}`);
        }
    }, [actions, onProgramSaved]);

    const saveBlock = useCallback(async (blockData) => {
        try {
            await actions.saveBlock(blockData);
            onBlockSaved?.();
        } catch (error) {
            console.error('Failed to save training block:', error);
            toast.error(`Failed to save training block: ${getErrorMessage(error, 'Unknown error')}`);
        }
    }, [actions, onBlockSaved]);

    const deleteBlock = useCallback(async (blockId) => {
        try {
            await actions.deleteBlock(blockId);
        } catch (error) {
            console.error('Failed to delete block:', error);
            toast.error(`Failed to delete block: ${getErrorMessage(error, 'Unknown error')}`);
        }
    }, [actions]);

    const saveDay = useCallback(async (dayData) => {
        try {
            const dayId = dayModalInitialData?.id ?? null;
            await actions.saveDay(selectedBlockId, dayId, dayData);
            onDaySaved?.();
        } catch (error) {
            console.error('Failed to save day:', error);
            toast.error(`Failed to save day: ${getErrorMessage(error, 'Unknown error')}`);
        }
    }, [actions, dayModalInitialData, selectedBlockId, onDaySaved]);

    const copyDay = useCallback(async (dayId, copyData) => {
        return actions.copyDay(selectedBlockId, dayId, copyData);
    }, [actions, selectedBlockId]);

    const deleteDay = useCallback(async (dayId) => {
        try {
            await actions.deleteDay(selectedBlockId, dayId);
            onDaySaved?.();
        } catch (error) {
            console.error('Failed to delete day:', error);
            toast.error(`Failed to delete day: ${getErrorMessage(error, 'Unknown error')}`);
        }
    }, [actions, selectedBlockId, onDaySaved]);

    const unscheduleDay = useCallback(async () => {
        if (!itemToUnschedule) {
            return;
        }

        try {
            const isRecurringTemplateUnschedule =
                itemToUnschedule.type === 'program_day' &&
                itemToUnschedule.isRecurringTemplate &&
                Boolean(selectedDate);

            if (isRecurringTemplateUnschedule) {
                const matchingScheduledSessions = sessions.filter((session) => {
                    const isCompleted = session.completed || session.attributes?.completed;
                    if (isCompleted) {
                        return false;
                    }

                    let programDayId = session.program_day_id;
                    if (!programDayId && session.attributes) {
                        try {
                            const attributes = typeof session.attributes === 'string'
                                ? JSON.parse(session.attributes)
                                : session.attributes;
                            programDayId = attributes?.program_context?.day_id;
                        } catch {
                            return false;
                        }
                    }

                    if (programDayId !== itemToUnschedule.id) {
                        return false;
                    }

                    const localDate = getISOYMDInTimezone(
                        session.session_start || session.start_time || session.created_at,
                        timezone
                    );
                    return localDate === selectedDate;
                });

                if (matchingScheduledSessions.length === 0) {
                    toast('No scheduled sessions to remove on this date.');
                } else {
                    await Promise.all(
                        matchingScheduledSessions.map((session) => fractalApi.deleteSession(rootId, session.id))
                    );
                    await refreshData();
                }
            } else {
                await actions.unscheduleDay(itemToUnschedule);
            }
        } catch (error) {
            console.error('Failed to unschedule day:', error);
            toast.error(`Failed to unschedule day: ${getErrorMessage(error, 'Unknown error')}`);
        } finally {
            onUnscheduleFinished?.();
        }
    }, [
        actions,
        itemToUnschedule,
        onUnscheduleFinished,
        refreshData,
        rootId,
        selectedDate,
        sessions,
        timezone,
    ]);

    const scheduleDay = useCallback(async (blockId, date, templateDay) => {
        try {
            await actions.scheduleDay(blockId, date, templateDay);
            onScheduleDaySaved?.();
        } catch (error) {
            console.error('Failed to schedule day:', error);
            toast.error(`Failed to schedule day: ${getErrorMessage(error, 'Unknown error')}`);
        }
    }, [actions, onScheduleDaySaved]);

    const saveAttachedGoal = useCallback(async ({ goal_id, deadline }) => {
        try {
            await actions.attachGoal(attachBlockId, { goal_id, deadline });
            onAttachGoalSaved?.();
        } catch (error) {
            console.error('Failed to attach goal:', error);
            toast.error(`Failed to attach goal: ${getErrorMessage(error, 'Unknown error')}`);
        }
    }, [actions, attachBlockId, onAttachGoalSaved]);

    const setGoalDeadline = useCallback(async (goalId, deadline) => {
        try {
            await fractalApi.updateGoal(rootId, goalId, { deadline });
            await refreshData();
        } catch (error) {
            console.error('Failed to set goal deadline:', error);
            toast.error(`Failed to set goal deadline: ${getErrorMessage(error, 'Unknown error')}`);
        }
    }, [refreshData, rootId]);

    const updateGoal = useCallback(async (goalId, payload) => {
        try {
            await fractalApi.updateGoal(rootId, goalId, payload);
            await refreshData();
        } catch (error) {
            console.error('Failed to update goal:', error);
            toast.error(`Failed to update goal: ${getErrorMessage(error, 'Unknown error')}`);
        }
    }, [refreshData, rootId]);

    const toggleGoalCompletion = useCallback(async (goalId, currentStatus) => {
        try {
            await fractalApi.toggleGoalCompletion(rootId, goalId, !currentStatus);
            await refreshData();
        } catch (error) {
            console.error('Failed to toggle goal completion:', error);
            toast.error(`Failed to toggle goal completion: ${getErrorMessage(error, 'Unknown error')}`);
        }
    }, [refreshData, rootId]);

    const deleteGoal = useCallback(async (goal) => {
        if (!window.confirm(`Are you sure you want to delete "${goal.name}" and all its children?`)) {
            return;
        }

        try {
            await fractalApi.deleteGoal(rootId, goal.id);
            onGoalEditorClosed?.();
            await refreshData();
        } catch (error) {
            console.error('Failed to delete goal:', error);
            toast.error(`Failed to delete goal: ${getErrorMessage(error, 'Unknown error')}`);
        }
    }, [onGoalEditorClosed, refreshData, rootId]);

    const createGoal = useCallback(async (payload) => {
        try {
            await fractalApi.createGoal(rootId, payload);
            onGoalEditorClosed?.();
            await refreshData();
        } catch (error) {
            console.error('Failed to create goal:', error);
            toast.error(`Failed to create goal: ${getErrorMessage(error, 'Unknown error')}`);
        }
    }, [onGoalEditorClosed, refreshData, rootId]);

    return {
        saveProgram,
        saveBlock,
        deleteBlock,
        saveDay,
        copyDay,
        deleteDay,
        unscheduleDay,
        scheduleDay,
        saveAttachedGoal,
        setGoalDeadline,
        updateGoal,
        toggleGoalCompletion,
        deleteGoal,
        createGoal,
    };
}

export default useProgramDetailMutations;
