import React from 'react';
import styles from './StepHeader.module.css';

/**
 * Reusable step header with numbered badge
 * Used across CreateSession flow for consistent visual styling. Without a ``stepNumber`` it is
 * an unnumbered section heading in the same style (an optional shortcut beside the steps).
 */
function StepHeader({ stepNumber = null, title, subtitle, id }) {
    return (
        <div className={styles.header}>
            <h2 className={styles.title} id={id}>
                {stepNumber != null ? (
                    <span className={styles.stepNumber} aria-hidden="true">{stepNumber}</span>
                ) : null}
                {title}
            </h2>
            {subtitle && (
                <p className={`${styles.subtitle} ${stepNumber == null ? styles.subtitleUnnumbered : ''}`.trim()}>{subtitle}</p>
            )}
        </div>
    );
}

export default StepHeader;
