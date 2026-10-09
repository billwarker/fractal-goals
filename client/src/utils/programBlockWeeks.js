/**
 * Block weeks, mirroring services/program_rollups.block_weeks (both are tested against
 * tests/fixtures/block_weeks_cases.json). Week 1 starts on the block's start date; every
 * later week starts on ``week_start_day`` (0 = Monday ... 6 = Sunday, Python's numbering),
 * so Week 1 may be partial. ``null`` steps seven days from the start date.
 */
import { getDatePart } from './dateUtils';

const DAYS_PER_WEEK = 7;

/** Weekday choices in calendar order (the calendar's weeks start on Sunday). */
export const WEEK_START_OPTIONS = [
    { value: 6, short: 'Sun', label: 'Sunday' },
    { value: 0, short: 'Mon', label: 'Monday' },
    { value: 1, short: 'Tue', label: 'Tuesday' },
    { value: 2, short: 'Wed', label: 'Wednesday' },
    { value: 3, short: 'Thu', label: 'Thursday' },
    { value: 4, short: 'Fri', label: 'Friday' },
    { value: 5, short: 'Sat', label: 'Saturday' },
];

/** The default start day: Sunday, matching the calendar's first column. */
export const DEFAULT_WEEK_START_DAY = 6;

function parse(value) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
}

function format(date) {
    return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

/** Python weekday (0 = Monday) of an ISO date. */
export function pythonWeekday(value) {
    return (parse(value).getUTCDay() + 6) % DAYS_PER_WEEK;
}

/** The weekday a block's weeks start on, or ``null`` (start-date stepping) when untracked. */
export function trackedWeekStartDay(block) {
    return block?.track_weeks ? (block.week_start_day ?? null) : null;
}

/** ``[{ index, start, end, partial }]`` for ``start..end`` (ISO dates). */
export function blockWeeks(start, end, weekStartDay = null) {
    const startDate = getDatePart(start);
    const endDate = getDatePart(end);
    if (!startDate || !endDate || endDate < startDate) return [];
    const anchor = weekStartDay ?? pythonWeekday(startDate);
    const lead = ((anchor - pythonWeekday(startDate)) % DAYS_PER_WEEK + DAYS_PER_WEEK) % DAYS_PER_WEEK || DAYS_PER_WEEK;
    const weeks = [];
    let weekStart = parse(startDate);
    let nextStart = addDays(weekStart, lead);
    while (format(weekStart) <= endDate) {
        const lastDay = format(addDays(nextStart, -1));
        const weekEnd = lastDay < endDate ? lastDay : endDate;
        weeks.push({
            index: weeks.length + 1,
            start: format(weekStart),
            end: weekEnd,
            partial: (parse(weekEnd).getTime() - weekStart.getTime()) / 86_400_000 + 1 < DAYS_PER_WEEK,
        });
        weekStart = nextStart;
        nextStart = addDays(nextStart, DAYS_PER_WEEK);
    }
    return weeks;
}

/** The weeks of a block that tracks them, else ``[]``. */
export function trackedBlockWeeks(block) {
    if (!block?.track_weeks) return [];
    return blockWeeks(block.start_date, block.end_date, trackedWeekStartDay(block));
}

/** ``{ index, count, start, end }`` for the tracked week containing ``dateStr``, or ``null``. */
export function weekForDate(block, dateStr) {
    const weeks = trackedBlockWeeks(block);
    const week = weeks.find((item) => item.start <= dateStr && dateStr <= item.end);
    return week ? { ...week, count: weeks.length } : null;
}

/** "Month 1 · Week 3" for a date inside a block, the block name alone when it tracks no weeks. */
export function blockWeekLabel(block, dateStr) {
    if (!block) return '';
    const week = weekForDate(block, dateStr);
    return week ? `${block.name} · Week ${week.index}` : block.name;
}
