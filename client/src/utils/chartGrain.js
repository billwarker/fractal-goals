// @ts-check
/**
 * Calendar time grains for chart buckets: which grain a span gets and where its buckets start.
 * Mirrors `services/chart_grain.py`; both are checked against `tests/fixtures/chart_grain_cases.json`.
 * Dates are local calendar days as "YYYY-MM-DD".
 */

/** @typedef {'day' | 'week' | 'month'} Grain */

/** @type {Grain[]} */
export const GRAINS = ['day', 'week', 'month'];
export const AUTO_DAY_MAX_SPAN_DAYS = 45;
export const AUTO_WEEK_MAX_SPAN_DAYS = 400;

const DAY_MS = 86400000;

/** @param {string} key */
function toUtcDay(key) {
    const [year, month, day] = String(key).slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
}

/** @param {Date} date */
function toKey(date) {
    return date.toISOString().slice(0, 10);
}

/**
 * The local calendar day of a Date or timestamp, as "YYYY-MM-DD".
 * @param {Date | string | number} value
 */
export function localDayKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The first day of the bucket holding `day` (weeks start on Monday).
 * @param {string} day
 * @param {Grain} grain
 */
export function bucketStart(day, grain) {
    const date = toUtcDay(day);
    if (grain === 'week') {
        const weekday = (date.getUTCDay() + 6) % 7;
        return toKey(new Date(date.getTime() - weekday * DAY_MS));
    }
    if (grain === 'month') return toKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
    return toKey(date);
}

/**
 * How many buckets of `grain` the inclusive span first..last touches.
 * @param {string} first
 * @param {string} last
 * @param {Grain} grain
 */
export function bucketCount(first, last, grain) {
    const start = toUtcDay(bucketStart(first, grain));
    const end = toUtcDay(bucketStart(last, grain));
    if (grain === 'week') return Math.round((end.getTime() - start.getTime()) / (7 * DAY_MS)) + 1;
    if (grain === 'month') {
        return (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1;
    }
    return Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
}

/**
 * The requested grain (or the auto choice for the span), coarsened until it fits the budget.
 * @param {string | null | undefined} requested
 * @param {string} first
 * @param {string} last
 * @param {number} pointBudget
 * @returns {Grain}
 */
export function resolveGrain(requested, first, last, pointBudget) {
    /** @type {Grain} */
    let grain;
    if (GRAINS.includes(/** @type {Grain} */ (requested))) {
        grain = /** @type {Grain} */ (requested);
    } else {
        const spanDays = Math.round((toUtcDay(last).getTime() - toUtcDay(first).getTime()) / DAY_MS);
        grain = spanDays <= AUTO_DAY_MAX_SPAN_DAYS ? 'day' : spanDays <= AUTO_WEEK_MAX_SPAN_DAYS ? 'week' : 'month';
    }
    let index = GRAINS.indexOf(grain);
    while (index < GRAINS.length - 1 && bucketCount(first, last, GRAINS[index]) > pointBudget) index += 1;
    return GRAINS[index];
}

/**
 * Every bucket start from first to last, so charts show empty periods as gaps rather than closing them up.
 * @param {string} first
 * @param {string} last
 * @param {Grain} grain
 */
export function bucketStarts(first, last, grain) {
    const starts = [];
    const end = bucketStart(last, grain);
    let cursor = bucketStart(first, grain);
    while (cursor <= end) {
        starts.push(cursor);
        const date = toUtcDay(cursor);
        cursor = grain === 'month'
            ? toKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)))
            : toKey(new Date(date.getTime() + (grain === 'week' ? 7 : 1) * DAY_MS));
    }
    return starts;
}
