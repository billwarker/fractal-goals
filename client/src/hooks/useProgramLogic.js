import { useCallback } from 'react';
import { fractalApi } from '../utils/api';
import { localToISO } from '../utils/dateUtils';

function normalizeRefreshers(refreshers) {
    if (typeof refreshers === 'function') {
        return {
            all: refreshers,
            program: refreshers,
            programGoals: refreshers,
            scheduling: refreshers,
        };
    }

    return {
        all: refreshers?.all || (async () => {}),
        program: refreshers?.program || refreshers?.all || (async () => {}),
        programGoals: refreshers?.programGoals || refreshers?.all || (async () => {}),
        scheduling: refreshers?.scheduling || refreshers?.all || (async () => {}),
    };
}

export function useProgramLogic(rootId, program, refreshers) {
    const invalidate = normalizeRefreshers(refreshers);
    const normalizeBlockPayload = useCallback((blockData) => {
        const payload = {
            name: blockData.name,
            start_date: blockData.start_date ?? blockData.startDate ?? null,
            end_date: blockData.end_date ?? blockData.endDate ?? null,
            color: blockData.color,
        };

        const goalIds = blockData.goal_ids ?? blockData.goalIds;
        if (goalIds !== undefined) {
            payload.goal_ids = goalIds;
        }

        return payload;
    }, []);

    // --- Program Updates ---
    const saveProgram = useCallback(async (programData) => {
        const apiData = {
            name: programData.name,
            description: programData.description || '',
            start_date: programData.startDate,
            end_date: programData.endDate,
            selectedGoals: programData.selectedGoals
            // omitted weeklySchedule to avoid triggering legacy shadow sync
        };
        await fractalApi.updateProgram(rootId, program.id, apiData);
        await invalidate.program();
    }, [invalidate.program, rootId, program]);

    // --- Block Management ---
    const saveBlock = useCallback(async (blockData) => {
        const payload = normalizeBlockPayload(blockData);

        // If the ID contains a dash, it's a real UUID from the DB (or crypto.randomUUID).
        // If it's short/numeric, it was likely from the legacy Date.now() generator.
        // We'll trust the presence of an ID as an indicator of an existing block,
        // EXCEPT if the UI is explicitly passing a flag to create.
        // Because the frontend assigns an ID before creation to handle local state in the UI builder,
        // we should check if this block actually exists in the program's relational blocks array.

        const existingBlock = program.blocks?.find(b => b.id === blockData.id);

        if (existingBlock) {
            // Update
            await fractalApi.updateBlock(rootId, program.id, blockData.id, payload);
        } else {
            // Create
            await fractalApi.createBlock(rootId, program.id, payload);
        }
        await invalidate.program();
    }, [invalidate.program, normalizeBlockPayload, rootId, program]);

    const deleteBlock = useCallback(async (blockId) => {
        await fractalApi.deleteBlock(rootId, program.id, blockId);
        await invalidate.program();
    }, [invalidate.program, rootId, program]);

    // --- Day Management ---
    const saveDay = useCallback(async (blockId, dayId, dayData) => {
        if (dayId) {
            // Update
            await fractalApi.updateBlockDay(rootId, program.id, blockId, dayId, dayData);
        } else {
            // Create
            await fractalApi.addBlockDay(rootId, program.id, blockId, dayData);
        }
        await invalidate.program();
    }, [invalidate.program, rootId, program]);

    const copyDay = useCallback(async (blockId, dayId, copyData) => {
        const res = await fractalApi.copyBlockDay(rootId, program.id, blockId, dayId, copyData);
        await invalidate.program();
        return res;
    }, [invalidate.program, rootId, program]);

    const deleteDay = useCallback(async (blockId, dayId) => {
        await fractalApi.deleteBlockDay(rootId, program.id, blockId, dayId);
        await invalidate.program();
    }, [invalidate.program, rootId, program]);

    // --- Scheduling (Day Instances) ---
    const scheduleDay = useCallback(async (blockId, date, templateDay) => {
        if (!templateDay) {
            await fractalApi.addBlockDay(rootId, program.id, blockId, {
                name: `Day ${date}`,
                date,
                template_ids: [],
            });
            await invalidate.program();
            return;
        }

        await fractalApi.scheduleBlockDay(rootId, program.id, blockId, templateDay.id, {
            session_start: localToISO(
                `${date} 12:00:00`,
                Intl.DateTimeFormat().resolvedOptions().timeZone
            ),
        });
        await invalidate.scheduling();
    }, [invalidate.program, invalidate.scheduling, rootId, program]);

    const unscheduleRecurringDay = useCallback(async ({ blockId, dayId, date, timezone }) => {
        await fractalApi.unscheduleBlockDayOccurrence(rootId, program.id, blockId, dayId, {
            date,
            timezone,
        });
        await invalidate.scheduling();
    }, [invalidate.scheduling, program, rootId]);

    const unscheduleDay = useCallback(async (item) => {
        if (item.type === 'session') {
            await fractalApi.deleteSession(rootId, item.id);
        } else {
            // Legacy Program Day (Instance)
            if (!item.blockId) throw new Error("Cannot delete day without blockId");
            await fractalApi.deleteBlockDay(rootId, program.id, item.blockId, item.id);
        }
        await invalidate.scheduling();
    }, [invalidate.scheduling, rootId, program]);

    // --- Goals ---
    const attachGoal = useCallback(async (blockId, { goal_id, deadline }) => {
        await fractalApi.attachGoalToBlock(rootId, program.id, blockId, { goal_id, deadline });
        await invalidate.programGoals();
    }, [invalidate.programGoals, rootId, program]);

    const setProgramGoalDeadline = useCallback(async ({ goal_id, deadline }) => {
        await fractalApi.setProgramGoalDeadline(rootId, program.id, { goal_id, deadline });
        await invalidate.programGoals();
    }, [invalidate.programGoals, rootId, program]);

    return {
        saveProgram,
        saveBlock,
        deleteBlock,
        saveDay,
        copyDay,
        deleteDay,
        scheduleDay,
        unscheduleRecurringDay,
        unscheduleDay,
        attachGoal,
        setProgramGoalDeadline,
    };
}
