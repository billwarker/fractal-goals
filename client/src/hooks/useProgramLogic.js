import { useCallback, useMemo } from 'react';
import { fractalApi } from '../utils/api';

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
        // Week tracking: Week 1 starts on start_date, later weeks on week_start_day (0 = Monday).
        if ('track_weeks' in blockData || 'trackWeeks' in blockData) {
            payload.track_weeks = Boolean(blockData.track_weeks ?? blockData.trackWeeks);
            payload.week_start_day = blockData.week_start_day ?? blockData.weekStartDay ?? null;
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
            selectedGoals: programData.selectedGoals,
            ...(programData.pruneDayGoals ? { prune_day_goals: true } : {}),
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
    // Program days belong to the program; their weekdays repeat across its whole span.
    const saveDay = useCallback(async (dayId, dayData) => {
        const response = dayId
            ? await fractalApi.updateProgramDay(rootId, programId, dayId, dayData)
            : await fractalApi.createProgramDay(rootId, programId, dayData);
        // Schedule edits move day read models and metrics, not just the definition.
        await Promise.all([invalidateProgram(), invalidateScheduling()]);
        return response?.data ?? null;
    }, [invalidateProgram, invalidateScheduling, rootId, programId]);

    const duplicateDay = useCallback(async (dayId) => {
        const response = await fractalApi.duplicateProgramDay(rootId, programId, dayId);
        await invalidateProgram();
        return response?.data ?? null;
    }, [invalidateProgram, rootId, programId]);

    // The order is presentational: only the program (its days list) needs refreshing.
    const reorderDays = useCallback(async (dayIds) => {
        await fractalApi.reorderProgramDays(rootId, programId, dayIds);
        await invalidateProgram();
    }, [invalidateProgram, rootId, programId]);

    const deleteDay = useCallback(async (dayId) => {
        await fractalApi.deleteProgramDay(rootId, programId, dayId);
        await Promise.all([invalidateProgram(), invalidateScheduling()]);
    }, [invalidateProgram, invalidateScheduling, rootId, programId]);

    // --- Scheduling (Day Instances) ---
    const scheduleDay = useCallback(async (date, templateDay) => {
        await fractalApi.scheduleProgramDay(rootId, programId, templateDay.id, { date });
        await Promise.all([invalidateProgram(), invalidateScheduling()]);
    }, [invalidateProgram, invalidateScheduling, rootId, programId]);

    const moveDay = useCallback(async (dayId, sourceDate, targetDate) => {
        const response = await fractalApi.moveProgramDayOccurrence(rootId, programId, dayId, {
            source_date: sourceDate, target_date: targetDate,
        });
        await invalidateScheduling();
        return response.data;
    }, [invalidateScheduling, rootId, programId]);

    const unscheduleDay = useCallback(async (dayId, date, timezone) => {
        await fractalApi.unscheduleProgramDayOccurrence(rootId, programId, dayId, {
            date,
            timezone: timezone || 'UTC',
        });
        await Promise.all([invalidateProgram(), invalidateScheduling()]);
    }, [invalidateProgram, invalidateScheduling, rootId, programId]);

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
    };
}
