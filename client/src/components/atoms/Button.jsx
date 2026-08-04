import React from 'react';

import Spinner from './Spinner';
import styles from './Button.module.css';

/**
 * Standardized Button Component
 * 
 * variants: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost'
 * sizes: 'sm' | 'md' | 'lg'
 * unstyled: preserves button semantics while delegating all visuals to className
 */
const Button = ({
    children,
    variant = 'primary',
    size = 'md',
    className = '',
    disabled = false,
    isLoading = false,
    type = 'button',
    fullWidth = false,
    unstyled = false,
    leftIcon,
    rightIcon,
    ...props
}) => {
    const variantClass = styles[variant] || styles.primary;
    const sizeClass = styles[size] || styles.md;

    return (
        <button
            type={type}
            className={unstyled
                ? className
                : `${styles.button} ${variantClass} ${sizeClass} ${fullWidth ? styles.fullWidth : ''} ${className}`}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading && <Spinner className={styles.loader} size="sm" label="Loading" />}
            {!isLoading && leftIcon && <span className={styles.iconLeft}>{leftIcon}</span>}
            {children}
            {!isLoading && rightIcon && <span className={styles.iconRight}>{rightIcon}</span>}
        </button>
    );
};

export default Button;
