import { canComputeYield, formatAggValue } from '../../utils/progressAggregations';

/**
 * The derived-metric rows an activity instance shows under its sets, for `ActivitySummaryRail`:
 * each additive total, total yield, and the best set. Shared by the session page and Program
 * Days plans so both calculate and label them the same way. `deltaFor(key)` adds a progress
 * indicator after a row's value (`yield`, or `total-<metric id>`), or null for none.
 */
export function buildActivitySummaryMetrics(autoAgg, trackedMetricDefs, { deltaFor = () => null } = {}) {
    if (!autoAgg) return [];
    const hasYield = canComputeYield(trackedMetricDefs) && autoAgg.total_yield != null;
    const hasBestSet = autoAgg.best_set_index != null;
    const withDelta = (key, text) => {
        const delta = deltaFor(key);
        return delta ? <>{text}{delta}</> : text;
    };

    const metrics = trackedMetricDefs
        .filter((md) => md.is_additive !== false && autoAgg.additive_totals?.[md.id] != null)
        .map((md) => ({
            key: `total-${md.id}`,
            label: `Total ${md.name}:`,
            value: withDelta(`total-${md.id}`, `${formatAggValue(autoAgg.additive_totals[md.id])} ${md.unit}`),
        }));
    if (hasYield) {
        metrics.push({ key: 'yield', label: 'Total yield:', value: withDelta('yield', formatAggValue(autoAgg.total_yield)) });
    }
    if (hasBestSet) {
        const bestSetLabel = hasYield && autoAgg.best_set_yield != null
            ? `= ${formatAggValue(autoAgg.best_set_yield)}`
            : trackedMetricDefs
                .filter((md) => autoAgg.best_set_values?.[md.id] != null)
                .map((md) => `${formatAggValue(autoAgg.best_set_values[md.id])} ${md.unit}`)
                .join(' × ');
        if (bestSetLabel) {
            metrics.push({
                key: 'best-set',
                label: 'Best:',
                value: `Set ${autoAgg.best_set_index + 1} ${bestSetLabel}`,
                muted: true,
            });
        }
    }
    return metrics;
}
