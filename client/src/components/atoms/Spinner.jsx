import React from 'react';

import styles from './Spinner.module.css';

/**
 * Spinner - single shared loading spinner and `@keyframes` owner.
 */
function Spinner({ className = '', size = 'md', label = 'Loading', ...props }) {
    const sizeClass = styles[size] || styles.md;

    return (
        <span
            className={`${styles.spinner} ${sizeClass} ${className}`.trim()}
            role="status"
            aria-label={label}
            {...props}
        />
    );
}

export default Spinner;
