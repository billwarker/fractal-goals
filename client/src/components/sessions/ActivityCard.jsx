/**
 * ActivityCard - Individual activity-instance card for session display
 *
 * Displays activity name, completion status, duration, and metrics/sets.
 * Optimized with React.memo for list rendering performance.
 */

import React, { memo, useMemo } from 'react';
import CompletionCheckBadge from '../common/CompletionCheckBadge';
import { formatShortDuration } from '../../hooks/useSessionDuration';
import styles from './ActivityCard.module.css';

/**
 * Helper to get metric definition info
 */
function getMetricInfo(metricId, activityDefinition) {
    if (!activityDefinition) return { name: '', unit: '' };
    const metric = activityDefinition.metric_definitions?.find(md => md.id === metricId);
    return metric || { name: '', unit: '' };
}

function formatProgressValue(comparison) {
    if (!comparison) return null;
    if (comparison.pct_change != null) {
        const magnitude = Math.abs(comparison.pct_change);
        const formatted = Number.isInteger(magnitude) ? String(magnitude) : magnitude.toFixed(1).replace(/\.0$/, '');
        if (comparison.improved) return `▲${formatted}%`;
        if (comparison.regressed) return `▼${formatted}%`;
        return '0%';
    }
    if (comparison.delta == null) return null;
    const delta = Number(comparison.delta);
    const magnitude = Math.abs(delta);
    const formatted = Number.isInteger(magnitude) ? String(magnitude) : magnitude.toFixed(1).replace(/\.0$/, '');
    if (delta > 0) return `+${formatted}`;
    if (delta < 0) return `-${formatted}`;
    return '0';
}

function ProgressHint({ metricId, setIndex = null, progressComparison }) {
    if (!progressComparison || progressComparison.is_first_instance) return null;

    const metricComp = progressComparison.metric_comparisons?.find(
        (mc) => mc.metric_id === metricId
    );
    if (!metricComp) return null;

    // For set rows: prefer per-set data, fall back to aggregate on all sets
    if (setIndex != null) {
        const setComps = metricComp.set_comparisons;
        if (Array.isArray(setComps) && setComps.length > 0) {
            const setComp = setComps.find((sc) => sc.set_index === setIndex);
            if (!setComp || setComp.previous_value == null) return null;
            const value = formatProgressValue(setComp);
            if (!value) return null;
            const cls = setComp.improved
                ? styles.progressHintImproved
                : setComp.regressed
                    ? styles.progressHintRegressed
                    : styles.progressHintNeutral;
            return <span className={`${styles.progressHint} ${cls}`}>({value})</span>;
        }
        // No per-set data (older record) — show aggregate hint on every set row
        const value = formatProgressValue(metricComp);
        if (!value) return null;
        const cls = metricComp.improved
            ? styles.progressHintImproved
            : metricComp.regressed
                ? styles.progressHintRegressed
                : styles.progressHintNeutral;
        return <span className={`${styles.progressHint} ${cls}`}>({value})</span>;
    }

    // Single metric (no sets)
    const value = formatProgressValue(metricComp);
    if (!value) return null;
    const cls = metricComp.improved
        ? styles.progressHintImproved
        : metricComp.regressed
            ? styles.progressHintRegressed
            : styles.progressHintNeutral;
    return <span className={`${styles.progressHint} ${cls}`}>({value})</span>;
}

/**
 * Helper to get split definition info
 */
function getSplitInfo(splitId, activityDefinition) {
    if (!activityDefinition || !splitId) return { name: '' };
    const split = activityDefinition.split_definitions?.find(sd => sd.id === splitId);
    return split || { name: '' };
}

/**
 * Renders a single set with metrics
 */
function SetRow({ set, setIdx, activityDefinition, hasSplits, progressComparison }) {
    const metricsToDisplay = useMemo(() => {
        return set.metrics?.filter(m => {
            const mInfo = getMetricInfo(m.metric_id, activityDefinition);
            if (hasSplits) {
                return mInfo.name && m.value && m.split_id;
            }
            return mInfo.name && m.value && !m.split_id;
        }) || [];
    }, [set.metrics, activityDefinition, hasSplits]);

    if (hasSplits) {
        // Group by split
        const metricsBySplit = {};
        metricsToDisplay.forEach(m => {
            if (!metricsBySplit[m.split_id]) {
                metricsBySplit[m.split_id] = [];
            }
            metricsBySplit[m.split_id].push(m);
        });

        return (
            <div className={`${styles.setRow} ${styles.setRowStart}`}>
                <span className={`${styles.setLabel} ${styles.setLabelWithTopPadding}`}>
                    SET {setIdx + 1}
                </span>
                <div className={styles.metricsGroup}>
                    {Object.entries(metricsBySplit).map(([splitId, metrics]) => {
                        const sInfo = getSplitInfo(splitId, activityDefinition);
                        return (
                            <div key={splitId} className={styles.splitGroup}>
                                <div className={styles.splitHeader}>{sInfo.name}</div>
                                <div className={styles.splitMetricsList}>
                                    {metrics.map(m => {
                                        const mInfo = getMetricInfo(m.metric_id, activityDefinition);
                                        return (
                                            <div key={m.metric_id} className={styles.metricItem}>
                                                <span className={styles.metricName}>{mInfo.name}:</span>
                                                <span className={styles.metricValue}>{m.value} {mInfo.unit}</span>
                                                <ProgressHint
                                                    metricId={m.metric_id}
                                                    setIndex={setIdx}
                                                    progressComparison={progressComparison}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    // No splits - horizontal layout
    return (
        <div className={styles.setRow}>
            <span className={styles.setLabel}>SET {setIdx + 1}</span>
            {metricsToDisplay.map(m => {
                const mInfo = getMetricInfo(m.metric_id, activityDefinition);
                return (
                    <div key={m.metric_id} className={styles.metricItem}>
                        <span className={styles.metricName}>{mInfo.name}:</span>
                        <span className={styles.metricValue}>{m.value} {mInfo.unit}</span>
                        <ProgressHint
                            metricId={m.metric_id}
                            setIndex={setIdx}
                            progressComparison={progressComparison}
                        />
                    </div>
                );
            })}
        </div>
    );
}

/**
 * Renders single metrics (no sets)
 */
function SingleMetrics({ activity, activityDefinition, progressComparison }) {
    const hasSplits = activityDefinition?.has_splits && activityDefinition?.split_definitions?.length > 0;

    const filteredMetrics = useMemo(() => {
        return activity.metrics?.filter(m => {
            const mInfo = getMetricInfo(m.metric_id, activityDefinition);
            if (hasSplits) {
                return mInfo.name && m.value && m.split_id;
            }
            return mInfo.name && m.value && !m.split_id;
        }) || [];
    }, [activity.metrics, activityDefinition, hasSplits]);

    if (filteredMetrics.length === 0) return null;

    return (
        <div className={styles.singleMetricsContainer}>
            {filteredMetrics.map(m => {
                const mInfo = getMetricInfo(m.metric_id, activityDefinition);
                const sInfo = getSplitInfo(m.split_id, activityDefinition);
                return (
                    <div key={`${m.metric_id}-${m.split_id || 'no-split'}`} className={styles.metricBadge}>
                        <span className={styles.metricBadgeLabel}>
                            {sInfo.name ? `${sInfo.name} - ${mInfo.name}` : mInfo.name}:
                        </span>
                        <span className={styles.metricValue}>{m.value} {mInfo.unit}</span>
                        <ProgressHint
                            metricId={m.metric_id}
                            progressComparison={progressComparison}
                        />
                    </div>
                );
            })}
        </div>
    );
}

/**
 * Main ActivityCard component
 */
const ActivityCard = memo(function ActivityCard({
    activity,
    activityDefinition
}) {
    const hasSplits = activityDefinition?.has_splits && activityDefinition?.split_definitions?.length > 0;
    const isActivity = activity.type === 'activity';
    const hasSets = activity.has_sets ?? Boolean(activity.sets?.length);
    const progressComparison = activity.progress_comparison || null;

    return (
        <div className={`${styles.activityCard} ${isActivity ? styles.activityCardInstance : ''}`}>
            {/* Header */}
            <div className={styles.activityHeader}>
                {activity.completed ? (
                    <CompletionCheckBadge className={styles.completionBadge} label="Completed activity" />
                ) : (
                    <span className={styles.completionIcon} aria-hidden="true">○</span>
                )}
                <div className={styles.content}>
                    <div className={styles.activityTitleRow}>
                        <div className={styles.activityName}>
                            {activity.name}
                        </div>

                        {/* Duration for activities */}
                        {activity.instance_id && activity.duration_seconds != null && (
                            <div className={styles.activityDuration}>
                                {formatShortDuration(activity.duration_seconds)}
                            </div>
                        )}
                    </div>

                    {/* Activity Data Display */}
                    {isActivity && (
                        <div className={styles.activityData}>
                            {/* Sets View */}
                            {hasSets && activity.sets?.length > 0 && (
                                <div className={styles.setsContainer}>
                                    {activity.sets.map((set, setIdx) => (
                                        <SetRow
                                            key={setIdx}
                                            set={set}
                                            setIdx={setIdx}
                                            activityDefinition={activityDefinition}
                                            hasSplits={hasSplits}
                                            progressComparison={progressComparison}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Single Metrics View */}
                            {!hasSets && activityDefinition?.metric_definitions?.length > 0 && activity.metrics && (
                                <SingleMetrics
                                    activity={activity}
                                    activityDefinition={activityDefinition}
                                    progressComparison={progressComparison}
                                />
                            )}
                        </div>
                    )}

                    {/* Description */}
                    {activity.description && (
                        <div className={styles.description}>
                            {activity.description}
                        </div>
                    )}

                    {/* Notes */}
                    {activity.notes && (
                        <div className={styles.notes}>
                            💡 {activity.notes}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export default ActivityCard;
