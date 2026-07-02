/**
 * Progress summary + delta presentational components for session activity items.
 * Extracted from SessionActivityItem.jsx (audit P1-5) — no behavior change.
 */
import React, { useMemo } from 'react';

import {
    canComputeYield,
    computeAutoAggregations,
    filterTrackedMetricDefs,
    formatAggValue,
} from '../../utils/progressAggregations';
import styles from './SessionActivityItem.module.css';

/**
 * Progress summary shown below sets: additive totals, yield, best set.
 */
function SessionActivityProgressSummary({ sets, metricDefs, activeProgress, displayMode = 'percent' }) {
    const trackedMetricDefs = useMemo(() => filterTrackedMetricDefs(metricDefs), [metricDefs]);
    const autoAgg = useMemo(() => {
        const fromRecord = activeProgress?.derived_summary?.auto_aggregations;
        if (fromRecord) return fromRecord;
        if (!sets || sets.length === 0) return null;
        if (trackedMetricDefs.length === 0) return null;
        return computeAutoAggregations(sets, trackedMetricDefs);
    }, [activeProgress, sets, trackedMetricDefs]);

    if (!autoAgg) return null;

    const yieldEligible = canComputeYield(trackedMetricDefs);
    const hasYield = yieldEligible && autoAgg.total_yield != null;
    const hasAdditive = Object.keys(autoAgg.additive_totals).length > 0;
    const hasBestSet = autoAgg.best_set_index != null;

    if (!hasYield && !hasAdditive && !hasBestSet) return null;

    // Previous total yield for delta display
    const prevYield = (() => {
        if (!activeProgress?.metric_comparisons) return null;
        const yieldComp = activeProgress.metric_comparisons.find((mc) => mc.type === 'yield');
        return yieldComp?.previous_value ?? null;
    })();

    const isFirstInstance = activeProgress?.is_first_instance;

    const bestSetLabel = hasBestSet
        ? (hasYield && autoAgg.best_set_yield != null
            ? `= ${formatAggValue(autoAgg.best_set_yield)}`
            : trackedMetricDefs
                .filter((md) => autoAgg.best_set_values[md.id] != null)
                .map((md) => `${formatAggValue(autoAgg.best_set_values[md.id])} ${md.unit}`)
                .join(' × ')
        )
        : null;

    return (
        <div className={styles.progressSummary}>
            {hasAdditive && trackedMetricDefs
                .filter((md) => md.is_additive !== false && !md.is_multiplicative && autoAgg.additive_totals[md.id] != null)
                .map((md) => (
                    <div key={md.id} className={`${styles.progressSummaryRow} ${styles.progressSummaryTotal}`}>
                        <span className={styles.progressSummaryLabel}>Total {md.name}:</span>
                        <span className={styles.progressSummaryValue}>
                            {formatAggValue(autoAgg.additive_totals[md.id])} {md.unit}
                        </span>
                    </div>
                ))
            }

            {/* Total yield + best set on one line */}
            {(hasYield || hasBestSet) && (
                <div className={`${styles.progressSummaryRow} ${styles.progressSummaryTotal}`}>
                    {hasYield && (
                        <>
                            <span className={styles.progressSummaryLabel}>Total yield:</span>
                            <span className={styles.progressSummaryValue}>
                                {formatAggValue(autoAgg.total_yield)}
                                {!isFirstInstance && prevYield != null && autoAgg.total_yield != null && (
                                    <SummaryDelta current={autoAgg.total_yield} previous={prevYield} higherIsBetter styles={styles} displayMode={displayMode} />
                                )}
                            </span>
                        </>
                    )}
                    {hasBestSet && bestSetLabel && (
                        <span className={styles.progressSummaryBestSetInline}>
                            · Best: Set {autoAgg.best_set_index + 1} {bestSetLabel}
                        </span>
                    )}
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
