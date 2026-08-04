import React from 'react';

import { formatAverageDuration } from '../../utils/durationStats';
import styles from './CatalogueUsageMetadata.module.css';


export function formatCatalogueLastUsedDate(timestamp) {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'Never';
    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

export default function CatalogueUsageMetadata({ summary }) {
    const instanceCount = summary?.instance_count ?? 0;
    const averageDuration = formatAverageDuration(summary?.average_duration_seconds, '—');

    return (
        <div className={styles.metadata}>
            <span>{instanceCount} instance{instanceCount === 1 ? '' : 's'}</span>
            <span className={styles.separator}>•</span>
            <span>Last used: {formatCatalogueLastUsedDate(summary?.last_used_at)}</span>
            <span className={styles.separator}>•</span>
            <span>Avg: {averageDuration}</span>
        </div>
    );
}
