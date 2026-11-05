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
