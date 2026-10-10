/**
 * Client-side hints for the program calendar invariants: blocks never overlap, and a date
 * holds one program day. The server (services/program_calendar_invariants.py) is
 * authoritative; these mirror it so editors can explain a conflict before saving.
 */
import { getDatePart } from './dateUtils';
import { getProgramDayScheduledDates, WEEKDAY_NAMES } from './programViewModel';

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

export function weekdayOf(value) {
    return WEEKDAY_NAMES[(parseIsoDate(value).getUTCDay() + 6) % 7];
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
    return new Set(getProgramDayScheduledDates(day, program));
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
export function findDraftDayConflicts(program, owners, { weekdays = [], dates = [], excludedDates = [] }) {
    const draftDates = programDayDates({ day_of_week: weekdays, scheduled_dates: dates, excluded_dates: excludedDates.filter((date) => !dates.includes(date)) }, program);
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
