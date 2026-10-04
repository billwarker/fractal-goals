/**
 * Client-side hints for the program calendar invariants: blocks never overlap, and a date
 * holds one program day. The server (services/program_calendar_invariants.py) is
 * authoritative; these mirror it so editors can explain a conflict before saving.
 */
import { getDatePart } from './dateUtils';
import { getProgramDaySpecificDates, getProgramDayWeekdays, WEEKDAY_NAMES } from './programViewModel';

export const BLOCK_OVERLAP = 'program_block_overlap';
export const DAY_DATE_CONFLICT = 'program_day_date_conflict';

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

/** Dates a program day occupies inside its block, as ``program_day_scheduled_on`` evaluates them. */
export function programDayDates(day, block) {
    const blockStart = getDatePart(block?.start_date);
    const blockEnd = getDatePart(block?.end_date);
    const occupied = new Set();
    if (day?.date) {
        // A legacy fixed date always counts, as on the server.
        occupied.add(getDatePart(day.date));
        return occupied;
    }
    if (!blockStart || !blockEnd) return occupied;
    getProgramDaySpecificDates(day)
        .filter((value) => value >= blockStart && value <= blockEnd)
        .forEach((value) => occupied.add(value));
    const weekdays = getProgramDayWeekdays(day);
    if (weekdays.length) {
        eachDate(blockStart, blockEnd, (value) => {
            if (weekdays.includes(weekdayOf(value))) occupied.add(value);
        });
    }
    return occupied;
}

/** Every date the block's other program days occupy, mapped to the day's name. */
export function occupiedBlockDates(block, { excludeDayId = null } = {}) {
    const owners = new Map();
    (block?.days || []).forEach((day) => {
        if (excludeDayId && day.id === excludeDayId) return;
        programDayDates(day, block).forEach((value) => {
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
export function findDraftDayConflicts(block, owners, { weekdays = [], dates = [] }) {
    const draftDates = programDayDates({ day_of_week: weekdays, scheduled_dates: dates }, block);
    return [...draftDates]
        .filter((value) => owners.has(value))
        .sort()
        .map((value) => ({ date: value, dayName: owners.get(value) }));
}

/** An inline message for a calendar invariant error from the API, or ``null`` for other errors. */
export function calendarConflictMessage(error) {
    const data = error?.response?.data;
    if (!data || typeof data !== 'object') return null;
    if (data.code === BLOCK_OVERLAP || data.code === DAY_DATE_CONFLICT || data.code === 'program_block_invalid_dates') {
        return data.error || 'This change conflicts with the program calendar.';
    }
    return null;
}
