import React from 'react';

import styles from './IconButton.module.css';

/**
 * IconButton - shared icon-only button primitive. Callers must provide an
 * accessible `aria-label` because the visible content is decorative.
 */
function IconButton({
    children,
    className = '',
    size = 'md',
    variant = 'ghost',
    type = 'button',
    'aria-label': ariaLabel,
    ...props
}) {
    if (!ariaLabel && import.meta.env.DEV) {
        console.warn('IconButton requires an aria-label.');
    }

    const sizeClass = styles[size] || styles.md;
    const variantClass = styles[variant] || styles.ghost;

    return (
        <button
            type={type}
            className={`${styles.iconButton} ${sizeClass} ${variantClass} ${className}`.trim()}
            aria-label={ariaLabel}
            {...props}
        >
            {children}
        </button>
    );
}

export default IconButton;
