/**
 * Progress summary + delta presentational components for session activity items.
 * Extracted from SessionActivityItem.jsx (audit P1-5) — no behavior change.
 */
import { useMemo } from 'react';

import {
    canComputeYield,
    computeAutoAggregations,
    filterTrackedMetricDefs,
    formatAggValue,
} from '../../utils/progressAggregations';
import ActivitySummaryRail from '../common/ActivitySummaryRail';
import styles from './SessionActivityItem.module.css';

/**
 * Progress summary shown below sets: additive totals, yield, best set.
 */
function SessionActivityProgressSummary({ sets, metricDefs, activeProgress, displayMode = 'percent' }) {
    const isExcluded = activeProgress?.included === false;
    const trackedMetricDefs = useMemo(() => filterTrackedMetricDefs(metricDefs), [metricDefs]);
    const autoAgg = useMemo(() => {
        // The rendered sets are the current editing source of truth. Progress
        // comparisons can lag one mutation behind because they are calculated
        // by a separate query, so use their aggregation only when this view has
        // no set data of its own (for example, a direct metric result).
        if (sets?.length && trackedMetricDefs.length > 0) {
            return computeAutoAggregations(sets, trackedMetricDefs);
        }
        const fromRecord = activeProgress?.derived_summary?.auto_aggregations;
        if (fromRecord) return fromRecord;
        return null;
    }, [activeProgress, sets, trackedMetricDefs]);

    if (!autoAgg && !isExcluded) return null;

    const yieldEligible = canComputeYield(trackedMetricDefs);
    const hasYield = Boolean(autoAgg) && yieldEligible && autoAgg.total_yield != null;
    const hasAdditive = Boolean(autoAgg) && Object.keys(autoAgg.additive_totals).length > 0;
    const hasBestSet = Boolean(autoAgg) && autoAgg.best_set_index != null;

    if (!hasYield && !hasAdditive && !hasBestSet && !isExcluded) return null;

    // Previous total yield for delta display
    const prevYield = (() => {
        if (!activeProgress?.metric_comparisons) return null;
        const yieldComp = activeProgress.metric_comparisons.find((mc) => mc.type === 'yield');
        return yieldComp?.previous_value ?? null;
    })();

    const isFirstInstance = activeProgress?.is_first_instance;
    const additiveMetricDefs = hasAdditive
        ? trackedMetricDefs.filter((md) => (
            md.is_additive !== false && autoAgg.additive_totals[md.id] != null
        ))
        : [];

    const bestSetLabel = hasBestSet
        ? (hasYield && autoAgg.best_set_yield != null
            ? `= ${formatAggValue(autoAgg.best_set_yield)}`
            : trackedMetricDefs
                .filter((md) => autoAgg.best_set_values[md.id] != null)
                .map((md) => `${formatAggValue(autoAgg.best_set_values[md.id])} ${md.unit}`)
                .join(' × ')
        )
        : null;

    const summaryMetrics = additiveMetricDefs.map((md) => ({
        key: `total-${md.id}`,
        label: `Total ${md.name}:`,
        value: `${formatAggValue(autoAgg.additive_totals[md.id])} ${md.unit}`,
    }));
    if (hasYield) {
        summaryMetrics.push({
            key: 'yield',
            label: 'Total yield:',
            value: (
                <>
                    {formatAggValue(autoAgg.total_yield)}
                    {!isFirstInstance && prevYield != null && autoAgg.total_yield != null && (
                        <SummaryDelta current={autoAgg.total_yield} previous={prevYield} higherIsBetter styles={styles} displayMode={displayMode} />
                    )}
                </>
            ),
        });
    }
    if (hasBestSet && bestSetLabel) {
        summaryMetrics.push({
            key: 'best-set',
            label: 'Best:',
            value: `Set ${autoAgg.best_set_index + 1} ${bestSetLabel}`,
            muted: true,
        });
    }

    return (
        <div className={styles.progressSummary}>
            <ActivitySummaryRail metrics={summaryMetrics} />
            {isExcluded && (
                <div className={styles.progressExcluded}>
                    Excluded from the active progress view. Metrics remain available as raw session data.
                </div>
            )}
        </div>
    );
}

function SummaryDelta({ current, previous, higherIsBetter = true, styles, displayMode = 'percent' }) {
    if (previous == null || current == null) return null;
    const delta = current - previous;
    if (delta === 0) return null;
    const improved = (delta > 0 && higherIsBetter) || (delta < 0 && !higherIsBetter);
    let label;
    if (displayMode === 'absolute') {
        label = `${delta > 0 ? '+' : ''}${formatAggValue(delta)}`;
    } else {
        const pct = previous !== 0 ? Math.abs(delta / previous * 100) : null;
        label = pct != null
            ? `${improved ? '▲' : '▼'}${formatAggValue(pct)}%`
            : `${delta > 0 ? '+' : ''}${formatAggValue(delta)}`;
    }
    const cls = improved ? styles.metricInlineProgressImproved : styles.metricInlineProgressRegressed;
    return <span className={`${styles.metricInlineProgress} ${cls}`}> ({label})</span>;
}

export default SessionActivityProgressSummary;
export { SummaryDelta };
