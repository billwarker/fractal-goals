import React from 'react';
import styles from './StepHeader.module.css';

/**
 * Reusable step header with numbered badge
 * Used across CreateSession flow for consistent visual styling
 */
function StepHeader({ stepNumber, title, subtitle }) {
    return (
        <div className={styles.header}>
            <h2 className={styles.title}>
                <span className={styles.stepNumber}>{stepNumber}</span>
                {title}
            </h2>
            {subtitle && (
                <p className={styles.subtitle}>{subtitle}</p>
            )}
        </div>
    );
}

export default StepHeader;
