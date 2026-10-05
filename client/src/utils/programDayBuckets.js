/**
 * Days tab buckets: a program day's dates grouped by block, then by week within each block,
 * so the Days tab can jump to the start of a block or week. Blocks that track weeks
 * use their chosen start day; others step seven days from their start date, as metrics do.
 * Everything is derived from the occurrences and the selected date; nothing is stored.
 */
import { getDatePart } from './dateUtils';
import { blockWeeks, trackedWeekStartDay } from './programBlockWeeks';
import { occurrenceStatus } from './programDaysView';

const DAY_MS = 86_400_000;

function dayCount(start, end) {
    return Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS) + 1;
}

function bucketOf(dates, occurrenceByDate) {
    return {
        dates,
        completed: dates.filter((date) => occurrenceStatus(occurrenceByDate.get(date)) === 'complete').length,
    };
}

/**
 * ``{ blocks, outside }``: each block (by start date) with its length, this day's dates in
 * it, and its weeks with theirs; ``outside`` holds dates no block covers, or ``null``.
 */
export function buildDayBuckets(blocks = [], occurrences = []) {
    const occurrenceByDate = new Map(occurrences.map((occurrence) => [occurrence.date, occurrence]));
    const dates = occurrences.map((occurrence) => occurrence.date).sort();
    const claimed = new Set();
    const result = (blocks || [])
        .map((block) => ({ block, start: getDatePart(block?.start_date), end: getDatePart(block?.end_date) }))
        .filter(({ start, end }) => start && end && start <= end)
        .sort((a, b) => a.start.localeCompare(b.start))
        .map(({ block, start, end }) => {
            const inBlock = dates.filter((date) => start <= date && date <= end && !claimed.has(date));
            inBlock.forEach((date) => claimed.add(date));
            return {
                id: block.id,
                name: block.name,
                color: block.color || null,
                start,
                end,
                length: dayCount(start, end),
                ...bucketOf(inBlock, occurrenceByDate),
                weeks: blockWeeks(start, end, trackedWeekStartDay(block)).map((week) => ({
                    ...week,
                    length: dayCount(week.start, week.end),
                    ...bucketOf(inBlock.filter((date) => week.start <= date && date <= week.end), occurrenceByDate),
                })),
            };
        });
    const outside = dates.filter((date) => !claimed.has(date));
    return { blocks: result, outside: outside.length ? bucketOf(outside, occurrenceByDate) : null };
}

/** The block and week containing ``date`` (``outside`` when no block covers it). */
export function bucketScope(buckets, date) {
    const block = buckets.blocks.find((item) => item.dates.includes(date)) || null;
    if (!block) {
        return { block: null, week: null, outside: Boolean(buckets.outside?.dates.includes(date)) };
    }
    return { block, week: block.weeks.find((week) => week.dates.includes(date)) || null, outside: false };
}

/**
 * The date a picked bucket jumps to: the first in its period. The other column's date is
 * skipped unless it is the only one (picking it then swaps the columns).
 */
export function pickBucketDate(dates, blockedDate = null) {
    return dates.find((date) => date !== blockedDate) || dates[0] || null;
}
