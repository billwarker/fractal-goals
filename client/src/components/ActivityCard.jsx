import React from 'react';
import Linkify from './atoms/Linkify';
import { formatAverageDuration } from '../utils/durationStats';
import styles from './ActivityCard.module.css';

/**
 * Activity Card Component - Display activity as a tile
 * Supports drag-and-drop to move between groups
 */
function ActivityCard({
    activity,
    instantiationSummary,
    onEdit,
    onDuplicate,
    onDelete,
    isCreating,
    onDragStart,
    isDragging
}) {
    const formatLastUsedDate = (timestamp) => {
        if (!timestamp) return 'Never';
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) return 'Never';
        return date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };
    const instanceCount = instantiationSummary?.instance_count;
    const averageDuration = formatAverageDuration(instantiationSummary?.average_duration_seconds, '—');

    const handleDragStart = (e) => {
        e.dataTransfer.setData('activityId', activity.id);
        e.dataTransfer.effectAllowed = 'move';
        if (onDragStart) onDragStart(activity.id);
    };

    return (
        <div
            className={`${styles.card} ${styles.clickableCard} ${isDragging ? styles.dragging : ''}`}
            onClick={() => onEdit(activity)}
            draggable="true"
            onDragStart={handleDragStart}
            style={{ cursor: 'grab' }}
        >
            {/* Header */}
            <div>
                <h3 className={styles.cardName}>
                    {activity.name}
                </h3>
                {activity.description && (
                    <p className={styles.description}>
                        <Linkify>{activity.description}</Linkify>
                    </p>
                )}
                <div className={styles.metadata}>
                    <span>{instanceCount ?? 0} instance{instanceCount === 1 ? '' : 's'}</span>
                    <span className={styles.metadataSeparator}>•</span>
                    <span>Last used: {formatLastUsedDate(instantiationSummary?.last_used_at)}</span>
                    <span className={styles.metadataSeparator}>•</span>
                    <span>Avg: {averageDuration}</span>
                </div>
            </div>

            {/* Indicators */}
            <div className={styles.indicatorList}>
                {activity.has_sets && (
                    <span className={`${styles.indicator} ${styles.indicatorSets}`}>
                        Sets
                    </span>
                )}
                {activity.has_splits && (
                    <span className={`${styles.indicator} ${styles.indicatorSplits}`}>
                        Splits
                    </span>
                )}
                {(!activity.metric_definitions || activity.metric_definitions.length === 0) && (
                    <span className={`${styles.indicator} ${styles.indicatorNone}`}>
                        No Metrics
                    </span>
                )}
                {activity.metrics_multiplicative && (
                    <span className={`${styles.indicator} ${styles.indicatorMulti}`}>
                        Multiplicative
                    </span>
                )}
                {activity.metric_definitions?.map(m => (
                    <span
                        key={m.id}
                        className={`${styles.indicator} ${styles.indicatorMetric}`}
                    >
                        {m.name} ({m.unit})
                    </span>
                ))}
            </div>

            {/* Action Buttons */}
            <div className={styles.actionList} onClick={(e) => e.stopPropagation()}>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDuplicate(activity);
                    }}
                    disabled={isCreating}
                    className={styles.ghostAction}
                    title="Copy this activity"
                >
                    Duplicate
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(activity);
                    }}
                    className={styles.deleteAction}
                >
                    Delete
                </button>
            </div>
        </div>
    );
}

export default ActivityCard;
