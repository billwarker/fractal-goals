import React from 'react';
import styles from './LandingSkeleton.module.css';

// Shared shimmer placeholder used while the landing examples query is pending,
// so sections keep their final footprint instead of popping in (no CLS).
export default function LandingSkeleton({ height, width, radius, className = '' }) {
    return (
        <div
            className={`${styles.skeleton} ${className}`}
            style={{ height, width, borderRadius: radius }}
            aria-hidden="true"
        />
    );
}
