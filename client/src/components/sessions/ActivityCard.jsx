/**
 * ActivityCard - Individual activity-instance card for session display
 *
 * Displays activity name, completion status, duration, and metrics/sets.
 * Optimized with React.memo for list rendering performance.
 */

import React, { memo, useMemo } from 'react';
import { LightbulbIcon } from '../atoms/AppIcons';
import CompletionCheckBadge from '../common/CompletionCheckBadge';
import { formatShortDuration } from '../../hooks/useSessionDuration';
import { resolveEffectiveDeltaDisplayMode } from '../../hooks/useEffectiveDeltaDisplayMode';
import { getAverageDurationStat } from '../../utils/durationStats';
import { getGroupBreadcrumb } from '../../utils/manageActivities';
import {
    canComputeYield,
    computeAutoAggregations,
    filterTrackedMetricDefs,
    formatAggValue,
} from '../../utils/progressAggregations';
import styles from './ActivityCard.module.css';
import ActivityTagBadges from '../common/ActivityTagBadges';
import ActivitySummaryRail from '../common/ActivitySummaryRail';
import ProgressHint from '../common/ProgressHint';

/**
 * Helper to get metric definition info
 */
function getMetricInfo(metricId, activityDefinition) {
    if (!activityDefinition) return { name: '', unit: '' };
    const metric = activityDefinition.metric_definitions?.find(md => md.id === metricId);
    return metric || { name: '', unit: '' };
}

/**
 * Progress summary bar: totals, yield, and best set.
 * Rendered below set rows for set-based activities.
 */
function ActivityProgressSummary({ sets, activityDefinition, progressComparison, precomputedAutoAgg, displayMode = 'percent' }) {
    const metricDefs = useMemo(() => activityDefinition?.metric_definitions || [], [activityDefinition?.metric_definitions]);
    const trackedMetricDefs = useMemo(() => filterTrackedMetricDefs(metricDefs), [metricDefs]);

    // Use the server-calculated active-view summary, with a local raw-data fallback.
    const autoAgg = useMemo(() => {
        if (precomputedAutoAgg) return precomputedAutoAgg;
        const fromRecord = progressComparison?.derived_summary?.auto_aggregations;
        if (fromRecord) return fromRecord;
        if (!sets || sets.length === 0) return null;
        if (trackedMetricDefs.length === 0) return null;
        return computeAutoAggregations(sets, trackedMetricDefs);
    }, [precomputedAutoAgg, progressComparison, sets, trackedMetricDefs]);

    if (!autoAgg) return null;

    const yieldEligible = canComputeYield(trackedMetricDefs);
    const hasYield = yieldEligible && autoAgg.total_yield != null;
    const hasAdditive = Object.keys(autoAgg.additive_totals).length > 0;
    const hasBestSet = autoAgg.best_set_index != null;

    if (!hasYield && !hasAdditive && !hasBestSet) return null;

    // Find previous totals from progress comparison for delta display
    const prevYield = (() => {
        if (!progressComparison?.metric_comparisons) return null;
        const yieldComp = progressComparison.metric_comparisons.find((mc) => mc.type === 'yield');
        return yieldComp?.previous_value ?? null;
    })();

    // Build best set label
    const bestSetLabel = hasBestSet
        ? (hasYield && autoAgg.best_set_yield != null
            ? `${formatAggValue(autoAgg.best_set_yield)}`
            : trackedMetricDefs
                .filter((md) => autoAgg.best_set_values?.[md.id] != null)
                .map((md) => `${formatAggValue(autoAgg.best_set_values[md.id])} ${md.unit}`)
                .join(' × ')
        )
        : null;

    const summaryMetrics = [];
    if (hasYield) {
        summaryMetrics.push({
            key: 'yield',
            label: 'Yield:',
            value: (
                <>
                    {formatAggValue(autoAgg.total_yield)}
                    {prevYield != null && autoAgg.total_yield != null && (
                        <TotalDelta current={autoAgg.total_yield} previous={prevYield} higherIsBetter displayMode={displayMode} />
                    )}
                </>
            ),
        });
    }
    if (hasBestSet && bestSetLabel) {
        summaryMetrics.push({
            key: 'best-set',
            label: `Best S${autoAgg.best_set_index + 1}:`,
            value: bestSetLabel,
        });
    }
    if (hasAdditive) {
        trackedMetricDefs
            .filter((md) => md.is_additive !== false && autoAgg.additive_totals[md.id] != null)
            .forEach((md) => summaryMetrics.push({
                key: `total-${md.id}`,
                label: `Total ${md.name}:`,
                value: `${formatAggValue(autoAgg.additive_totals[md.id])} ${md.unit}`,
            }));
    }

    return <ActivitySummaryRail metrics={summaryMetrics} compact />;
}

function TotalDelta({ current, previous, higherIsBetter = true, displayMode = 'percent' }) {
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
    const cls = improved ? styles.progressHintImproved : styles.progressHintRegressed;
    return <span className={`${styles.progressHint} ${cls}`}> ({label})</span>;
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
function SetRow({ set, setIdx, activityDefinition, hasSplits, progressComparison, setYield, displayMode = 'percent' }) {
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
                                                    displayMode={displayMode}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <ActivityTagBadges tags={set.tags} className={styles.setTags} ariaLabel={`Set ${setIdx + 1} tags`} />
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
                            displayMode={displayMode}
                        />
                    </div>
                );
            })}
            <ActivityTagBadges tags={set.tags} className={styles.setTags} ariaLabel={`Set ${setIdx + 1} tags`} />
            {setYield != null && (
                <span className={styles.setYieldInline}>= {formatAggValue(setYield)}</span>
            )}
        </div>
    );
}

/**
 * Renders single metrics (no sets)
 */
function SingleMetrics({ activity, activityDefinition, progressComparison, displayMode = 'percent' }) {
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
                            displayMode={displayMode}
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
    activityDefinition,
    activityGroups = [],
    sessionStats = null,
    deltaDisplayMode = 'percent',
}) {
    const effectiveDeltaDisplayMode = resolveEffectiveDeltaDisplayMode(
        activityDefinition,
        { delta_display_mode: deltaDisplayMode },
    );
    const hasSplits = activityDefinition?.has_splits && activityDefinition?.split_definitions?.length > 0;
    const isActivity = activity.type === 'activity';
    const hasSets = activity.has_sets ?? Boolean(activity.sets?.length);
    const progressComparison = activity.progress_comparison || null;
    const activityCompleted = Boolean(activity.completed ?? activity.attributes?.completed ?? activity.time_stop);
    const activityPaused = Boolean(activity.is_paused ?? activity.attributes?.is_paused);
    const activityInProgress = !activityCompleted && !activityPaused && Boolean(activity.time_start);
    const activityDefinitionId = activityDefinition?.id || activity.activity_definition_id || activity.activity_id || null;
    let activityStatusLabel = 'Incomplete activity';
    if (activityPaused) {
        activityStatusLabel = 'Paused activity';
    } else if (activityCompleted) {
        activityStatusLabel = 'Completed activity';
    } else if (activityInProgress) {
        activityStatusLabel = 'In-progress activity';
    }

    const metricDefs = useMemo(() => activityDefinition?.metric_definitions || [], [activityDefinition?.metric_definitions]);
    const trackedMetricDefs = useMemo(() => filterTrackedMetricDefs(metricDefs), [metricDefs]);
    const autoAgg = useMemo(() => {
        if (!hasSets || !activity.sets?.length) return null;
        const fromRecord = progressComparison?.derived_summary?.auto_aggregations;
        if (fromRecord) return fromRecord;
        if (trackedMetricDefs.length === 0) return null;
        return computeAutoAggregations(activity.sets, trackedMetricDefs);
    }, [hasSets, activity.sets, progressComparison, trackedMetricDefs]);

    const yieldBySetIndex = useMemo(() => {
        if (!canComputeYield(trackedMetricDefs)) return null;
        if (!autoAgg?.yield_per_set?.length) return null;
        const map = {};
        for (const { set_index, yield: y } of autoAgg.yield_per_set) {
            map[set_index] = y;
        }
        return map;
    }, [autoAgg, trackedMetricDefs]);
    const groupLabel = useMemo(() => {
        const groupId = activityDefinition?.group_id || activity.group_id || null;
        if (groupId && Array.isArray(activityGroups) && activityGroups.length > 0) {
            const breadcrumb = getGroupBreadcrumb(groupId, activityGroups);
            if (breadcrumb) return breadcrumb;
        }
        return activity.group_name || null;
    }, [activity.group_id, activity.group_name, activityDefinition?.group_id, activityGroups]);
    const averageDuration = useMemo(
        () => getAverageDurationStat(sessionStats?.activity_durations?.[activityDefinitionId]),
        [activityDefinitionId, sessionStats?.activity_durations]
    );

    return (
        <div className={`${styles.activityCard} ${isActivity ? styles.activityCardInstance : ''}`}>
            {/* Header */}
            <div className={styles.activityHeader}>
                <CompletionCheckBadge
                    checked={activityCompleted}
                    inProgress={activityInProgress}
                    paused={activityPaused}
                    className={styles.completionBadge}
                    label={activityStatusLabel}
                />
                <div className={styles.content}>
                    {(groupLabel || averageDuration) && (
                        <div className={styles.activityMetaLine}>
                            {groupLabel && (
                                <span className={styles.activityGroupLabel}>{groupLabel}</span>
                            )}
                            {groupLabel && averageDuration && (
                                <span className={styles.activityMetaSeparator}>•</span>
                            )}
                            {averageDuration && (
                                <span
                                    className={styles.activityAverage}
                                    title={`Average based on ${averageDuration.sampleCount} completed activity instances`}
                                >
                                    Avg {averageDuration.label}
                                </span>
                            )}
                        </div>
                    )}
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
                    <ActivityTagBadges tags={activity.tags} className={styles.activityTags} ariaLabel="Activity tags" />

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
                                            setYield={yieldBySetIndex?.[setIdx] ?? null}
                                            displayMode={effectiveDeltaDisplayMode}
                                        />
                                    ))}
                                    <ActivityProgressSummary
                                        sets={activity.sets}
                                        activityDefinition={activityDefinition}
                                        progressComparison={progressComparison}
                                        precomputedAutoAgg={autoAgg}
                                        displayMode={effectiveDeltaDisplayMode}
                                    />
                                </div>
                            )}

                            {/* Single Metrics View */}
                            {!hasSets && activityDefinition?.metric_definitions?.length > 0 && activity.metrics && (
                                <SingleMetrics
                                    activity={activity}
                                    activityDefinition={activityDefinition}
                                    progressComparison={progressComparison}
                                    displayMode={effectiveDeltaDisplayMode}
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
                            <LightbulbIcon size={14} />
                            <span>{activity.notes}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export default ActivityCard;
