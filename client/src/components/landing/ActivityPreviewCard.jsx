import React from 'react';
import styles from './LandingFeaturesSection.module.css';

function getMetricSummary(activity) {
    const metrics = activity?.metric_definitions || [];
    if (!metrics.length) return ['Duration'];
    return metrics
        .slice(0, 4)
        .map((metric) => [metric.name, metric.unit].filter(Boolean).join(' '));
}

export default function ActivityPreviewCard({ activity }) {
    if (!activity) {
        return (
            <article className={styles.previewCard}>
                <h4>No activity snapshot</h4>
                <p>Publish an example with associated activities to fill this card.</p>
            </article>
        );
    }

    return (
        <article className={styles.previewCard}>
            <h4>{activity.name}</h4>
            {activity.description ? <p>{activity.description}</p> : null}
            <div className={styles.chipRow}>
                {getMetricSummary(activity).map((metric) => (
                    <span className={styles.previewChip} key={metric}>{metric}</span>
                ))}
            </div>
        </article>
    );
}
