/**
 * Progress summary + delta presentational components for session activity items.
 * Extracted from SessionActivityItem.jsx (audit P1-5) — no behavior change.
 */
import { useMemo } from 'react';

import {
    computeAutoAggregations,
    filterTrackedMetricDefs,
} from '../../utils/progressAggregations';
import { relativeDelta } from '../../utils/planComparison';
import ActivitySummaryRail from '../common/ActivitySummaryRail';
import { buildActivitySummaryMetrics } from '../common/activitySummaryMetrics';
import styles from './SessionActivityItem.module.css';

/**
 * Progress summary shown below sets: additive totals, yield, best set.
 */
function SessionActivityProgressSummary({ sets, metricDefs, activeProgress, displayMode = 'percent' }) {
    // An overridden comparison is always visible so changed ▲/▼ hints are never a surprise.
    const context = activeProgress?.comparison_context;
    const overrideLabel = context?.mode === 'all'
        ? 'Comparing with all history'
        : context?.mode === 'tags'
            ? `Comparing with ${context.tags?.length ? context.tags.map((tag) => tag.name).join(' + ') : 'untagged'} sessions`
            : null;
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

    if (!autoAgg && !overrideLabel) return null;

    // Previous total yield for delta display
    const prevYield = (() => {
        if (!activeProgress?.metric_comparisons) return null;
        const yieldComp = activeProgress.metric_comparisons.find((mc) => mc.type === 'yield');
        return yieldComp?.previous_value ?? null;
    })();
    const isFirstInstance = activeProgress?.is_first_instance;
    const summaryMetrics = buildActivitySummaryMetrics(autoAgg, trackedMetricDefs, {
        deltaFor: (key) => (key === 'yield' && !isFirstInstance && prevYield != null ? (
            <SummaryDelta current={autoAgg.total_yield} previous={prevYield} higherIsBetter styles={styles} displayMode={displayMode} />
        ) : null),
    });

    if (!summaryMetrics.length && !overrideLabel) return null;

    return (
        <div className={styles.progressSummary}>
            <ActivitySummaryRail metrics={summaryMetrics} />
            {overrideLabel && (
                <div className={styles.progressExcluded} role="note">
                    {overrideLabel}. Change it in the Progress panel.
                </div>
            )}
        </div>
    );
}

function SummaryDelta({ current, previous, higherIsBetter = true, styles, displayMode = 'percent' }) {
    const change = relativeDelta(current, previous, { higherIsBetter, mode: displayMode });
    if (!change) return null;
    const cls = change.improved ? styles.metricInlineProgressImproved : styles.metricInlineProgressRegressed;
    return <span className={`${styles.metricInlineProgress} ${cls}`}> ({change.label})</span>;
}

export default SessionActivityProgressSummary;
export { SummaryDelta };
