import React from 'react';
import styles from './HeaderButton.module.css';

function HeaderButton({
    children,
    variant = 'secondary',
    className = '',
    type = 'button',
    ...props
}) {
    const variantClass = {
        primary: styles.primary,
        secondary: styles.secondary,
        tertiary: styles.tertiary,
    }[variant] ?? styles.secondary;

    return (
        <button
            type={type}
            className={`${styles.button} ${variantClass} ${className}`.trim()}
            {...props}
        >
            {children}
        </button>
    );
}

export default HeaderButton;
