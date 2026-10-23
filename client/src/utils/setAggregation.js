// @ts-check
/**
 * How a session's sets become one value, for every chart that plots activity metrics: the
 * Progress pane, Analytics' Metric Trends and Metric Scatter Plot, and goal condition charts.
 *
 * - `top`: the best value, by the metric's direction (`higher_is_better`, default higher);
 * - `average`: the mean;
 * - `total` (yield only): the sum of the per-set yields, as goal conditions count it.
 */

/** @param {unknown} value */
export function toNumber(value) {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

/** @param {any} metric */
export const metricRef = (metric) => metric?.metric_id || metric?.metric_definition_id || null;

/**
 * Metrics multiplied into the activity's yield (two or more tracked, all multiplicative), as on
 * the server (services/goal_condition_service.yield_metric_ids).
 * @param {any} activity
 * @returns {string[]}
 */
export function yieldMetricIds(activity) {
    const metrics = (activity?.metric_definitions || []).filter((/** @type {any} */ metric) => (
        !metric?.deleted_at && metric?.is_active !== false && metric.track_progress !== false
    ));
    if (metrics.length < 2 || !metrics.every((/** @type {any} */ metric) => metric.is_multiplicative !== false)) {
        return [];
    }
    return [...metrics]
        .sort((a, b) => ((a.sort_order || 0) - (b.sort_order || 0)) || String(a.id).localeCompare(String(b.id)))
        .map((metric) => String(metric.id));
}

/** @param {any} metricDef */
export const lowerIsBetter = (metricDef) => metricDef?.higher_is_better === false;

/**
 * Metric values per set (instance-level metrics count as one set when there are no sets).
 * @param {any} instance
 * @returns {Map<string, number[]>[]}
 */
export function evidenceSets(instance) {
    const sets = (instance?.sets || []).filter((/** @type {any} */ set) => set?.status !== 'skipped');
    const rows = sets.length > 0
        ? sets.map((/** @type {any} */ set) => set?.metrics || [])
        : [instance?.metrics || instance?.metric_values || []];
    return rows.map((/** @type {any[]} */ metrics) => {
        const values = new Map();
        metrics.forEach((metric) => {
            const id = metricRef(metric);
            const number = toNumber(metric?.value);
            if (!id || number == null) return;
            values.set(id, [...(values.get(id) || []), number]);
        });
        return values;
    }).filter((values) => values.size > 0);
}

/**
 * @param {any[]} metrics
 * @param {string} metricId
 * @param {string} split 'all' or a split id
 */
function valuesIn(metrics, metricId, split) {
    return (Array.isArray(metrics) ? metrics : [])
        .filter((metric) => metricRef(metric) === metricId)
        .filter((metric) => split === 'all' || !metric.split_id || metric.split_id === split)
        .map((metric) => toNumber(metric.value))
        .filter((value) => value != null);
}

/**
 * Every value of a metric in an instance (its direct values and each set's), optionally one split.
 * @param {any} instance
 * @param {string} metricId
 * @param {string} [split]
 * @returns {number[]}
 */
export function metricValues(instance, metricId, split = 'all') {
    const direct = valuesIn(instance?.metrics || instance?.metric_values || [], metricId, split);
    const fromSets = (Array.isArray(instance?.sets) ? instance.sets : [])
        .flatMap((/** @type {any} */ set) => valuesIn(set?.metrics || [], metricId, split));
    return /** @type {number[]} */ ([...direct, ...fromSets]);
}

/**
 * @param {number[]} values
 * @param {'top'|'average'|'total'} mode
 * @param {boolean} [lower] whether lower is better (for `top`)
 */
function combine(values, mode, lower = false) {
    if (!values.length) return null;
    if (mode === 'average') return values.reduce((sum, value) => sum + value, 0) / values.length;
    if (mode === 'total') return values.reduce((sum, value) => sum + value, 0);
    return lower ? Math.min(...values) : Math.max(...values);
}

/**
 * One value of a metric for an instance.
 * @param {any} instance
 * @param {any} metricDef
 * @param {'top'|'average'} [mode]
 * @param {string} [split]
 */
export function aggregateMetric(instance, metricDef, mode = 'top', split = 'all') {
    return combine(metricValues(instance, metricDef?.id, split), mode, lowerIsBetter(metricDef));
}

/**
 * Each set's yield: the product of its yield metrics' best values (sets missing one are skipped).
 * @param {any} instance
 * @param {string[]} yieldIds
 */
export function setYields(instance, yieldIds) {
    if (!yieldIds || yieldIds.length < 2) return [];
    return /** @type {number[]} */ (evidenceSets(instance).map((values) => {
        let product = 1;
        for (const id of yieldIds) {
            const metricValuesForId = values.get(id);
            if (!metricValuesForId || metricValuesForId.length === 0) return null;
            product *= Math.max(...metricValuesForId);
        }
        return product;
    }).filter((value) => value != null));
}

/**
 * One yield value for an instance: its top set, the average set, or the total.
 * @param {any} instance
 * @param {string[]} yieldIds
 * @param {'top'|'average'|'total'} [mode]
 */
export function aggregateYield(instance, yieldIds, mode = 'total') {
    return combine(setYields(instance, yieldIds), mode);
}

/**
 * The set a scatter point stands for under `top`: the best by `rankBy`'s direction.
 * @template {Record<string, any>} T
 * @param {T[]} points one per set, keyed by metric id
 * @param {any} rankBy metric definition
 * @returns {T | null}
 */
export function topSetPoint(points, rankBy) {
    if (!points.length) return null;
    const lower = lowerIsBetter(rankBy);
    return points.reduce((best, point) => {
        const value = point[rankBy.id];
        const bestValue = best[rankBy.id];
        if (value == null) return best;
        if (bestValue == null) return point;
        return (lower ? value < bestValue : value > bestValue) ? point : best;
    });
}
