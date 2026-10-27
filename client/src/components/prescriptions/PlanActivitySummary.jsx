import React, { useMemo } from 'react';
import ActivitySummaryRail from '../common/ActivitySummaryRail';
import { buildActivitySummaryMetrics } from '../common/activitySummaryMetrics';
import { formatCopyDate } from '../../utils/planCopy';
import { computeAutoAggregations, filterTrackedMetricDefs } from '../../utils/progressAggregations';
import { deltaTone } from './PlanDeltaChip';
import styles from './PlanComparison.module.css';

/**
 * A planned (or logged) activity's summary under its sets, as on the session page: each
 * additive total, total yield, and the best set. With a comparison (`compared`, from
 * `comparePrescriptions`), totals show their change from the compared plan and fewer sets
 * than it are noted.
 */
export default function PlanActivitySummary({ value, definition, compared = null, comparisonDate = null, alignKey }) {
    const tracked = useMemo(
        () => filterTrackedMetricDefs(
            (definition?.metric_definitions || []).filter((metric) => metric.is_active !== false && !metric.deleted_at),
        ),
        [definition],
    );
    const sets = value?.sets;
    const autoAgg = useMemo(
        () => (sets?.length && tracked.length ? computeAutoAggregations(sets, tracked) : null),
        [sets, tracked],
    );
    const from = comparisonDate ? formatCopyDate(comparisonDate) : null;
    const changeByKey = new Map((compared?.totals || []).map((total) => [
        total.key === 'yield' ? 'yield' : `total-${total.key}`,
        total.change,
    ]));
    const metrics = buildActivitySummaryMetrics(autoAgg, tracked, {
        deltaFor: (key) => {
            const change = changeByKey.get(key);
            return change ? (
                <span className={`${styles.delta} ${deltaTone(change)}`} title={from ? `vs ${from}` : undefined}>
                    {' '}({change.label})
                </span>
            ) : null;
        },
    });
    const removed = compared?.removedSets || 0;
    if (removed) {
        metrics.push({
            key: 'removed-sets',
            label: from ? `vs ${from}:` : 'vs before:',
            value: `−${removed} set${removed === 1 ? '' : 's'}`,
            muted: true,
        });
    }
    if (!metrics.length) return null;
    return (
        <div className={styles.summary} data-align-key={alignKey}>
            <ActivitySummaryRail metrics={metrics} />
        </div>
    );
}
