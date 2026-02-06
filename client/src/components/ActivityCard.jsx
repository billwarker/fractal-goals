import React from 'react';
import Linkify from './atoms/Linkify';
import styles from './ActivityCard.module.css';

/**
 * Activity Card Component - Display activity as a tile
 * Supports drag-and-drop to move between groups
 */
function ActivityCard({
    activity,
    lastInstantiated,
    onEdit,
    onDuplicate,
    onDelete,
    isCreating,
    onDragStart,
    isDragging
}) {
    const formatLastUsed = (timestamp) => {
        if (!timestamp) return 'Never used';

        const now = new Date();
        const then = new Date(timestamp);
        const diffMs = now - then;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;

        const weeks = Math.floor(diffDays / 7);
        if (diffDays < 30) return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;

        const months = Math.floor(diffDays / 30);
        if (diffDays < 365) return `${months} month${months !== 1 ? 's' : ''} ago`;

        const years = Math.floor(diffDays / 365);
        return `${years} year${years !== 1 ? 's' : ''} ago`;
    };

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
            <div className={styles.actionList} onClick={(e) => e.stopPropagation()}>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onEdit(activity);
                    }}
                    className={`${styles.actionBtn} ${styles.editBtn}`}
                >
                    Edit
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDuplicate(activity);
                    }}
                    disabled={isCreating}
                    className={`${styles.actionBtn} ${styles.duplicateBtn}`}
                    title="Copy this activity"
                    style={{ backgroundColor: '#ff9800' }} // Keep generic orange or use class
                >
                    Copy
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(activity);
                    }}
                    className={`${styles.actionBtn} ${styles.deleteBtn}`}
                >
                    Delete
                </button>
            </div>
        </div>
    );
}

export default ActivityCard;
