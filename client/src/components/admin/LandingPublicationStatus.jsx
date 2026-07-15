import React from 'react';
import styles from '../../pages/Admin.module.css';

const formatDate = (value) => value ? new Date(value).toLocaleString() : 'Never';

const formatBytes = (bytes) => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = Number(bytes) || 0;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }
    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

export function LandingPublicationSummary({ publishedAt, publishedCount, delivery }) {
    return (
        <div className={styles.landingExamplesPublishMeta}>
            <span>Published</span>
            <strong>{formatDate(publishedAt)}</strong>
            <span>{publishedCount || 0} examples live</span>
            {delivery?.status && (
                <span>
                    Delivery: {delivery.status === 'delivered' ? 'static verified' : 'API only'}
                    {Number.isFinite(delivery.compressed_snapshot_bytes)
                        ? ` · ${formatBytes(delivery.compressed_snapshot_bytes)} transfer`
                        : ''}
                    {Number.isFinite(delivery.snapshot_bytes)
                        ? ` · ${formatBytes(delivery.snapshot_bytes)} expanded`
                        : ''}
                </span>
            )}
        </div>
    );
}

export function LandingPublicDataNotice() {
    return (
        <p className={styles.landingPublicDataNotice}>
            Publishing makes the selected fractals publicly downloadable, including the bounded goal tree,
            notes, timelines, sessions, activities, programs, targets, and analytics included in the preview.
            Review each example before publishing.
        </p>
    );
}
