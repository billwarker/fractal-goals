// @ts-check

/** @param {unknown} value */
const toId = (value) => (value == null ? null : String(value));

/**
 * Siblings in a sequence sit together, in step order, starting where the track's first member
 * would sort; other siblings keep their places. Shared by the hierarchy lists and the flow tree.
 * @template T
 * @param {T[]} children
 * @returns {T[]}
 */
export function orderSequencedSiblings(children) {
    const read = (/** @type {any} */ child, /** @type {string} */ key) => child?.[key] ?? child?.attributes?.[key];
    const trackOf = (/** @type {T} */ child) => toId(read(child, 'sequence_track_id'));
    const positionOf = (/** @type {T} */ child) => Number(read(child, 'sequence_position')) || 0;
    /** @type {Map<string, T[]>} */
    const tracks = new Map();
    children.forEach((child) => {
        const trackId = trackOf(child);
        if (trackId) tracks.set(trackId, [...(tracks.get(trackId) || []), child]);
    });
    if (tracks.size === 0) return children;
    const placed = new Set();
    return children.flatMap((child) => {
        const trackId = trackOf(child);
        if (!trackId) return [child];
        if (placed.has(trackId)) return [];
        placed.add(trackId);
        return [.../** @type {T[]} */ (tracks.get(trackId))].sort((a, b) => positionOf(a) - positionOf(b));
    });
}
