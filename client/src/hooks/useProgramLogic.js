import { useCallback } from 'react';
import { fractalApi } from '../utils/api';
import { getLocalISOString, localToISO } from '../utils/dateUtils';
import moment from 'moment';

export function useProgramLogic(rootId, program, refreshData) {

    // --- Program Updates ---
    const saveProgram = useCallback(async (programData) => {
        const apiData = {
            name: programData.name,
            description: programData.description || '',
            start_date: programData.startDate,
            end_date: programData.endDate,
            selectedGoals: programData.selectedGoals,
            weeklySchedule: Array.isArray(program.weekly_schedule) ? program.weekly_schedule : []
        };
        await fractalApi.updateProgram(rootId, program.id, apiData);
        await refreshData();
    }, [rootId, program, refreshData]);

    // --- Block Management ---
    const saveBlock = useCallback(async (blockData) => {
        const currentSchedule = Array.isArray(program.weekly_schedule) ? program.weekly_schedule : [];
        let updatedSchedule;

        if (blockData.id) {
            // Update
            updatedSchedule = currentSchedule.map(block =>
                block.id === blockData.id
                    ? {
                        ...block,
                        name: blockData.name,
                        startDate: blockData.startDate,
                        endDate: blockData.endDate,
                        color: blockData.color
                    }
                    : block
            );
        } else {
            // Create
            const newBlock = {
                id: Date.now().toString(),
                name: blockData.name,
                startDate: blockData.startDate,
                endDate: blockData.endDate,
                color: blockData.color,
                weeklySchedule: { daily: [] }
            };
            updatedSchedule = [...currentSchedule, newBlock];
        }

        const apiData = {
            name: program.name,
            description: program.description || '',
            start_date: program.start_date,
            end_date: program.end_date,
            selectedGoals: program.goal_ids || [],
            weeklySchedule: updatedSchedule
        };

        await fractalApi.updateProgram(rootId, program.id, apiData);
        await refreshData();
    }, [rootId, program, refreshData]);

    const deleteBlock = useCallback(async (blockId) => {
        const currentSchedule = Array.isArray(program.weekly_schedule) ? program.weekly_schedule : [];
        const updatedSchedule = currentSchedule.filter(block => block.id !== blockId);

        const apiData = {
            name: program.name,
            description: program.description || '',
            start_date: program.start_date,
            end_date: program.end_date,
            selectedGoals: program.goal_ids || [],
            weeklySchedule: updatedSchedule
        };

        await fractalApi.updateProgram(rootId, program.id, apiData);
        await refreshData();
    }, [rootId, program, refreshData]);

    // --- Day Management ---
    const saveDay = useCallback(async (blockId, dayId, dayData) => {
        if (dayId) {
            // Update
            await fractalApi.updateBlockDay(rootId, program.id, blockId, dayId, dayData);
        } else {
            // Create
            await fractalApi.addBlockDay(rootId, program.id, blockId, dayData);
        }
        await refreshData();
    }, [rootId, program, refreshData]);

    const copyDay = useCallback(async (blockId, dayId, copyData) => {
        const res = await fractalApi.copyBlockDay(rootId, program.id, blockId, dayId, copyData);
        await refreshData();
        return res;
    }, [rootId, program, refreshData]);

    const deleteDay = useCallback(async (blockId, dayId) => {
        await fractalApi.deleteBlockDay(rootId, program.id, blockId, dayId);
        await refreshData();
    }, [rootId, program, refreshData]);

    // --- Scheduling (Day Instances) ---
    const scheduleDay = useCallback(async (blockId, date, templateDay) => {
        // Determine Parent Goals (Block Goals > Program Goals > Root Fallback)
        const block = program.blocks.find(b => b.id === blockId);
        const parentIds = new Set([
            ...(block?.goal_ids || []),
            ...(program.goal_ids || [])
        ]);

        if (parentIds.size === 0) {
            parentIds.add(rootId);
        }

        await fractalApi.createSession(rootId, {
            name: templateDay ? templateDay.name : 'Ad-hoc Session',
            session_start: date ? localToISO(`${date} 12:00:00`, Intl.DateTimeFormat().resolvedOptions().timeZone) : getLocalISOString(),
            parent_ids: Array.from(parentIds),
            session_data: {
                program_context: {
                    day_id: templateDay ? templateDay.id : null,
                    block_id: blockId,
                    program_id: program.id
                }
            }
        });
        await refreshData();
    }, [rootId, program, refreshData]);

    const scheduleBlockDay = useCallback(async (blockId, dayId, date) => {
        let dayToUpdate = null;
        program.blocks.some(b => {
            if (b.id === blockId && b.days) {
                const found = b.days.find(d => d.id === dayId);
                if (found) {
                    dayToUpdate = found;
                    return true;
                }
            }
            return false;
        });

        if (!dayToUpdate) {
            throw new Error("Day not found in local state");
        }

        const updatedDay = { ...dayToUpdate, date: date };
        await fractalApi.updateBlockDay(rootId, program.id, blockId, dayId, updatedDay);
        await refreshData();
    }, [rootId, program, refreshData]);

    const unscheduleDay = useCallback(async (item) => {
        if (item.type === 'session') {
            await fractalApi.deleteSession(rootId, item.id);
        } else {
            // Legacy Program Day (Instance)
            if (!item.blockId) throw new Error("Cannot delete day without blockId");
            await fractalApi.deleteBlockDay(rootId, program.id, item.blockId, item.id);
        }
        await refreshData();
    }, [rootId, program, refreshData]);

    // --- Goals ---
    const attachGoal = useCallback(async (blockId, { goal_id, deadline }) => {
        await fractalApi.attachGoalToBlock(rootId, program.id, blockId, { goal_id, deadline });
        await refreshData();
    }, [rootId, program, refreshData]);

    return {
        saveProgram,
        saveBlock,
        deleteBlock,
        saveDay,
        copyDay,
        deleteDay,
        scheduleDay,
        scheduleBlockDay,
        unscheduleDay,
        attachGoal
    };
}
