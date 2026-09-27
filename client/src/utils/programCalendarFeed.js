import { addDaysToDateString, getDatePart } from './dateUtils';
import { buildCalendarPeriodEvents, buildCompletedSessionEvents } from './programDayState';
import { getProgramColor } from './programViewModel';

export const PROGRAM_CALENDAR_FEED_SCHEMA_VERSION = 1;

export const EMPTY_CALENDAR_FEED = Object.freeze({
    programs: [],
    blocks: [],
    programDays: [],
    completedSessionDays: [],
    periods: [],
});

function uniqueById(items) {
    return [...new Map(items.map((item) => [String(item.id), item])).values()];
}

/**
 * Merge month-chunk feed payloads into one view. Chunks never share dates, so
 * day lists concatenate; programs, blocks, and periods can span chunks and are
 * deduplicated by id.
 */
export function mergeCalendarFeedChunks(chunks = []) {
    const loaded = chunks.filter(Boolean);
    if (!loaded.length) return EMPTY_CALENDAR_FEED;
    return {
        programs: uniqueById(loaded.flatMap((chunk) => chunk.programs || [])),
        blocks: uniqueById(loaded.flatMap((chunk) => chunk.blocks || [])),
        programDays: loaded.flatMap((chunk) => chunk.program_days || []),
        completedSessionDays: loaded.flatMap((chunk) => chunk.completed_session_days || []),
        periods: uniqueById(loaded.flatMap((chunk) => chunk.periods || [])),
    };
}

/** Program summaries with the feed's in-view blocks attached, for labels and colors. */
export function attachFeedBlocks(programs = [], blocks = []) {
    const blocksByProgram = new Map();
    blocks.forEach((block) => {
        const key = String(block.program_id);
        if (!blocksByProgram.has(key)) blocksByProgram.set(key, []);
        blocksByProgram.get(key).push(block);
    });
    return programs.map((program) => ({
        ...program,
        blocks: blocksByProgram.get(String(program.id)) || [],
    }));
}

/**
 * Calendar events for a merged feed. Event ids, types, and `extendedProps` match
 * the shapes the calendar view, ribbons, streak decorations, and click handlers
 * already consume. `programs` is the full, start-ordered program list so fallback
 * colors stay stable no matter which months are loaded.
 */
export function buildCalendarFeedEvents({ feed = EMPTY_CALENDAR_FEED, programs = [], selectedProgramId = null } = {}) {
    const programById = new Map();
    const colorById = new Map();
    programs.forEach((program, index) => {
        programById.set(String(program.id), program);
        colorById.set(String(program.id), getProgramColor(program, index));
    });
    feed.programs.forEach((program, index) => {
        const key = String(program.id);
        if (!programById.has(key)) {
            programById.set(key, program);
            colorById.set(key, getProgramColor(program, programs.length + index));
        }
    });

    const events = [];
    feed.programs.forEach((summary) => {
        const program = programById.get(String(summary.id));
        const start = getDatePart(summary.start_date);
        const end = getDatePart(summary.end_date);
        if (!start || !end) return;
        const color = colorById.get(String(summary.id));
        events.push({
            id: `program-bg-${summary.id}`,
            title: '',
            start,
            end: addDaysToDateString(end, 1),
            backgroundColor: color,
            borderColor: color,
            display: 'background',
            allDay: true,
            extendedProps: { type: 'program_background', programId: summary.id, program, sortOrder: -20 },
        });
    });

    feed.blocks.forEach((block) => {
        const start = getDatePart(block.start_date);
        const end = getDatePart(block.end_date);
        if (!start || !end) return;
        const program = programById.get(String(block.program_id));
        const blockColor = block.color || colorById.get(String(block.program_id));
        events.push({
            id: `block-bg-${block.program_id}-${block.id}`,
            title: '',
            start,
            end: addDaysToDateString(end, 1),
            backgroundColor: blockColor,
            borderColor: blockColor,
            textColor: 'white',
            allDay: true,
            display: 'background',
            sortOrder: -10,
            extendedProps: {
                type: 'block_background',
                blockColor,
                programId: block.program_id,
                program,
                sortOrder: -10,
                ...block,
            },
        });
    });

    feed.programDays.forEach((day) => {
        const program = programById.get(String(day.program_id));
        (day.occurrences || []).forEach((occurrence) => {
            events.push({
                id: `pday-${day.program_id}-${day.date}-${occurrence.program_day_id}`,
                title: occurrence.name || 'Program Day',
                start: day.date,
                allDay: true,
                backgroundColor: 'transparent',
                borderColor: 'transparent',
                textColor: 'inherit',
                classNames: ['program-day-event'],
                extendedProps: {
                    type: 'program_day',
                    programId: day.program_id,
                    program,
                    pDayId: occurrence.program_day_id,
                    blockColor: occurrence.block_color || colorById.get(String(day.program_id)) || null,
                    isCompleted: occurrence.requirements_met,
                    templates: occurrence.templates,
                    dayState: day,
                    sortOrder: 0,
                },
            });
        });
    });

    events.push(
        ...buildCompletedSessionEvents(feed.completedSessionDays, selectedProgramId),
        ...buildCalendarPeriodEvents(feed.periods, selectedProgramId),
    );
    return events;
}
