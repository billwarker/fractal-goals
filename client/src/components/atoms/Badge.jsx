import React from 'react';

import styles from './Badge.module.css';

/**
 * Badge - canonical pill/tag/chip primitive for compact status, type, and
 * metadata labels.
 */
function Badge({
    children,
    className = '',
    variant = 'neutral',
    size = 'md',
    pill = true,
    leftIcon,
    ...props
}) {
    const variantClass = styles[variant] || styles.neutral;
    const sizeClass = styles[size] || styles.md;

    return (
        <span
            className={`${styles.badge} ${variantClass} ${sizeClass} ${pill ? styles.pill : ''} ${className}`.trim()}
            {...props}
        >
            {leftIcon && <span className={styles.leftIcon} aria-hidden="true">{leftIcon}</span>}
            {children}
        </span>
    );
}

export default Badge;
