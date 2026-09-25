/**
 * Pure date helpers for the program calendar's continuous (unbroken weeks) mode.
 * Weeks start on Sunday, matching the calendar's `firstDay`. All dates are
 * `YYYY-MM-DD` strings evaluated in UTC so results never shift with the viewer's zone.
 */

export const CONTINUOUS_FIRST_DAY = 0;
// A year centred on its anchor: 26 weeks (about six months) either side. 52 weeks
// = 364 days keeps one read-model request under its 366-day window.
export const CONTINUOUS_WEEKS = 52;
const WEEKS_BEFORE = CONTINUOUS_WEEKS / 2;
// Rows this close to the end cannot scroll up to the top row (where the title
// reads its month), so navigating there re-centres the window instead.
const SCROLL_TAIL_WEEKS = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

const MONTH_TITLE = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const MONTH_SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });

function toUtc(dateStr) {
    const [year, month, day] = String(dateStr).slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
}

function toDateStr(date) {
    return date.toISOString().slice(0, 10);
}

export function addDays(dateStr, amount) {
    return toDateStr(new Date(toUtc(dateStr).getTime() + amount * DAY_MS));
}

export function startOfWeek(dateStr) {
    const offset = (toUtc(dateStr).getUTCDay() - CONTINUOUS_FIRST_DAY + 7) % 7;
    return addDays(dateStr, -offset);
}

/**
 * The week-aligned year the continuous view renders, centred on `anchor`:
 * 26 weeks before its week and 26 weeks from it. Returns `{ start, end, weeks }`
 * with `end` inclusive.
 */
export function getContinuousWindow(anchor) {
    const start = addDays(startOfWeek(anchor), -WEEKS_BEFORE * 7);
    return { start, end: addDays(start, CONTINUOUS_WEEKS * 7 - 1), weeks: CONTINUOUS_WEEKS };
}

/** Whether `dateStr` can scroll to the top row of `window` without re-centring it. */
export function canScrollWithin(dateStr, window) {
    return Boolean(window && dateStr
        && dateStr >= window.start
        && dateStr <= addDays(window.end, -SCROLL_TAIL_WEEKS * 7));
}

/** First of the month (`YYYY-MM-01`) that a week row belongs to: its Thursday's month. */
export function getWeekRowMonth(dates) {
    const sorted = (dates || []).filter(Boolean).sort();
    if (!sorted.length) return null;
    const thursday = sorted.find((value) => toUtc(value).getUTCDay() === 4)
        || sorted[Math.floor(sorted.length / 2)];
    return `${thursday.slice(0, 7)}-01`;
}

export function formatMonthTitle(monthStart) {
    return monthStart ? MONTH_TITLE.format(toUtc(monthStart)) : '';
}

export function shiftMonth(monthStart, amount) {
    const date = toUtc(monthStart);
    return toDateStr(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1)));
}

/** The date to scroll to so `monthStart`'s month owns the top row: its first Thursday. */
export function getMonthScrollTarget(monthStart) {
    const offset = (4 - toUtc(monthStart).getUTCDay() + 7) % 7;
    return addDays(monthStart, offset);
}

/** "Oct" on the first of a month; null otherwise. */
export function getMonthStartLabel(dateStr) {
    if (!dateStr || !dateStr.endsWith('-01')) return null;
    return MONTH_SHORT.format(toUtc(dateStr));
}

/**
 * Month-edge markers for an unbroken week grid: the first seven days of a month
 * sit under the previous month (top edge), and the 1st starts mid-row (left edge)
 * unless it opens the week. Alternate months get a tint.
 */
export function getContinuousCellMarkers(dateStr) {
    const date = toUtc(dateStr);
    const dayOfMonth = date.getUTCDate();
    return {
        monthEdgeTop: dayOfMonth <= 7,
        monthEdgeLeft: dayOfMonth === 1 && date.getUTCDay() !== CONTINUOUS_FIRST_DAY,
        alternateMonth: date.getUTCMonth() % 2 === 1,
    };
}
