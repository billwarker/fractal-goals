import styles from './ActivitySummaryRail.module.css';

/**
 * Shared horizontal summary for derived activity-instance metrics.
 * Each label/value pair stays together while the rail wraps between metrics.
 */
function ActivitySummaryRail({ metrics, compact = false, ariaLabel = 'Activity summary metrics' }) {
    const visibleMetrics = (metrics || []).filter((metric) => metric?.value != null);
    if (visibleMetrics.length === 0) return null;

    return (
        <dl
            className={`${styles.rail} ${compact ? styles.compact : ''}`.trim()}
            aria-label={ariaLabel}
        >
            {visibleMetrics.map((metric) => (
                <div key={metric.key} className={`${styles.metric} ${metric.muted ? styles.muted : ''}`.trim()}>
                    <dt className={styles.label}>{metric.label}</dt>
                    <dd className={styles.value}>{metric.value}</dd>
                </div>
            ))}
        </dl>
    );
}

export default ActivitySummaryRail;
