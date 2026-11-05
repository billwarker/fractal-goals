// @ts-check
/**
 * Many-series discipline for analytics charts. Rows (entity × bucket × value) become at most
 * MAX_SERIES series: the largest by total in range, with the rest folded into one "Other". Colour
 * follows the entity, never its rank: with up to MAX_SERIES candidates each keeps its slot in the
 * caller's stable order, so a filter that hides one series never repaints the others.
 */

export const MAX_SERIES = 8;
export const OTHER_KEY = '__other__';

/**
 * @typedef {{ key: string, label: string, group?: string, meta?: any }} SeriesEntity
 * @typedef {{ key: string, bucket: string, value: number }} SeriesRow
 * @typedef {{
 *   key: string, label: string, group?: string, meta?: any,
 *   slot: number | null, data: number[], total: number, folded?: SeriesEntity[],
 * }} Series
 */

/**
 * @param {{ entities: SeriesEntity[], rows: SeriesRow[], buckets: string[], maxSeries?: number }} input
 *   entities in a stable order (it decides colours), rows of values, buckets in axis order.
 * @returns {{ series: Series[], bucketTotals: number[], total: number }}
 */
export function buildSeries({ entities, rows, buckets, maxSeries = MAX_SERIES }) {
    const bucketIndex = new Map(buckets.map((bucket, index) => [bucket, index]));
    /** @type {Map<string, number[]>} */
    const valuesByKey = new Map();
    rows.forEach(({ key, bucket, value }) => {
        const index = bucketIndex.get(bucket);
        if (index === undefined || !Number.isFinite(value) || value === 0) return;
        if (!valuesByKey.has(key)) valuesByKey.set(key, buckets.map(() => 0));
        /** @type {number[]} */ (valuesByKey.get(key))[index] += value;
    });

    const sum = (/** @type {number[]} */ values) => values.reduce((total, value) => total + value, 0);
    const present = entities
        .map((entity, order) => ({ entity, order, data: valuesByKey.get(entity.key) }))
        .filter((item) => item.data && sum(/** @type {number[]} */ (item.data)) > 0)
        .map((item) => ({ ...item, data: /** @type {number[]} */ (item.data), total: sum(/** @type {number[]} */ (item.data)) }));

    const overflow = present.length > maxSeries;
    const byTotal = [...present].sort((left, right) => right.total - left.total || left.order - right.order);
    const kept = overflow ? byTotal.slice(0, maxSeries - 1) : byTotal;
    const folded = overflow ? byTotal.slice(maxSeries - 1) : [];
    // Up to maxSeries candidates: each keeps its own slot. Beyond that, slots go to the shown series
    // in stable order, so they stay distinct and are never cycled.
    const stableSlots = entities.length <= maxSeries;
    const shownInOrder = [...kept].sort((left, right) => left.order - right.order);

    /** @type {Series[]} */
    const series = kept.map((item) => ({
        key: item.entity.key,
        label: item.entity.label,
        group: item.entity.group,
        meta: item.entity.meta,
        slot: stableSlots ? item.order : shownInOrder.indexOf(item),
        data: item.data,
        total: item.total,
    }));
    if (folded.length) {
        const data = buckets.map((_, index) => sum(folded.map((item) => item.data[index])));
        series.push({
            key: OTHER_KEY, label: `Other (${folded.length})`, slot: null, data, total: sum(data),
            folded: folded.map((item) => item.entity),
        });
    }
    const bucketTotals = buckets.map((_, index) => sum(series.map((item) => item.data[index])));
    return { series, bucketTotals, total: sum(bucketTotals) };
}

/**
 * The colour of a series: its palette slot, or the neutral "Other" colour.
 * @param {Series} series
 * @param {{ seriesColors: string[], otherSeriesColor: string }} theme
 */
export function seriesColor(series, theme) {
    return series.slot == null ? theme.otherSeriesColor : theme.seriesColors[series.slot % theme.seriesColors.length];
}
