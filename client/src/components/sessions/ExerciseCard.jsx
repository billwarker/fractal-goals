/**
 * ExerciseCard - Individual exercise/activity card for session display
 * 
 * Displays exercise name, completion status, duration, and metrics/sets.
 * Optimized with React.memo for list rendering performance.
 */

import React, { memo, useMemo } from 'react';
import { formatShortDuration } from '../../hooks/useSessionDuration';
import styles from './ExerciseCard.module.css';

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
            <div className={styles.setRow} style={{ alignItems: 'start' }}>
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
function SingleMetrics({ exercise, activityDefinition }) {
    const hasSplits = activityDefinition?.has_splits && activityDefinition?.split_definitions?.length > 0;

    const filteredMetrics = useMemo(() => {
        return exercise.metrics?.filter(m => {
            const mInfo = getMetricInfo(m.metric_id, activityDefinition);
            if (hasSplits) {
                return mInfo.name && m.value && m.split_id;
            }
            return mInfo.name && m.value && !m.split_id;
        }) || [];
    }, [exercise.metrics, activityDefinition, hasSplits]);

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
 * Main ExerciseCard component
 */
const ExerciseCard = memo(function ExerciseCard({
    exercise,
    activityDefinition
}) {
    const hasSplits = activityDefinition?.has_splits && activityDefinition?.split_definitions?.length > 0;
    const isActivity = exercise.type === 'activity';

    return (
        <div className={`${styles.exerciseCard} ${isActivity ? styles.exerciseCardActivity : ''}`}>
            {/* Header */}
            <div className={styles.exerciseHeader}>
                <span className={`${styles.completionIcon} ${exercise.completed ? styles.completionIconCompleted : ''}`}>
                    {exercise.completed ? '✓' : '○'}
                </span>
                <div style={{ flex: 1 }}>
                    <div className={styles.exerciseTitleRow}>
                        <div className={styles.exerciseName}>
                            {exercise.name}
                        </div>

                        {/* Duration for activities */}
                        {exercise.instance_id && exercise.duration_seconds != null && (
                            <div className={styles.activityDuration}>
                                {formatShortDuration(exercise.duration_seconds)}
                            </div>
                        )}
                    </div>

                    {/* Activity Data Display */}
                    {isActivity && (
                        <div className={styles.activityData}>
                            {/* Sets View */}
                            {exercise.has_sets && exercise.sets?.length > 0 && (
                                <div className={styles.setsContainer}>
                                    {exercise.sets.map((set, setIdx) => (
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
                            {!exercise.has_sets && activityDefinition?.metric_definitions?.length > 0 && exercise.metrics && (
                                <SingleMetrics
                                    exercise={exercise}
                                    activityDefinition={activityDefinition}
                                />
                            )}
                        </div>
                    )}

                    {/* Description */}
                    {exercise.description && (
                        <div className={styles.description}>
                            {exercise.description}
                        </div>
                    )}

                    {/* Notes */}
                    {exercise.notes && (
                        <div className={styles.notes}>
                            💡 {exercise.notes}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export default ExerciseCard;
