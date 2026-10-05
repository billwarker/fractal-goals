/**
 * Client-side hints for the program calendar invariants: blocks never overlap, and a date
 * holds one program day. The server (services/program_calendar_invariants.py) is
 * authoritative; these mirror it so editors can explain a conflict before saving.
 */
import { getDatePart } from './dateUtils';
import { getProgramDaySpecificDates, getProgramDayWeekdays, WEEKDAY_NAMES } from './programViewModel';

export const BLOCK_OVERLAP = 'program_block_overlap';
export const DAY_DATE_CONFLICT = 'program_day_date_conflict';
export const DAY_DATE_OUTSIDE_PROGRAM = 'program_day_date_outside_program';
const INLINE_CODES = new Set([
    BLOCK_OVERLAP, DAY_DATE_CONFLICT, DAY_DATE_OUTSIDE_PROGRAM,
    'program_block_invalid_dates', 'program_block_week_start_required', 'program_block_week_start_invalid',
]);

function parseIsoDate(value) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
}

function isoDate(date) {
    return date.toISOString().slice(0, 10);
}

export function weekdayOf(value) {
    return WEEKDAY_NAMES[(parseIsoDate(value).getUTCDay() + 6) % 7];
}

function eachDate(start, end, visit) {
    for (let cursor = parseIsoDate(start); isoDate(cursor) <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
        visit(isoDate(cursor));
    }
}

/** The first other dated block whose inclusive range meets ``draft``, if any. */
export function findBlockOverlap(blocks, draft) {
    const start = getDatePart(draft?.startDate);
    const end = getDatePart(draft?.endDate);
    if (!start || !end || end < start) return null;
    return (blocks || []).find((block) => {
        if (draft.id && block.id === draft.id) return false;
        const blockStart = getDatePart(block.start_date);
        const blockEnd = getDatePart(block.end_date);
        return Boolean(blockStart && blockEnd && blockStart <= end && blockEnd >= start);
    }) || null;
}

/**
 * Dates a program day occupies inside its program, as ``program_day_scheduled_on`` evaluates
 * them: its explicit dates plus every date on its weekdays, across the whole program span.
 */
export function programDayDates(day, program) {
    const programStart = getDatePart(program?.start_date);
    const programEnd = getDatePart(program?.end_date);
    const occupied = new Set();
    if (!programStart || !programEnd) return occupied;
    getProgramDaySpecificDates(day)
        .filter((value) => value >= programStart && value <= programEnd)
        .forEach((value) => occupied.add(value));
    const weekdays = getProgramDayWeekdays(day);
    if (weekdays.length) {
        eachDate(programStart, programEnd, (value) => {
            if (weekdays.includes(weekdayOf(value))) occupied.add(value);
        });
    }
    return occupied;
}

/** Every date the program's other days occupy, mapped to the day's name. */
export function occupiedProgramDates(program, { excludeDayId = null } = {}) {
    const owners = new Map();
    (program?.days || []).forEach((day) => {
        if (excludeDayId && day.id === excludeDayId) return;
        programDayDates(day, program).forEach((value) => {
            if (!owners.has(value)) owners.set(value, day.name || 'another program day');
        });
    });
    return owners;
}

/** Weekdays on which another day already occupies at least one date, mapped to its name. */
export function takenWeekdays(owners) {
    const taken = new Map();
    owners.forEach((dayName, value) => {
        const weekday = weekdayOf(value);
        if (!taken.has(weekday)) taken.set(weekday, dayName);
    });
    return taken;
}

/** The draft definition's dates that another day already holds, earliest first. */
export function findDraftDayConflicts(program, owners, { weekdays = [], dates = [] }) {
    const draftDates = programDayDates({ day_of_week: weekdays, scheduled_dates: dates }, program);
    return [...draftDates]
        .filter((value) => owners.has(value))
        .sort()
        .map((value) => ({ date: value, dayName: owners.get(value) }));
}

/** An inline message for a calendar invariant error from the API, or ``null`` for other errors. */
export function calendarConflictMessage(error) {
    const data = error?.response?.data;
    if (!data || typeof data !== 'object') return null;
    if (INLINE_CODES.has(data.code)) {
        return data.error || 'This change conflicts with the program calendar.';
    }
    return null;
}
