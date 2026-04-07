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
function SetRow({ set, setIdx, activityDefinition, hasSplits }) {
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
                    </div>
                );
            })}
        </div>
    );
}

/**
 * Renders single metrics (no sets)
 */
function SingleMetrics({ activity, activityDefinition }) {
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
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Single Metrics View */}
                            {!hasSets && activityDefinition?.metric_definitions?.length > 0 && activity.metrics && (
                                <SingleMetrics
                                    activity={activity}
                                    activityDefinition={activityDefinition}
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
