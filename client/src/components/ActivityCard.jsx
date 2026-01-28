import React from 'react';
import styles from './ActivityCard.module.css';

/**
 * Activity Card Component - Display activity as a tile
 */
function ActivityCard({ activity, lastInstantiated, onEdit, onDuplicate, onDelete, isCreating }) {
    const formatLastUsed = (timestamp) => {
        if (!timestamp) return 'Never used';

        const now = new Date();
        const then = new Date(timestamp);
        const diffMs = now - then;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
        return `${Math.floor(diffDays / 365)} years ago`;
    };

    return (
        <div className={styles.card}>
            {/* Header */}
            <div>
                <h3 className={styles.cardName}>
                    {activity.name}
                </h3>
                {activity.description && (
                    <p className={styles.description}>
                        {activity.description}
                    </p>
                )}
                <div className={styles.lastUsed}>
                    Last used: {formatLastUsed(lastInstantiated)}
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
            <div className={styles.actionList}>
                <button
                    onClick={() => onEdit(activity)}
                    className={`${styles.actionBtn} ${styles.editBtn}`}
                >
                    Edit
                </button>
                <button
                    onClick={() => onDuplicate(activity)}
                    disabled={isCreating}
                    className={`${styles.actionBtn} ${styles.duplicateBtn}`}
                    title="Duplicate this activity"
                >
                    ⎘
                </button>
                <button
                    onClick={() => onDelete(activity)}
                    className={`${styles.actionBtn} ${styles.deleteBtn}`}
                >
                    Delete
                </button>
            </div>
        </div>
    );
}

export default ActivityCard;
