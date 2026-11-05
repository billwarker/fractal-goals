// @ts-check
/**
 * The shared slots of an aligned axis: every point from any of the charts, once, in order. A point
 * is keyed by what it really is (a session's activity instance, say), since labels can repeat.
 *
 * @typedef {{ key: string, at: number, label: string }} AxisPoint
 */

/**
 * @param {AxisPoint[][]} pointLists
 * @returns {AxisPoint[]}
 */
export function mergeSlots(pointLists) {
    const byKey = new Map();
    pointLists.flat().forEach((point) => {
        if (!byKey.has(point.key)) byKey.set(point.key, point);
    });
    return [...byKey.values()].sort((a, b) => a.at - b.at || String(a.key).localeCompare(String(b.key)));
}

/**
 * The range each of a chart's value axes shares with panels beside it, for axes that mean the same
 * thing: wide enough to hold every panel's values. Axes with no match aren't included.
 *
 * @typedef {{ scaleId: string, identity: string, min: number, max: number }} ValueAxis
 * @param {ValueAxis[]} own
 * @param {ValueAxis[][]} peers
 * @returns {Record<string, { min: number, max: number }>}
 */
export function sharedRanges(own, peers) {
    return Object.fromEntries(own.flatMap((axis) => {
        const matching = peers.flat().filter((other) => other.identity === axis.identity);
        if (!matching.length) return [];
        return [[axis.scaleId, {
            min: Math.min(axis.min, ...matching.map((other) => other.min)),
            max: Math.max(axis.max, ...matching.map((other) => other.max)),
        }]];
    }));
}

/**
 * A chart's values laid out over the slots, with a gap where it has none.
 * @template T
 * @param {string[]} keys the chart's own point keys
 * @param {T[]} values the chart's values, by the same index
 * @param {AxisPoint[]} slots
 * @returns {(T | null)[]}
 */
export function valuesOnSlots(keys, values, slots) {
    const byKey = new Map(keys.map((key, index) => [key, values[index]]));
    return slots.map((slot) => (byKey.has(slot.key) ? /** @type {T} */ (byKey.get(slot.key)) : null));
}
