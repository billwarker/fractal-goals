/**
 * Client-side auto-aggregation utility for activity progress display.
 *
 * Computes additive totals, per-set yields, total yield, and best set
 * directly from live sets data + metric definitions — no backend round-trip needed.
 * Mirrors the logic in services/progress_service.py _compute_auto_aggregations().
 */

function coerceNumeric(value) {
    if (value == null || (typeof value === 'string' && !value.trim())) return null;
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
}

function findBestSetIndex(sets, metricDefs, primaryDef) {
    if (!primaryDef) return null;

    const rankedDefs = [primaryDef, ...metricDefs.filter((md) => md.id !== primaryDef.id)];
    let bestIndex = null;
    let bestValues = null;

    for (let si = 0; si < sets.length; si++) {
        const valuesByMetric = new Map(
            (sets[si].metrics || []).map((metric) => [
                metric.metric_id || metric.metric_definition_id,
                coerceNumeric(metric.value),
            ])
        );
        const values = rankedDefs.map((md) => valuesByMetric.get(md.id) ?? null);
        if (values[0] === null) continue;

        let isBetter = bestValues === null;
        if (bestValues !== null) {
            for (let mi = 0; mi < rankedDefs.length; mi++) {
                const candidate = values[mi];
                const incumbent = bestValues[mi];
                if (candidate === incumbent) continue;
                if (candidate === null) break;
                if (incumbent === null) { isBetter = true; break; }
                isBetter = rankedDefs[mi].higher_is_better !== false
                    ? candidate > incumbent
                    : candidate < incumbent;
                break;
            }
        }
        if (isBetter) {
            bestIndex = si;
            bestValues = values;
        }
    }
    return bestIndex;
}

export function filterTrackedMetricDefs(metricDefs) {
    return (metricDefs || []).filter((md) => md?.track_progress !== false);
}

export function canComputeYield(metricDefs) {
    return Array.isArray(metricDefs)
        && metricDefs.length >= 2
        && metricDefs.every((md) => md?.is_multiplicative === true);
}

export function resolveAutoAggregationMode(metricDef, metricDefs, { hasSets = false } = {}) {
    if (!metricDef || !hasSets) return 'last';
    const hasBestSetAnchor = (metricDefs || []).some((md) => md?.is_best_set_metric);
    if (metricDef.is_best_set_metric || (hasBestSetAnchor && !metricDef.is_multiplicative)) return 'max';
    if (metricDef.is_multiplicative) return 'last';
    if (metricDef.is_additive !== false) return 'sum';
    return 'max';
}

/**
 * Given an array of sets and metric definitions, compute:
 *   - additive_totals: { [metricId]: sum } for additive metrics
 *   - yield_per_set: [{ set_index, yield }] when all tracked metrics are multiplicative (requires 2+)
 *   - total_yield: sum of per-set yields (null if not applicable)
 *   - best_set_index: index of best set (null if no sets)
 *   - best_set_yield: yield of best set (null if not multiplicative)
 *   - best_set_values: { [metricId]: value } for all metrics in the best set
 *
 * @param {Array} sets - array of set objects with { metrics: [{ metric_id, value }] }
 * @param {Array} metricDefs - array of metric definition objects with
 *   { id, is_multiplicative, is_additive, is_best_set_metric, higher_is_better }
 */
export function computeAutoAggregations(sets, metricDefs) {
    const result = {
        additive_totals: {},
        yield_per_set: [],
        total_yield: null,
        best_set_index: null,
        best_set_yield: null,
        best_set_values: {},
    };

    if (!Array.isArray(metricDefs) || metricDefs.length === 0) return result;
    if (!Array.isArray(sets) || sets.length === 0) return result;

    const hasYield = canComputeYield(metricDefs);
    const multDefs = hasYield ? metricDefs : [];

    // --- Additive totals ---
    for (const md of metricDefs) {
        if (md.is_multiplicative || md.is_additive === false) continue;
        const values = [];
        for (const s of sets) {
            for (const m of (s.metrics || [])) {
                const mid = m.metric_id || m.metric_definition_id;
                if (mid === md.id) {
                    const v = coerceNumeric(m.value);
                    if (v !== null) values.push(v);
                }
            }
        }
        if (values.length > 0) {
            result.additive_totals[md.id] = values.reduce((a, b) => a + b, 0);
        }
    }

    // --- Yield per set and total yield ---
    if (hasYield) {
        let totalYield = 0;
        let hasAny = false;
        for (let si = 0; si < sets.length; si++) {
            const s = sets[si];
            const setMetrics = {};
            for (const m of (s.metrics || [])) {
                const mid = m.metric_id || m.metric_definition_id;
                setMetrics[mid] = coerceNumeric(m.value);
            }
            let product = 1;
            let complete = true;
            for (const md of multDefs) {
                const val = setMetrics[md.id];
                if (val == null) { complete = false; break; }
                product *= val;
            }
            if (complete) {
                result.yield_per_set.push({ set_index: si, yield: product });
                totalYield += product;
                hasAny = true;
            }
        }
        if (hasAny) result.total_yield = totalYield;
    }

    // --- Best set ---
    const anchorDef = metricDefs.find((md) => md.is_best_set_metric) || null;

    if (anchorDef) {
        result.best_set_index = findBestSetIndex(sets, metricDefs, anchorDef);
    } else if (hasYield && result.yield_per_set.length > 0) {
        // Best set = highest yield set
        const best = result.yield_per_set.reduce((a, b) => b.yield > a.yield ? b : a);
        result.best_set_index = best.set_index;
        result.best_set_yield = best.yield;
    } else if (metricDefs.length > 0) {
        // Single/non-multiplicative: best by first metric's higher_is_better
        const primary = metricDefs[0];
        result.best_set_index = findBestSetIndex(sets, metricDefs, primary);
    }

    // Populate best_set_values
    if (result.best_set_index !== null && result.best_set_index < sets.length) {
        const bestSet = sets[result.best_set_index];
        for (const m of (bestSet.metrics || [])) {
            const mid = m.metric_id || m.metric_definition_id;
            const v = coerceNumeric(m.value);
            if (mid && v !== null) result.best_set_values[mid] = v;
        }
        // Compute yield for best set if multiplicative and not already set
        if (hasYield && result.best_set_yield === null) {
            const setMetrics = {};
            for (const m of (bestSet.metrics || [])) {
                const mid = m.metric_id || m.metric_definition_id;
                setMetrics[mid] = coerceNumeric(m.value);
            }
            let product = 1;
            let complete = true;
            for (const md of multDefs) {
                const val = setMetrics[md.id];
                if (val == null) { complete = false; break; }
                product *= val;
            }
            if (complete) result.best_set_yield = product;
        }
    }

    return result;
}

/**
 * Format a numeric value for display (drops trailing .0)
 */
export function formatAggValue(value) {
    if (value == null) return '';
    const n = Number(value);
    if (Number.isNaN(n)) return String(value);
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(1).replace(/\.0$/, '');
}
