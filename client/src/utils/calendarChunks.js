/**
 * Month chunks for range-bounded calendar loading. A chunk is a calendar month
 * keyed `YYYY-MM`; scrolling only switches chunks on and off, so every chunk is
 * cached and reused under one stable key. Dates are `YYYY-MM-DD` strings in UTC.
 */

function parseMonth(monthKey) {
    const [year, month] = String(monthKey).split('-').map(Number);
    return { year, month };
}

function toMonthKey(year, month) {
    const date = new Date(Date.UTC(year, month - 1, 1));
    return date.toISOString().slice(0, 7);
}

export function shiftMonthKey(monthKey, amount) {
    const { year, month } = parseMonth(monthKey);
    return toMonthKey(year, month + amount);
}

/** `{ start, end }` (inclusive) of one month chunk. */
export function chunkRange(monthKey) {
    const { year, month } = parseMonth(monthKey);
    const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return { start: `${monthKey}-01`, end: last };
}

/** Every month chunk the inclusive date range touches, in order. */
export function monthChunksForRange(start, end) {
    const first = String(start || '').slice(0, 7);
    const last = String(end || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(first) || !/^\d{4}-\d{2}$/.test(last) || first > last) return [];
    const chunks = [];
    for (let month = first; month <= last; month = shiftMonthKey(month, 1)) chunks.push(month);
    return chunks;
}

/** The `amount` chunks either side of `chunks` that are not already in it. */
export function overscanChunks(chunks, amount = 1) {
    if (!chunks.length) return [];
    const present = new Set(chunks);
    const extra = [];
    for (let offset = 1; offset <= amount; offset += 1) {
        extra.push(shiftMonthKey(chunks[0], -offset), shiftMonthKey(chunks[chunks.length - 1], offset));
    }
    return [...new Set(extra)].filter((month) => !present.has(month));
}
