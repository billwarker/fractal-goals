import { useCallback } from 'react';

import { subtractDaysToDateString } from '../utils/dateUtils';
import { getNextMultiDayRange } from '../utils/programCalendarContext';
import { getProgramStatus, isProgramActive } from '../utils/programGoalWindow';

function getDatePart(value) {
    return value ? String(value).split('T')[0] : null;
}

function dateRangesOverlap(startA, endA, startB, endB) {
    return Boolean(startA && endA && startB && endB && startA <= endB && endA >= startB);
}

/** Owns every transition between program, day, and multi-day calendar scope. */
export function useProgramCalendarSelection({
    calendarContext,
    dispatchCalendarContext,
    displayProgram,
    programs,
    today,
    blockCreationMode,
    setBlockCreationMode,
    setIsSidePaneVisible,
}) {
    const updateRangeContext = useCallback(({
        startDate,
        endDate = startDate,
        program = null,
        forceRange = false,
    }) => {
        const programId = program?.id || null;
        const isRangeSelection = forceRange || startDate !== endDate;
        const canAddBlockFromSelection = Boolean(
            isRangeSelection
            && program
            && getProgramStatus(program, today) !== 'completed'
            && isProgramActive(program, startDate)
            && isProgramActive(program, endDate)
            && !(program.blocks || []).some((block) => dateRangesOverlap(
                startDate,
                endDate,
                getDatePart(block.start_date),
                getDatePart(block.end_date),
            ))
        );

        dispatchCalendarContext(isRangeSelection ? {
            type: 'focus_range',
            startDate,
            endDate,
            programId,
            pendingBlockSelection: canAddBlockFromSelection ? { startDate, endDate } : null,
        } : {
            type: 'focus_day',
            date: startDate,
            programId,
        });
    }, [dispatchCalendarContext, today]);

    const extendMultiDaySelection = useCallback((clickedDate) => {
        const program = displayProgram && isProgramActive(displayProgram, clickedDate)
            ? displayProgram
            : null;
        const { startDate, endDate } = getNextMultiDayRange(calendarContext, clickedDate);
        updateRangeContext({ startDate, endDate, program, forceRange: true });
        setIsSidePaneVisible(true);
    }, [calendarContext, displayProgram, setIsSidePaneVisible, updateRangeContext]);

    const selectCalendarRange = useCallback((info) => {
        const startDate = info.startStr;
        const endDate = subtractDaysToDateString(info.endStr, 1);
        const program = displayProgram && isProgramActive(displayProgram, startDate)
            ? displayProgram
            : null;

        info.view.calendar.unselect();
        if (blockCreationMode && startDate === endDate) return;
        updateRangeContext({ startDate, endDate, program });
        setIsSidePaneVisible(true);
    }, [blockCreationMode, displayProgram, setIsSidePaneVisible, updateRangeContext]);

    const resetToToday = useCallback(() => {
        const program = displayProgram && isProgramActive(displayProgram, today)
            ? displayProgram
            : programs.find((candidate) => isProgramActive(candidate, today));
        dispatchCalendarContext({
            type: 'reset_today',
            date: today,
            programId: program?.id || null,
        });
        setBlockCreationMode(false);
    }, [dispatchCalendarContext, displayProgram, programs, setBlockCreationMode, today]);

    const selectBlockRange = useCallback(({ startDate, endDate, programId }) => {
        const program = programs.find((candidate) => candidate.id === programId)
            || (displayProgram?.id === programId ? displayProgram : null);
        updateRangeContext({ startDate, endDate, program });
        setIsSidePaneVisible(true);
    }, [displayProgram, programs, setIsSidePaneVisible, updateRangeContext]);

    const setMultiDayMode = useCallback((nextValue) => {
        setBlockCreationMode(nextValue);
        dispatchCalendarContext({ type: 'clear_pending_block_selection' });
    }, [dispatchCalendarContext, setBlockCreationMode]);

    return {
        updateRangeContext,
        extendMultiDaySelection,
        selectCalendarRange,
        resetToToday,
        selectBlockRange,
        setMultiDayMode,
    };
}
