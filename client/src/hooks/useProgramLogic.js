import { useCallback, useMemo } from 'react';
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
    const invalidate = useMemo(() => normalizeRefreshers(refreshers), [refreshers]);
    const invalidateProgram = invalidate.program;
    const invalidateProgramGoals = invalidate.programGoals;
    const invalidateScheduling = invalidate.scheduling;
    const programId = program?.id;
    const programBlocks = program?.blocks;

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
            color: programData.color || null,
            start_date: programData.startDate,
            end_date: programData.endDate,
            selectedGoals: programData.selectedGoals
        };
        await fractalApi.updateProgram(rootId, programId, apiData);
        await invalidateProgram();
    }, [invalidateProgram, rootId, programId]);

    // --- Block Management ---
    const saveBlock = useCallback(async (blockData) => {
        const payload = normalizeBlockPayload(blockData);

        // If the ID contains a dash, it's a real UUID from the DB (or crypto.randomUUID).
        // If it's short/numeric, it was likely from the legacy Date.now() generator.
        // We'll trust the presence of an ID as an indicator of an existing block,
        // EXCEPT if the UI is explicitly passing a flag to create.
        // Because the frontend assigns an ID before creation to handle local state in the UI builder,
        // we should check if this block actually exists in the program's relational blocks array.

        const existingBlock = programBlocks?.find(b => b.id === blockData.id);

        if (existingBlock) {
            // Update
            await fractalApi.updateBlock(rootId, programId, blockData.id, payload);
        } else {
            // Create
            await fractalApi.createBlock(rootId, programId, payload);
        }
        await invalidateProgram();
    }, [invalidateProgram, normalizeBlockPayload, rootId, programBlocks, programId]);

    const deleteBlock = useCallback(async (blockId) => {
        await fractalApi.deleteBlock(rootId, programId, blockId);
        await invalidateProgram();
    }, [invalidateProgram, rootId, programId]);

    // --- Day Management ---
    const saveDay = useCallback(async (blockId, dayId, dayData) => {
        if (dayId) {
            // Update
            await fractalApi.updateBlockDay(rootId, programId, blockId, dayId, dayData);
        } else {
            // Create
            await fractalApi.addBlockDay(rootId, programId, blockId, dayData);
        }
        await invalidateProgram();
    }, [invalidateProgram, rootId, programId]);

    const copyDay = useCallback(async (blockId, dayId, copyData) => {
        const res = await fractalApi.copyBlockDay(rootId, programId, blockId, dayId, copyData);
        await invalidateProgram();
        return res;
    }, [invalidateProgram, rootId, programId]);

    const deleteDay = useCallback(async (blockId, dayId) => {
        await fractalApi.deleteBlockDay(rootId, programId, blockId, dayId);
        await invalidateProgram();
    }, [invalidateProgram, rootId, programId]);

    // --- Scheduling (Day Instances) ---
    const scheduleDay = useCallback(async (blockId, date, templateDay) => {
        if (!templateDay) {
            await fractalApi.addBlockDay(rootId, programId, blockId, {
                name: `Day ${date}`,
                date,
                template_ids: [],
            });
            await invalidateProgram();
            return;
        }

        await fractalApi.scheduleBlockDay(rootId, programId, blockId, templateDay.id, {
            session_start: localToISO(
                `${date} 12:00:00`,
                Intl.DateTimeFormat().resolvedOptions().timeZone
            ),
        });
        await invalidateScheduling();
    }, [invalidateProgram, invalidateScheduling, rootId, programId]);

    const unscheduleRecurringDay = useCallback(async ({ blockId, dayId, date, timezone }) => {
        await fractalApi.unscheduleBlockDayOccurrence(rootId, programId, blockId, dayId, {
            date,
            timezone,
        });
        await invalidateScheduling();
    }, [invalidateScheduling, programId, rootId]);

    const unscheduleDay = useCallback(async (item) => {
        if (item.type === 'session') {
            await fractalApi.deleteSession(rootId, item.id);
        } else {
            // Legacy Program Day (Instance)
            if (!item.blockId) throw new Error("Cannot delete day without blockId");
            await fractalApi.deleteBlockDay(rootId, programId, item.blockId, item.id);
        }
        await invalidateScheduling();
    }, [invalidateScheduling, rootId, programId]);

    // --- Goals ---
    const attachGoal = useCallback(async (blockId, { goal_id, deadline }) => {
        await fractalApi.attachGoalToBlock(rootId, programId, blockId, { goal_id, deadline });
        await invalidateProgramGoals();
    }, [invalidateProgramGoals, rootId, programId]);

    const attachGoalToDay = useCallback(async (blockId, dayId, { goal_id }) => {
        await fractalApi.attachGoalToDay(rootId, programId, blockId, dayId, { goal_id });
        await invalidateProgramGoals();
    }, [invalidateProgramGoals, rootId, programId]);

    const setProgramGoalDeadline = useCallback(async ({ goal_id, deadline }) => {
        await fractalApi.setProgramGoalDeadline(rootId, programId, { goal_id, deadline });
        await invalidateProgramGoals();
    }, [invalidateProgramGoals, rootId, programId]);

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
        attachGoalToDay,
        setProgramGoalDeadline,
    };
}
